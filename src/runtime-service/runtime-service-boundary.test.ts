import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { once } from 'node:events'
import { startStanderRuntimeService } from './server'
import type { AgentRuntime, RunMessageInput } from '../platform/runtime'
import type { SessionEvent } from '../platform/types'

class FakeRuntime implements AgentRuntime {
  abortSignals: AbortSignal[] = []

  async *runMessage(input: RunMessageInput): AsyncIterable<SessionEvent> {
    this.abortSignals.push(input.signal ?? new AbortController().signal)
    yield {
      type: 'agent.text_delta',
      sessionId: input.session.id,
      text: 'hello',
      createdAt: '2026-07-09T00:00:00.000Z',
    }
    yield {
      type: 'agent.message',
      sessionId: input.session.id,
      text: 'hello',
      createdAt: '2026-07-09T00:00:01.000Z',
    }
  }
}

class ThrowBeforeEventRuntime implements AgentRuntime {
  async *runMessage(): AsyncIterable<SessionEvent> {
    throw new Error('runtime failed early')
  }
}

class ThrowAfterEventRuntime implements AgentRuntime {
  async *runMessage(input: RunMessageInput): AsyncIterable<SessionEvent> {
    yield {
      type: 'agent.text_delta',
      sessionId: input.session.id,
      text: 'partial',
      createdAt: '2026-07-09T00:00:00.000Z',
    }
    throw new Error('runtime failed late')
  }
}

class BlockingRuntime implements AgentRuntime {
  signal?: AbortSignal
  private startedResolve!: () => void
  readonly started = new Promise<void>((resolve) => {
    this.startedResolve = resolve
  })
  private finishResolve!: () => void
  readonly finish = new Promise<void>((resolve) => {
    this.finishResolve = resolve
  })

  complete() {
    this.finishResolve()
  }

  async *runMessage(input: RunMessageInput): AsyncIterable<SessionEvent> {
    this.signal = input.signal
    this.startedResolve()
    yield {
      type: 'agent.text_delta',
      sessionId: input.session.id,
      text: 'started',
      createdAt: '2026-07-09T00:00:00.000Z',
    }
    await this.finish
    yield {
      type: 'agent.message',
      sessionId: input.session.id,
      text: 'done',
      createdAt: '2026-07-09T00:00:01.000Z',
    }
  }
}

const tests: Array<{ name: string; fn: () => Promise<void> }> = []

function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn })
}

async function withServer(fn: (baseUrl: string, runtime: FakeRuntime) => Promise<void>) {
  const runtime = new FakeRuntime()
  await withRuntimeServer(runtime, fn)
}

async function withRuntimeServer<T extends AgentRuntime>(
  runtime: T,
  fn: (baseUrl: string, runtime: T) => Promise<void>,
) {
  const server: Server = startStanderRuntimeService({
    runtime,
    token: 'secret-token',
    modelId: 'azure-gpt-o4-mini',
    host: '127.0.0.1',
    port: 0,
  })
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    await fn(`http://127.0.0.1:${address.port}`, runtime)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

async function createSession(baseUrl: string, body: unknown = { modelId: 'azure-gpt-o4-mini' }) {
  const response = await fetch(`${baseUrl}/v1/runtime/sessions`, {
    method: 'POST',
    headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(response.status, 200)
  return (await response.json()) as { sessionId: string }
}

async function readNdjson(response: Response) {
  assert.ok(response.body)
  const text = await response.text()
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
}

test('runtime service rejects missing bearer token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/runtime/sessions`, { method: 'POST' })
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized' })
  })
})

test('runtime service returns 400 for invalid JSON', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: '{',
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Invalid JSON body' })
  })
})

test('runtime service returns 400 for request bodies over the size limit', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: 'x'.repeat(1024 * 1024) }),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Request body too large' })
  })
})

test('runtime service returns 400 for invalid session request bodies', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: 123 }),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Invalid session request' })
  })
})

test('runtime service creates sessions', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: process.cwd(), modelId: 'azure-gpt-o4-mini' }),
    })
    assert.equal(response.status, 200)
    const body = (await response.json()) as { sessionId?: string }
    assert.match(body.sessionId ?? '', /^stander-runtime-/)
  })
})

