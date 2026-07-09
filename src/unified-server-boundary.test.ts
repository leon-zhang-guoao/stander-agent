import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { startStanderServer } from './server'
import type { AgentRuntime, RunMessageInput } from './platform/runtime'
import type { SessionEvent } from './platform/types'

class FakeRuntime implements AgentRuntime {
  inputs: RunMessageInput[] = []

  async *runMessage(input: RunMessageInput): AsyncIterable<SessionEvent> {
    this.inputs.push(input)
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

async function withUnifiedServer(fn: (baseUrl: string) => Promise<void>) {
  const runtime = new FakeRuntime()
  const server: Server = startStanderServer({
    host: '127.0.0.1',
    port: 0,
    runtimeToken: 'secret-token',
    runtimeModelId: 'azure-gpt-o4-mini',
    runtime,
  })
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    await fn(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

async function createAgent(baseUrl: string, input: Partial<{
  name: string
  modelProviderId: string
  modelId: string
  baseURL: string
  systemPrompt: string
  tools: string[]
  skills: string[]
}> = {}) {
  const response = await fetch(`${baseUrl}/v1/agents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: input.name ?? 'Runtime Agent',
      modelId: input.modelId ?? 'azure-gpt-o4-mini',
      baseURL: input.baseURL ?? 'https://example.invalid/v1',
      systemPrompt: input.systemPrompt ?? 'You are a managed Stander agent.',
      tools: input.tools ?? [],
      skills: input.skills ?? [],
      ...(input.modelProviderId ? { modelProviderId: input.modelProviderId } : {}),
    }),
  })
  assert.equal(response.status, 201)
  return response.json() as Promise<{ id: string }>
}

test('unified server keeps manager APIs available and serves static UI', async () => {
  await withUnifiedServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`)
    assert.equal(health.status, 200)
    assert.equal((await health.json() as { ok: boolean }).ok, true)

    const home = await fetch(`${baseUrl}/`)
    assert.equal(home.status, 200)
    assert.match(home.headers.get('content-type') ?? '', /text\/html/)

    const status = await fetch(`${baseUrl}/v1/platform/status`)
    assert.equal(status.status, 200)
    assert.equal(typeof (await status.json() as { persistence: string }).persistence, 'string')

    for (const path of [
      '/v1/model-providers',
      '/v1/mcp-servers',
      '/v1/agents',
      '/v1/tools',
      '/v1/skills',
      '/v1/sessions',
      '/v1/workflows',
      '/v1/workflow-templates',
    ]) {
      const response = await fetch(`${baseUrl}${path}`)
      assert.equal(response.status, 200, path)
    }
  })
})

test('unified server exposes runtime API on the same port without changing manager auth', async () => {
  await withUnifiedServer(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/v1/runtime/sessions`, { method: 'POST' })
    assert.equal(unauthorized.status, 401)
    assert.deepEqual(await unauthorized.json(), { error: 'Unauthorized' })

    const managerStatus = await fetch(`${baseUrl}/v1/platform/status`)
    assert.equal(managerStatus.status, 200)

    const sessionResponse = await fetch(`${baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: '.', modelId: 'azure-gpt-o4-mini' }),
    })
    assert.equal(sessionResponse.status, 200)
    const { sessionId } = await sessionResponse.json() as { sessionId: string }
    assert.match(sessionId, /^stander-runtime-/)

    const promptResponse = await fetch(`${baseUrl}/v1/runtime/sessions/${encodeURIComponent(sessionId)}/prompt`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    })
    assert.equal(promptResponse.status, 200)
    const events = (await promptResponse.text()).trim().split('\n').map((line) => JSON.parse(line) as SessionEvent)
    assert.deepEqual(events.map((event) => event.type), ['agent.text_delta', 'agent.message'])

    const cancelResponse = await fetch(`${baseUrl}/v1/runtime/sessions/${encodeURIComponent(sessionId)}/cancel`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-token' },
    })
    assert.equal(cancelResponse.status, 200)
    assert.deepEqual(await cancelResponse.json(), { ok: true })
  })
})

test('runtime sessions are platform sessions backed by manager agent configuration', async () => {
  await withUnifiedServer(async (baseUrl) => {
    const agent = await createAgent(baseUrl, {
      name: 'TDX Runtime Agent',
      modelId: 'manager-configured-model',
      systemPrompt: 'Use the manager configured prompt.',
    })

    const sessionResponse = await fetch(`${baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '.',
        agentId: agent.id,
        modelId: 'fallback-model-should-not-win',
        title: 'ACP managed session',
        source: 'acp',
        externalSessionId: 'tdx-session-1',
      }),
    })
    assert.equal(sessionResponse.status, 200)
    const { sessionId } = await sessionResponse.json() as { sessionId: string }

    const platformSessionResponse = await fetch(`${baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}`)
    assert.equal(platformSessionResponse.status, 200)
    const platformSession = await platformSessionResponse.json() as {
      id: string
      agentId: string
      title?: string
      meta?: Record<string, unknown>
    }
    assert.equal(platformSession.id, sessionId)
    assert.equal(platformSession.agentId, agent.id)
    assert.equal(platformSession.title, 'ACP managed session')
    assert.equal(platformSession.meta?.source, 'acp')
    assert.equal(platformSession.meta?.externalSessionId, 'tdx-session-1')

    const promptResponse = await fetch(`${baseUrl}/v1/runtime/sessions/${encodeURIComponent(sessionId)}/prompt`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello from tdx' }),
    })
    assert.equal(promptResponse.status, 200)
    const streamedEvents = (await promptResponse.text()).trim().split('\n').map((line) => JSON.parse(line) as SessionEvent)
    assert.deepEqual(streamedEvents.map((event) => event.type), [
      'user.message',
      'session.status_updated',
      'agent.text_delta',
      'agent.message',
      'session.status_updated',
    ])

    const eventsResponse = await fetch(`${baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/events`)
    assert.equal(eventsResponse.status, 200)
    const storedEvents = await eventsResponse.json() as SessionEvent[]
    assert.deepEqual(storedEvents.map((event) => event.type), [
      'session.created',
      'user.message',
      'session.status_updated',
      'agent.text_delta',
      'agent.message',
      'session.status_updated',
    ])
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
