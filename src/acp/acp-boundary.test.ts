import assert from 'node:assert/strict'
import { createServer, type RequestListener, type Server } from 'node:http'
import { once } from 'node:events'
import {
  createJsonRpcError,
  createJsonRpcResult,
  JSON_RPC_INVALID_REQUEST,
  parseJsonRpcLine,
} from './json-rpc'
import { createAcpSessionUpdateNotification, mapSessionEventToAcpUpdate } from './event-mapping'
import {
  createRuntimeClientConfig,
  parseRuntimeEventLine,
  StanderRuntimeClient,
} from './stander-runtime-client'
import { AcpStdioServer } from './stdio-server'
import type { SessionEvent } from '../platform/types'

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = []

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn })
}

function eventBase(type: SessionEvent['type']) {
  return {
    type,
    eventId: 'event-1',
    sessionId: 'session-1',
    createdAt: '2026-07-09T00:00:00.000Z',
  }
}

test('parseJsonRpcLine accepts request objects with numeric ids', () => {
  assert.deepEqual(parseJsonRpcLine('{"jsonrpc":"2.0","id":1,"method":"session/new","params":{"cwd":"/tmp"}}'), {
    jsonrpc: '2.0',
    id: 1,
    method: 'session/new',
    params: { cwd: '/tmp' },
  })
})

test('parseJsonRpcLine rejects invalid JSON-RPC input', () => {
  assert.equal(parseJsonRpcLine('not json'), null)
  assert.equal(parseJsonRpcLine('null'), null)
  assert.equal(parseJsonRpcLine('[]'), null)
  assert.equal(parseJsonRpcLine('{"jsonrpc":"2.0","id":true,"method":"session/new"}'), null)
  assert.equal(parseJsonRpcLine('{"jsonrpc":"2.0","id":1,"method":""}'), null)
  assert.equal(parseJsonRpcLine('{"jsonrpc":"1.0","id":1,"method":"session/new"}'), null)
})

test('createJsonRpcResult returns a JSON-RPC response', () => {
  assert.deepEqual(createJsonRpcResult(1, { ok: true }), {
    jsonrpc: '2.0',
    id: 1,
    result: { ok: true },
  })
})

test('createJsonRpcError returns a JSON-RPC error response', () => {
  assert.deepEqual(createJsonRpcError('request-1', JSON_RPC_INVALID_REQUEST, 'Invalid request', { reason: 'bad id' }), {
    jsonrpc: '2.0',
    id: 'request-1',
    error: {
      code: JSON_RPC_INVALID_REQUEST,
      message: 'Invalid request',
      data: { reason: 'bad id' },
    },
  })
})

test('mapSessionEventToAcpUpdate maps text delta to agent_message_chunk', () => {
  const event: SessionEvent = { ...eventBase('agent.text_delta'), type: 'agent.text_delta', text: 'Hello' }

  assert.deepEqual(mapSessionEventToAcpUpdate(event), {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: 'Hello' },
  })
})

test('mapSessionEventToAcpUpdate maps final agent messages to agent_message_chunk', () => {
  const event: SessionEvent = { ...eventBase('agent.message'), type: 'agent.message', text: 'Final answer' }

  assert.deepEqual(mapSessionEventToAcpUpdate(event), {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: 'Final answer' },
  })
})

test('mapSessionEventToAcpUpdate maps tool use events to tool_call', () => {
  const event: SessionEvent = {
    ...eventBase('agent.tool_use'),
    type: 'agent.tool_use',
    name: 'read_file',
    toolUseId: 'tool-1',
    input: { path: 'README.md' },
  }

  assert.deepEqual(mapSessionEventToAcpUpdate(event), {
    sessionUpdate: 'tool_call',
    toolCallId: 'tool-1',
    title: 'read_file',
    rawInput: { path: 'README.md' },
    status: 'pending',
    kind: 'tool',
  })
})

test('mapSessionEventToAcpUpdate maps tool result events to tool_call_update', () => {
  const event: SessionEvent = {
    ...eventBase('agent.tool_result'),
    type: 'agent.tool_result',
    name: 'read_file',
    toolUseId: 'tool-1',
    result: { text: 'content' },
  }

  assert.deepEqual(mapSessionEventToAcpUpdate(event), {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'tool-1',
    title: 'read_file',
    rawOutput: { text: 'content' },
    status: 'completed',
    kind: 'tool',
  })
})