test('runtime service streams prompt events as ndjson', async () => {
  await withServer(async (baseUrl) => {
    const { sessionId } = await createSession(baseUrl)

    const prompt = await fetch(`${baseUrl}/v1/runtime/sessions/${sessionId}/prompt`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    })

    assert.equal(prompt.status, 200)
    const events = await readNdjson(prompt)
    assert.deepEqual(events, [
      {
        type: 'agent.text_delta',
        sessionId,
        text: 'hello',
        createdAt: '2026-07-09T00:00:00.000Z',
      },
      {
        type: 'agent.message',
        sessionId,
        text: 'hello',
        createdAt: '2026-07-09T00:00:01.000Z',
      },
    ])
  })
})

test('runtime service returns 400 for missing or invalid prompt text', async () => {
  await withServer(async (baseUrl) => {
    const { sessionId } = await createSession(baseUrl)

    for (const body of [{}, { text: '' }, { text: 123 }]) {
      const response = await fetch(`${baseUrl}/v1/runtime/sessions/${sessionId}/prompt`, {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      assert.equal(response.status, 400)
      assert.deepEqual(await response.json(), { error: 'Prompt text is required' })
    }
  })
})

test('runtime service returns 404 for unknown sessions', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/runtime/sessions/missing/prompt`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    })
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'Session not found' })
  })
})

test('runtime service returns 500 JSON when runtime throws before streaming events', async () => {
  await withRuntimeServer(new ThrowBeforeEventRuntime(), async (baseUrl) => {
    const { sessionId } = await createSession(baseUrl)

    const response = await fetch(`${baseUrl}/v1/runtime/sessions/${sessionId}/prompt`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    })

    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'runtime failed early' })
  })
})

test('runtime service streams session.error when runtime throws after first event', async () => {
  await withRuntimeServer(new ThrowAfterEventRuntime(), async (baseUrl) => {
    const { sessionId } = await createSession(baseUrl)

    const response = await fetch(`${baseUrl}/v1/runtime/sessions/${sessionId}/prompt`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    })

    assert.equal(response.status, 200)
    const events = await readNdjson(response)
    assert.equal(events.length, 2)
    assert.deepEqual(events[0], {
      type: 'agent.text_delta',
      sessionId,
      text: 'partial',
      createdAt: '2026-07-09T00:00:00.000Z',
    })
    assert.deepEqual((events[1] as { type: string; sessionId: string; message: string }).type, 'session.error')
    assert.deepEqual((events[1] as { type: string; sessionId: string; message: string }).sessionId, sessionId)
    assert.deepEqual((events[1] as { type: string; sessionId: string; message: string }).message, 'runtime failed late')
    assert.match((events[1] as { createdAt: string }).createdAt, /^\d{4}-\d{2}-\d{2}T/)
  })
})

test('runtime service cancel aborts the active runtime signal', async () => {
  const runtime = new BlockingRuntime()
  await withRuntimeServer(runtime, async (baseUrl) => {
    const { sessionId } = await createSession(baseUrl)
    const promptPromise = fetch(`${baseUrl}/v1/runtime/sessions/${sessionId}/prompt`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    })
    await runtime.started

    const cancel = await fetch(`${baseUrl}/v1/runtime/sessions/${sessionId}/cancel`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
    })
    assert.equal(cancel.status, 200)
    assert.deepEqual(await cancel.json(), { ok: true })
    assert.equal(runtime.signal?.aborted, true)

    runtime.complete()
    const prompt = await promptPromise
    assert.equal(prompt.status, 200)
    await readNdjson(prompt)
  })
})

test('runtime service rejects concurrent prompts for one session', async () => {
  const runtime = new BlockingRuntime()
  await withRuntimeServer(runtime, async (baseUrl) => {
    const { sessionId } = await createSession(baseUrl)
    const firstPrompt = fetch(`${baseUrl}/v1/runtime/sessions/${sessionId}/prompt`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'first' }),
    })
    await runtime.started

    const secondPrompt = await fetch(`${baseUrl}/v1/runtime/sessions/${sessionId}/prompt`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'second' }),
    })
    assert.equal(secondPrompt.status, 409)
    assert.deepEqual(await secondPrompt.json(), { error: 'Prompt already running' })

    runtime.complete()
    const firstResponse = await firstPrompt
    await readNdjson(firstResponse)
  })
})

async function runTests() {
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`ok - ${name}`)
    } catch (error) {
      console.error(`not ok - ${name}`)
      throw error
    }
  }
}

void runTests().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
