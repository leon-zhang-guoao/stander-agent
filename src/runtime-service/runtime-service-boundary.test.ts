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

const tests: Array<{ name: string; fn: () => Promise<void> }> = []

function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn })
}

async function withServer(fn: (baseUrl: string, runtime: FakeRuntime) => Promise<void>) {
  const runtime = new FakeRuntime()
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
    const create = await fetch(`${baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'azure-gpt-o4-mini' }),
    })
    const { sessionId } = (await create.json()) as { sessionId: string }

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

void runTests()
