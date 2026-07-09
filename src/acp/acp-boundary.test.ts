import assert from 'node:assert/strict'
import {
  createJsonRpcError,
  createJsonRpcResult,
  JSON_RPC_INVALID_REQUEST,
  parseJsonRpcLine,
} from './json-rpc'
import { createAcpSessionUpdateNotification, mapSessionEventToAcpUpdate } from './event-mapping'
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