test('mapSessionEventToAcpUpdate maps failed tool results to failed tool_call_update', () => {
  const event: SessionEvent = {
    ...eventBase('agent.tool_result'),
    type: 'agent.tool_result',
    name: 'read_file',
    error: 'ENOENT',
  }

  assert.deepEqual(mapSessionEventToAcpUpdate(event), {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'read_file-2026-07-09T00:00:00.000Z',
    title: 'read_file',
    rawOutput: { error: 'ENOENT' },
    status: 'failed',
    kind: 'tool',
  })
})

test('mapSessionEventToAcpUpdate maps session errors to agent_message_chunk', () => {
  const event: SessionEvent = { ...eventBase('session.error'), type: 'session.error', message: 'Runtime failed' }

  assert.deepEqual(mapSessionEventToAcpUpdate(event), {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: 'Runtime failed' },
  })
})

test('createAcpSessionUpdateNotification returns a session update notification', () => {
  assert.deepEqual(
    createAcpSessionUpdateNotification('session-1', {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Hello' },
    }),
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hello' },
        },
      },
    },
  )
})

test('createRuntimeClientConfig reads env with azure default model', () => {
  const config = createRuntimeClientConfig({
    STANDER_RUNTIME_URL: 'http://runtime.internal:8787/',
    STANDER_RUNTIME_TOKEN: 'secret',
  })

  assert.deepEqual(config, {
    baseUrl: 'http://runtime.internal:8787',
    token: 'secret',
    modelId: 'azure-gpt-o4-mini',
  })
})

test('createRuntimeClientConfig requires runtime url and token', () => {
  assert.throws(() => createRuntimeClientConfig({ STANDER_RUNTIME_TOKEN: 'secret' }), /STANDER_RUNTIME_URL/)
  assert.throws(() => createRuntimeClientConfig({ STANDER_RUNTIME_URL: 'http:\/\/runtime' }), /STANDER_RUNTIME_TOKEN/)
})

test('parseRuntimeEventLine returns null for blank lines and parses events', () => {
  assert.equal(parseRuntimeEventLine(''), null)
  assert.deepEqual(parseRuntimeEventLine('{"type":"agent.text_delta","sessionId":"s","text":"x","createdAt":"t"}'), {
    type: 'agent.text_delta',
    sessionId: 's',
    text: 'x',
    createdAt: 't',
  })
})

async function withClientServer(handler: RequestListener, fn: (baseUrl: string) => Promise<void>) {
  const server: Server = createServer(handler)
  server.listen(0, '127.0.0.1')
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

test('StanderRuntimeClient creates sessions with bearer auth and model', async () => {
  await withClientServer(async (req, res) => {
    assert.equal(req.method, 'POST')
    assert.equal(req.url, '/v1/runtime/sessions')
    assert.equal(req.headers.authorization, 'Bearer secret')
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), {
      cwd: '/tmp/work',
      modelId: 'azure-gpt-o4-mini',
    })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ sessionId: 'runtime-session-1' }))
  }, async (baseUrl) => {
    const client = new StanderRuntimeClient({ baseUrl, token: 'secret', modelId: 'azure-gpt-o4-mini' })

    assert.deepEqual(await client.createSession({ cwd: '/tmp/work' }), { sessionId: 'runtime-session-1' })
  })
})

test('StanderRuntimeClient streams prompt ndjson events', async () => {
  await withClientServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' })
    res.write('{"type":"agent.text_delta","sessionId":"runtime-session-1","text":"hel","createdAt":"t1"}\n')
    res.end('{"type":"agent.message","sessionId":"runtime-session-1","text":"hello","createdAt":"t2"}\n')
  }, async (baseUrl) => {
    const client = new StanderRuntimeClient({ baseUrl, token: 'secret', modelId: 'azure-gpt-o4-mini' })
    const events: SessionEvent[] = []

    for await (const event of client.prompt('runtime-session-1', 'hi')) {
      events.push(event)
    }

    assert.deepEqual(events, [
      { type: 'agent.text_delta', sessionId: 'runtime-session-1', text: 'hel', createdAt: 't1' },
      { type: 'agent.message', sessionId: 'runtime-session-1', text: 'hello', createdAt: 't2' },
    ])
  })
})

test('StanderRuntimeClient surfaces non-ok runtime errors', async () => {
  await withClientServer(async (_req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'boom' }))
  }, async (baseUrl) => {
    const client = new StanderRuntimeClient({ baseUrl, token: 'secret', modelId: 'azure-gpt-o4-mini' })

    await assert.rejects(() => client.createSession({}), /Runtime request failed \(500\):/)
  })
})

class FakeRuntimeClient {
  createdSessions: Array<{ cwd?: string }> = []
  prompts: Array<{ sessionId: string; text: string }> = []
  cancelled: string[] = []

  async createSession(input: { cwd?: string }) {
    this.createdSessions.push(input)
    return { sessionId: 'runtime-session-1' }
  }

  async *prompt(sessionId: string, text: string) {
    this.prompts.push({ sessionId, text })
    yield {
      type: 'agent.text_delta',
      sessionId,
      text: 'hello',
      createdAt: '2026-07-09T00:00:00.000Z',
    } satisfies SessionEvent
  }

  async cancel(sessionId: string) {
    this.cancelled.push(sessionId)
  }
}

test('AcpStdioServer handles initialize', async () => {
  const writes: unknown[] = []
  const server = new AcpStdioServer({
    runtimeClient: new FakeRuntimeClient(),
    write: (message) => writes.push(JSON.parse(message)),
    cwd: '/tmp/work',
  })

  await server.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: 1 },
  })

  assert.deepEqual(writes, [
    {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: { image: false, embeddedContext: false },
        },
        authMethods: [],
      },
    },
  ])
})

test('AcpStdioServer creates sessions and streams prompt updates', async () => {
  const writes: unknown[] = []
  const runtimeClient = new FakeRuntimeClient()
  const server = new AcpStdioServer({
    runtimeClient,
    write: (message) => writes.push(JSON.parse(message)),
    cwd: '/tmp/work',
  })

  await server.handleMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'session/new',
    params: { cwd: '/tmp/work' },
  })
  await server.handleMessage({
    jsonrpc: '2.0',
    id: 3,
    method: 'session/prompt',
    params: {
      sessionId: 'runtime-session-1',
      prompt: [{ type: 'text', text: 'hi' }],
    },
  })

  assert.deepEqual(runtimeClient.createdSessions, [{ cwd: '/tmp/work' }])
  assert.deepEqual(runtimeClient.prompts, [{ sessionId: 'runtime-session-1', text: 'hi' }])
  assert.deepEqual(writes, [
    {
      jsonrpc: '2.0',
      id: 2,
      result: { sessionId: 'runtime-session-1' },
    },
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'runtime-session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'hello' },
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 3,
      result: {},
    },
  ])
})

test('AcpStdioServer cancels active sessions', async () => {
  const writes: unknown[] = []
  const runtimeClient = new FakeRuntimeClient()
  const server = new AcpStdioServer({
    runtimeClient,
    write: (message) => writes.push(JSON.parse(message)),
    cwd: '/tmp/work',
  })

  await server.handleMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'session/cancel',
    params: { sessionId: 'runtime-session-1' },
  })

  assert.deepEqual(runtimeClient.cancelled, ['runtime-session-1'])
  assert.deepEqual(writes, [
    {
      jsonrpc: '2.0',
      id: 4,
      result: { stopReason: 'cancelled' },
    },
  ])
})

test('AcpStdioServer rejects prompt requests without text content', async () => {
  const writes: unknown[] = []
  const server = new AcpStdioServer({
    runtimeClient: new FakeRuntimeClient(),
    write: (message) => writes.push(JSON.parse(message)),
    cwd: '/tmp/work',
  })

  await server.handleMessage({
    jsonrpc: '2.0',
    id: 5,
    method: 'session/prompt',
    params: { sessionId: 'runtime-session-1', prompt: [] },
  })

  assert.deepEqual(writes, [
    {
      jsonrpc: '2.0',
      id: 5,
      error: {
        code: -32602,
        message: 'sessionId and text prompt are required',
      },
    },
  ])
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
