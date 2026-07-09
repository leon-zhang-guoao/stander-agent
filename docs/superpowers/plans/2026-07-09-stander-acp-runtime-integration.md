# Stander ACP Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal ACP stdio adapter and private Stander runtime service so TDS can run Stander through `npx @stander-agent/stander-agent acp`.

**Architecture:** The TDS-facing process is a thin ACP server over newline-delimited JSON-RPC on stdio. It forwards `initialize`, `session/new`, `session/prompt`, and `session/cancel` to a Stander runtime HTTP service running in the user's private network. The runtime service owns Strands execution, model credentials, sessions, cancellation, and event streaming.

**Tech Stack:** TypeScript, Node.js `node:http`, Node.js streams, built-in `fetch`, existing `StrandsRuntime`, existing platform persistence, `tsx` for tests, `tsc --noEmit` for type checks.

---

## File Structure

Create these files:

- `src/acp/json-rpc.ts`  
  JSON-RPC 2.0 request/response/notification types, line parser, response helpers, and stderr-safe logging utilities.

- `src/acp/stander-runtime-client.ts`  
  HTTP client used by the ACP adapter. Reads runtime URL/token/model config, creates sessions, streams prompt events, and sends cancellation.

- `src/acp/event-mapping.ts`  
  Converts Stander `SessionEvent` values into ACP `session/update` notification params in the shape TDS's `AcpTranslator` understands.

- `src/acp/stdio-server.ts`  
  Minimal ACP server over stdio. Dispatches `initialize`, `session/new`, `session/prompt`, and `session/cancel`.

- `src/acp/cli.ts`  
  CLI entry for `stander-agent acp`.

- `src/runtime-service/types.ts`  
  Private runtime HTTP API request/response/event types shared by service and tests.

- `src/runtime-service/server.ts`  
  Runtime service implementation. Creates sessions, runs prompts through `StrandsRuntime`, streams events as NDJSON, and handles cancellation.

- `src/runtime-service/cli.ts`  
  CLI entry for `stander-agent runtime`.

- `src/acp/acp-boundary.test.ts`  
  Unit tests for JSON-RPC framing, event mapping, runtime client config, and adapter request dispatch.

- `src/runtime-service/runtime-service-boundary.test.ts`  
  Unit/integration tests for runtime service auth, session creation, prompt streaming, and cancellation using a fake runtime.

- `docs/stander-acp-runtime-deployment.md`  
  English deployment guide and operator checklist.

- `docs/stander-acp-runtime-deployment.zh-CN.md`  
  Chinese deployment guide and operator checklist.

Modify these files:

- `package.json`  
  Add package scope/name, `bin`, scripts for ACP/runtime smoke tests, and test script entries.

- `tsconfig.json`  
  Keep current NodeNext strict settings. No change expected unless executable entrypoints require an include adjustment.

Implementation deliberately keeps ACP logic isolated from `src/server.ts`. The existing local console server remains untouched.

---

## Task 1: JSON-RPC Framing and ACP Event Mapping

**Files:**
- Create: `src/acp/json-rpc.ts`
- Create: `src/acp/event-mapping.ts`
- Create: `src/acp/acp-boundary.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing tests for JSON-RPC and event mapping**

Create `src/acp/acp-boundary.test.ts` with:

```ts
import assert from 'node:assert/strict'
import { createJsonRpcError, createJsonRpcResult, parseJsonRpcLine } from './json-rpc'
import { mapSessionEventToAcpUpdate } from './event-mapping'
import type { SessionEvent } from '../platform/types'

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`)
      throw error
    })
}

test('parseJsonRpcLine accepts request objects with numeric ids', () => {
  assert.deepEqual(parseJsonRpcLine('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}'), {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: 1 },
  })
})

test('parseJsonRpcLine rejects invalid JSON-RPC input', () => {
  assert.equal(parseJsonRpcLine('not json'), null)
  assert.equal(parseJsonRpcLine('{"jsonrpc":"2.0","id":1}'), null)
  assert.equal(parseJsonRpcLine('{"jsonrpc":"1.0","id":1,"method":"initialize"}'), null)
})

test('createJsonRpcResult returns a JSON-RPC response', () => {
  assert.deepEqual(createJsonRpcResult(7, { ok: true }), {
    jsonrpc: '2.0',
    id: 7,
    result: { ok: true },
  })
})

test('createJsonRpcError returns a JSON-RPC error response', () => {
  assert.deepEqual(createJsonRpcError('abc', -32602, 'Bad params'), {
    jsonrpc: '2.0',
    id: 'abc',
    error: { code: -32602, message: 'Bad params' },
  })
})

test('mapSessionEventToAcpUpdate maps text delta to agent_message_chunk', () => {
  const event: SessionEvent = {
    type: 'agent.text_delta',
    sessionId: 'session-1',
    text: 'hello',
    createdAt: '2026-07-09T00:00:00.000Z',
  }

  assert.deepEqual(mapSessionEventToAcpUpdate(event), {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: 'hello' },
  })
})

test('mapSessionEventToAcpUpdate maps tool events to tool_call_update', () => {
  const toolUse: SessionEvent = {
    type: 'agent.tool_use',
    sessionId: 'session-1',
    name: 'read_file',
    toolUseId: 'tool-1',
    input: { path: 'README.md' },
    createdAt: '2026-07-09T00:00:00.000Z',
  }
  const toolResult: SessionEvent = {
    type: 'agent.tool_result',
    sessionId: 'session-1',
    name: 'read_file',
    toolUseId: 'tool-1',
    result: 'contents',
    createdAt: '2026-07-09T00:00:01.000Z',
  }

  assert.deepEqual(mapSessionEventToAcpUpdate(toolUse), {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'tool-1',
    title: 'read_file',
    rawInput: { path: 'README.md' },
    status: 'pending',
    kind: 'tool',
  })
  assert.deepEqual(mapSessionEventToAcpUpdate(toolResult), {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'tool-1',
    title: 'read_file',
    rawOutput: 'contents',
    status: 'completed',
    kind: 'tool',
  })
})

test('mapSessionEventToAcpUpdate maps session errors to agent_message', () => {
  const event: SessionEvent = {
    type: 'session.error',
    sessionId: 'session-1',
    message: 'Runtime unavailable',
    createdAt: '2026-07-09T00:00:00.000Z',
  }

  assert.deepEqual(mapSessionEventToAcpUpdate(event), {
    sessionUpdate: 'agent_message',
    content: { type: 'text', text: 'Runtime unavailable' },
  })
})
```

- [ ] **Step 2: Add the test script and run it to verify it fails**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "test:acp": "node --import tsx src/acp/acp-boundary.test.ts",
    "test": "npm run test:platform-boundary && npm run test:console-ui && npm run test:acp && npm run build"
  }
}
```

Run:

```bash
npm run test:acp
```

Expected: FAIL because `src/acp/json-rpc.ts` and `src/acp/event-mapping.ts` do not exist.

- [ ] **Step 3: Implement JSON-RPC helpers**

Create `src/acp/json-rpc.ts`:

```ts
export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: unknown
}

export type JsonRpcSuccess = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result: unknown
}

export type JsonRpcFailure = {
  jsonrpc: '2.0'
  id: JsonRpcId
  error: {
    code: number
    message: string
    data?: unknown
  }
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcSuccess | JsonRpcFailure

export const JSON_RPC_PARSE_ERROR = -32700
export const JSON_RPC_INVALID_REQUEST = -32600
export const JSON_RPC_METHOD_NOT_FOUND = -32601
export const JSON_RPC_INVALID_PARAMS = -32602
export const JSON_RPC_INTERNAL_ERROR = -32603

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === 'string' || typeof value === 'number'
}

export function parseJsonRpcLine(line: string): JsonRpcRequest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const candidate = parsed as Record<string, unknown>
  if (candidate.jsonrpc !== '2.0') return null
  if (typeof candidate.method !== 'string' || !candidate.method) return null
  if ('id' in candidate && !isJsonRpcId(candidate.id)) return null

  return {
    jsonrpc: '2.0',
    ...(candidate.id !== undefined ? { id: candidate.id } : {}),
    method: candidate.method,
    ...(candidate.params !== undefined ? { params: candidate.params } : {}),
  }
}

export function createJsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result }
}

export function createJsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  }
}

export function serializeJsonRpc(message: JsonRpcMessage) {
  return `${JSON.stringify(message)}\n`
}
```

- [ ] **Step 4: Implement event mapping**

Create `src/acp/event-mapping.ts`:

```ts
import type { SessionEvent } from '../platform/types'

export type AcpSessionUpdate =
  | {
      sessionUpdate: 'agent_message_chunk'
      content: { type: 'text'; text: string }
    }
  | {
      sessionUpdate: 'agent_message'
      content: { type: 'text'; text: string }
    }
  | {
      sessionUpdate: 'tool_call_update'
      toolCallId: string
      title?: string
      rawInput?: unknown
      rawOutput?: unknown
      status: 'pending' | 'completed' | 'failed'
      kind: 'tool'
    }

export function mapSessionEventToAcpUpdate(event: SessionEvent): AcpSessionUpdate | null {
  switch (event.type) {
    case 'agent.text_delta':
      return {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: event.text },
      }
    case 'agent.message':
      return {
        sessionUpdate: 'agent_message',
        content: { type: 'text', text: event.text },
      }
    case 'agent.tool_use':
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId: event.toolUseId ?? `${event.name}-${event.createdAt}`,
        title: event.name,
        rawInput: event.input,
        status: 'pending',
        kind: 'tool',
      }
    case 'agent.tool_result':
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId: event.toolUseId ?? `${event.name ?? 'tool'}-${event.createdAt}`,
        title: event.name,
        rawOutput: event.error ? { error: event.error } : event.result,
        status: event.error ? 'failed' : 'completed',
        kind: 'tool',
      }
    case 'session.error':
      return {
        sessionUpdate: 'agent_message',
        content: { type: 'text', text: event.message },
      }
    default:
      return null
  }
}

export function createAcpSessionUpdateNotification(sessionId: string, update: AcpSessionUpdate) {
  return {
    jsonrpc: '2.0' as const,
    method: 'session/update',
    params: {
      sessionId,
      update,
    },
  }
}
```

- [ ] **Step 5: Run tests and type check**

Run:

```bash
npm run test:acp
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json src/acp/json-rpc.ts src/acp/event-mapping.ts src/acp/acp-boundary.test.ts
git commit -m "feat: add acp json-rpc event mapping"
```

---

## Task 2: Runtime Service HTTP API With Fake Runtime Tests

**Files:**
- Create: `src/runtime-service/types.ts`
- Create: `src/runtime-service/server.ts`
- Create: `src/runtime-service/runtime-service-boundary.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing runtime service tests**

Create `src/runtime-service/runtime-service-boundary.test.ts`:

```ts
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

function test(name: string, fn: () => Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`)
      throw error
    })
}

async function withServer(fn: (baseUrl: string, runtime: FakeRuntime) => Promise<void>) {
  const runtime = new FakeRuntime()
  const server = startStanderRuntimeService({
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
```

- [ ] **Step 2: Add runtime service test script and verify failure**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "test:runtime-service": "node --import tsx src/runtime-service/runtime-service-boundary.test.ts",
    "test": "npm run test:platform-boundary && npm run test:console-ui && npm run test:acp && npm run test:runtime-service && npm run build"
  }
}
```

Run:

```bash
npm run test:runtime-service
```

Expected: FAIL because `src/runtime-service/server.ts` does not exist.

- [ ] **Step 3: Define runtime service types**

Create `src/runtime-service/types.ts`:

```ts
import type { SessionEvent } from '../platform/types'

export type RuntimeCreateSessionRequest = {
  cwd?: string
  modelId?: string
}

export type RuntimeCreateSessionResponse = {
  sessionId: string
}

export type RuntimePromptRequest = {
  text: string
}

export type RuntimeErrorResponse = {
  error: string
}

export type RuntimePromptEvent = SessionEvent
```

- [ ] **Step 4: Implement runtime service with injected runtime**

Create `src/runtime-service/server.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AgentRuntime } from '../platform/runtime'
import type { AgentConfig, SessionMeta } from '../platform/types'
import type { RuntimeCreateSessionRequest, RuntimePromptRequest } from './types'

type RuntimeServiceSession = {
  id: string
  cwd: string
  modelId: string
  createdAt: string
  abortController?: AbortController
}

export type StanderRuntimeServiceOptions = {
  runtime: AgentRuntime
  token: string
  modelId: string
  host?: string
  port?: number
}

function nowIso() {
  return new Date().toISOString()
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {} as T
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

function isAuthorized(req: IncomingMessage, token: string) {
  return req.headers.authorization === `Bearer ${token}`
}

function createRuntimeAgent(modelId: string): AgentConfig {
  const timestamp = nowIso()
  return {
    id: 'stander-runtime-agent',
    name: 'Stander Runtime Agent',
    modelId,
    baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    systemPrompt: process.env.STANDER_SYSTEM_PROMPT ?? 'You are Stander Agent.',
    tools: [],
    skills: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function toSessionMeta(session: RuntimeServiceSession): SessionMeta {
  return {
    id: session.id,
    agentId: 'stander-runtime-agent',
    kind: 'agent',
    status: 'running',
    createdAt: session.createdAt,
    updatedAt: nowIso(),
  }
}

export function startStanderRuntimeService(options: StanderRuntimeServiceOptions): Server {
  const sessions = new Map<string, RuntimeServiceSession>()
  const token = options.token

  const server = createServer(async (req, res) => {
    try {
      if (!isAuthorized(req, token)) {
        sendJson(res, 401, { error: 'Unauthorized' })
        return
      }

      const url = new URL(req.url ?? '/', 'http://localhost')

      if (req.method === 'POST' && url.pathname === '/v1/runtime/sessions') {
        const body = await readJson<RuntimeCreateSessionRequest>(req)
        const session: RuntimeServiceSession = {
          id: `stander-runtime-${randomUUID()}`,
          cwd: body.cwd ?? process.cwd(),
          modelId: body.modelId ?? options.modelId,
          createdAt: nowIso(),
        }
        sessions.set(session.id, session)
        sendJson(res, 200, { sessionId: session.id })
        return
      }

      const promptMatch = url.pathname.match(/^\/v1\/runtime\/sessions\/([^/]+)\/prompt$/)
      if (req.method === 'POST' && promptMatch) {
        const session = sessions.get(decodeURIComponent(promptMatch[1]))
        if (!session) {
          sendJson(res, 404, { error: 'Session not found' })
          return
        }

        const body = await readJson<RuntimePromptRequest>(req)
        if (!body.text || typeof body.text !== 'string') {
          sendJson(res, 400, { error: 'Prompt text is required' })
          return
        }

        const abortController = new AbortController()
        session.abortController = abortController
        res.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })

        try {
          const runtimeEvents = options.runtime.runMessage({
            agent: createRuntimeAgent(session.modelId),
            session: toSessionMeta(session),
            message: body.text,
            events: [],
            signal: abortController.signal,
          })
          for await (const event of runtimeEvents) {
            res.write(`${JSON.stringify(event)}\n`)
          }
          res.end()
        } finally {
          session.abortController = undefined
        }
        return
      }

      const cancelMatch = url.pathname.match(/^\/v1\/runtime\/sessions\/([^/]+)\/cancel$/)
      if (req.method === 'POST' && cancelMatch) {
        const session = sessions.get(decodeURIComponent(cancelMatch[1]))
        if (!session) {
          sendJson(res, 404, { error: 'Session not found' })
          return
        }
        session.abortController?.abort()
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  server.listen(options.port ?? 8787, options.host ?? '0.0.0.0')
  return server
}
```

- [ ] **Step 5: Run runtime service tests**

Run:

```bash
npm run test:runtime-service
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json src/runtime-service/types.ts src/runtime-service/server.ts src/runtime-service/runtime-service-boundary.test.ts
git commit -m "feat: add stander runtime service"
```

---

## Task 3: Runtime Client for the ACP Adapter

**Files:**
- Create: `src/acp/stander-runtime-client.ts`
- Modify: `src/acp/acp-boundary.test.ts`

- [ ] **Step 1: Add failing runtime client tests**

Append to `src/acp/acp-boundary.test.ts`:

```ts
import {
  createRuntimeClientConfig,
  parseRuntimeEventLine,
  StanderRuntimeClient,
} from './stander-runtime-client'

test('createRuntimeClientConfig reads env with azure default model', () => {
  const config = createRuntimeClientConfig({
    STANDER_RUNTIME_URL: 'http://runtime.internal:8787',
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
```

- [ ] **Step 2: Run ACP tests to verify failure**

Run:

```bash
npm run test:acp
```

Expected: FAIL because `src/acp/stander-runtime-client.ts` does not exist.

- [ ] **Step 3: Implement runtime client**

Create `src/acp/stander-runtime-client.ts`:

```ts
import type { SessionEvent } from '../platform/types'

export type RuntimeClientConfig = {
  baseUrl: string
  token: string
  modelId: string
}

export function createRuntimeClientConfig(env: NodeJS.ProcessEnv = process.env): RuntimeClientConfig {
  const baseUrl = env.STANDER_RUNTIME_URL?.replace(/\/+$/, '')
  if (!baseUrl) {
    throw new Error('STANDER_RUNTIME_URL is required')
  }

  const token = env.STANDER_RUNTIME_TOKEN
  if (!token) {
    throw new Error('STANDER_RUNTIME_TOKEN is required')
  }

  return {
    baseUrl,
    token,
    modelId: env.STANDER_MODEL || 'azure-gpt-o4-mini',
  }
}

export function parseRuntimeEventLine(line: string): SessionEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  return JSON.parse(trimmed) as SessionEvent
}

export class StanderRuntimeClient {
  constructor(private readonly config: RuntimeClientConfig) {}

  async createSession(input: { cwd?: string }): Promise<{ sessionId: string }> {
    const response = await fetch(`${this.config.baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        cwd: input.cwd,
        modelId: this.config.modelId,
      }),
    })
    return this.readJsonResponse<{ sessionId: string }>(response)
  }

  async *prompt(sessionId: string, text: string, signal?: AbortSignal): AsyncIterable<SessionEvent> {
    const response = await fetch(
      `${this.config.baseUrl}/v1/runtime/sessions/${encodeURIComponent(sessionId)}/prompt`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ text }),
        signal,
      },
    )
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Runtime prompt failed (${response.status}): ${body}`)
    }
    if (!response.body) {
      throw new Error('Runtime prompt response did not include a body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        const event = parseRuntimeEventLine(line)
        if (event) yield event
        newlineIndex = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    const trailing = parseRuntimeEventLine(buffer)
    if (trailing) yield trailing
  }

  async cancel(sessionId: string): Promise<void> {
    const response = await fetch(
      `${this.config.baseUrl}/v1/runtime/sessions/${encodeURIComponent(sessionId)}/cancel`,
      {
        method: 'POST',
        headers: this.headers(),
      },
    )
    if (!response.ok && response.status !== 404) {
      const body = await response.text()
      throw new Error(`Runtime cancel failed (${response.status}): ${body}`)
    }
  }

  private headers() {
    return {
      authorization: `Bearer ${this.config.token}`,
      'content-type': 'application/json',
    }
  }

  private async readJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Runtime request failed (${response.status}): ${body}`)
    }
    return response.json() as Promise<T>
  }
}
```

- [ ] **Step 4: Run ACP tests and type check**

Run:

```bash
npm run test:acp
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/acp/acp-boundary.test.ts src/acp/stander-runtime-client.ts
git commit -m "feat: add stander runtime client"
```

---

## Task 4: ACP Stdio Server

**Files:**
- Create: `src/acp/stdio-server.ts`
- Modify: `src/acp/acp-boundary.test.ts`

- [ ] **Step 1: Add failing adapter dispatch tests**

Append to `src/acp/acp-boundary.test.ts`:

```ts
import { AcpStdioServer } from './stdio-server'

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
```

- [ ] **Step 2: Run ACP tests to verify failure**

Run:

```bash
npm run test:acp
```

Expected: FAIL because `src/acp/stdio-server.ts` does not exist.

- [ ] **Step 3: Implement ACP stdio server**

Create `src/acp/stdio-server.ts`:

```ts
import readline from 'node:readline'
import { stdin, stdout } from 'node:process'
import { createAcpSessionUpdateNotification, mapSessionEventToAcpUpdate } from './event-mapping'
import {
  createJsonRpcError,
  createJsonRpcResult,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  parseJsonRpcLine,
  serializeJsonRpc,
  type JsonRpcRequest,
} from './json-rpc'
import type { StanderRuntimeClient } from './stander-runtime-client'

type RuntimeClientLike = Pick<StanderRuntimeClient, 'createSession' | 'prompt' | 'cancel'>

export type AcpStdioServerOptions = {
  runtimeClient: RuntimeClientLike
  write?: (message: string) => void
  cwd?: string
}

function extractPromptText(params: unknown): string {
  const prompt = (params as { prompt?: Array<{ type?: string; text?: string }> } | null)?.prompt
  if (!Array.isArray(prompt)) return ''
  return prompt
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

function getSessionId(params: unknown): string {
  return String((params as { sessionId?: string } | null)?.sessionId ?? '')
}

export class AcpStdioServer {
  private readonly runtimeClient: RuntimeClientLike
  private readonly writeMessage: (message: string) => void
  private readonly cwd: string

  constructor(options: AcpStdioServerOptions) {
    this.runtimeClient = options.runtimeClient
    this.writeMessage = options.write ?? ((message) => stdout.write(message))
    this.cwd = options.cwd ?? process.cwd()
  }

  async handleMessage(message: JsonRpcRequest): Promise<void> {
    if (message.id === undefined) {
      return
    }

    try {
      switch (message.method) {
        case 'initialize':
          this.send(createJsonRpcResult(message.id, {
            protocolVersion: 1,
            agentCapabilities: {
              loadSession: false,
              promptCapabilities: { image: false, embeddedContext: false },
            },
            authMethods: [],
          }))
          return
        case 'session/new': {
          const cwd = String((message.params as { cwd?: string } | null)?.cwd ?? this.cwd)
          const session = await this.runtimeClient.createSession({ cwd })
          this.send(createJsonRpcResult(message.id, { sessionId: session.sessionId }))
          return
        }
        case 'session/prompt': {
          const sessionId = getSessionId(message.params)
          const text = extractPromptText(message.params)
          if (!sessionId || !text) {
            this.send(createJsonRpcError(message.id, JSON_RPC_INVALID_PARAMS, 'sessionId and text prompt are required'))
            return
          }
          for await (const event of this.runtimeClient.prompt(sessionId, text)) {
            const update = mapSessionEventToAcpUpdate(event)
            if (update) {
              this.send(createAcpSessionUpdateNotification(sessionId, update))
            }
          }
          this.send(createJsonRpcResult(message.id, {}))
          return
        }
        case 'session/cancel': {
          const sessionId = getSessionId(message.params)
          if (!sessionId) {
            this.send(createJsonRpcError(message.id, JSON_RPC_INVALID_PARAMS, 'sessionId is required'))
            return
          }
          await this.runtimeClient.cancel(sessionId)
          this.send(createJsonRpcResult(message.id, { stopReason: 'cancelled' }))
          return
        }
        default:
          this.send(createJsonRpcError(message.id, JSON_RPC_METHOD_NOT_FOUND, `Unsupported ACP method: ${message.method}`))
      }
    } catch (error) {
      this.send(createJsonRpcError(
        message.id,
        JSON_RPC_INTERNAL_ERROR,
        error instanceof Error ? error.message : String(error),
      ))
    }
  }

  listen(input = stdin): void {
    const rl = readline.createInterface({ input })
    rl.on('line', (line) => {
      const message = parseJsonRpcLine(line)
      if (!message) return
      void this.handleMessage(message)
    })
  }

  private send(message: unknown): void {
    this.writeMessage(serializeJsonRpc(message as never))
  }
}
```

- [ ] **Step 4: Run tests and type check**

Run:

```bash
npm run test:acp
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/acp/acp-boundary.test.ts src/acp/stdio-server.ts
git commit -m "feat: add acp stdio server"
```

---

## Task 5: CLI Entrypoints and Package Metadata

**Files:**
- Create: `src/acp/cli.ts`
- Create: `src/runtime-service/cli.ts`
- Modify: `package.json`

- [ ] **Step 1: Add CLI entrypoints**

Create `src/acp/cli.ts`:

```ts
#!/usr/bin/env node
import { AcpStdioServer } from './stdio-server'
import { createRuntimeClientConfig, StanderRuntimeClient } from './stander-runtime-client'

async function main() {
  const runtimeClient = new StanderRuntimeClient(createRuntimeClientConfig())
  const server = new AcpStdioServer({ runtimeClient })
  server.listen()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
```

Create `src/runtime-service/cli.ts`:

```ts
#!/usr/bin/env node
import { createBuiltinToolRegistry } from '../platform/tool-registry'
import { createFileSkillRegistry } from '../platform/skill-registry'
import { createPlatformPersistence } from '../platform/persistence-factory'
import { StrandsRuntime } from '../platform/strands-runtime'
import { startStanderRuntimeService } from './server'

const token = process.env.STANDER_RUNTIME_TOKEN
if (!token) {
  console.error('STANDER_RUNTIME_TOKEN is required')
  process.exit(1)
}

const modelId = process.env.STANDER_MODEL || 'azure-gpt-o4-mini'
const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || 8787)

const runtime = new StrandsRuntime(
  createBuiltinToolRegistry(),
  createFileSkillRegistry(),
  createPlatformPersistence(),
)

startStanderRuntimeService({
  runtime,
  token,
  modelId,
  host,
  port,
})

console.log(`Stander runtime service listening on http://${host}:${port}`)
```

- [ ] **Step 2: Modify package metadata and scripts**

Update `package.json`:

```json
{
  "name": "@stander-agent/stander-agent",
  "version": "1.0.0",
  "description": "Stander Agent ACP adapter and runtime service",
  "main": "dist/main.js",
  "bin": {
    "stander-agent": "dist/cli.js"
  },
  "scripts": {
    "dev": "node node_modules/typescript/bin/tsc && node dist/main.js",
    "dev:server": "node node_modules/typescript/bin/tsc && node dist/server.js",
    "dev:runtime": "node --import tsx src/runtime-service/cli.ts",
    "dev:acp": "node --import tsx src/acp/cli.ts",
    "build": "node node_modules/typescript/bin/tsc --noEmit",
    "test:platform-boundary": "node --import tsx src/platform/platform-boundary.test.ts",
    "test:console-ui": "node src/platform/console-ui-structure.test.mjs",
    "test:acp": "node --import tsx src/acp/acp-boundary.test.ts",
    "test:runtime-service": "node --import tsx src/runtime-service/runtime-service-boundary.test.ts",
    "test": "npm run test:platform-boundary && npm run test:console-ui && npm run test:acp && npm run test:runtime-service && npm run build"
  }
}
```

The `bin` target points to `dist/cli.js`, which does not exist yet. Task 6 creates the dispatcher.

- [ ] **Step 3: Run tests and type check**

Run:

```bash
npm run test
```

Expected: PASS for tests and type check. If `package-lock.json` updates because the package name changed, include it in the commit.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/acp/cli.ts src/runtime-service/cli.ts
git commit -m "feat: add stander acp runtime cli entries"
```

---

## Task 6: Top-Level Dispatcher for `stander-agent acp` and `stander-agent runtime`

**Files:**
- Create: `src/cli.ts`
- Modify: `package.json`

- [ ] **Step 1: Add top-level CLI dispatcher**

Create `src/cli.ts`:

```ts
#!/usr/bin/env node

async function main() {
  const command = process.argv[2]

  if (command === 'acp') {
    await import('./acp/cli')
    return
  }

  if (command === 'runtime') {
    await import('./runtime-service/cli')
    return
  }

  console.error('Usage: stander-agent <acp|runtime>')
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
```

- [ ] **Step 2: Add smoke scripts**

Update `package.json` scripts:

```json
{
  "scripts": {
    "dev:runtime": "node --import tsx src/cli.ts runtime",
    "dev:acp": "node --import tsx src/cli.ts acp"
  }
}
```

- [ ] **Step 3: Build and smoke the dispatcher**

Run:

```bash
npm run build
node --import tsx src/cli.ts
```

Expected:

```text
Usage: stander-agent <acp|runtime>
```

The command should exit with code `1`.

- [ ] **Step 4: Commit**

```bash
git add package.json src/cli.ts
git commit -m "feat: add stander-agent command dispatcher"
```

---

## Task 7: Documentation and Manual Operator Checklist

**Files:**
- Create: `docs/stander-acp-runtime-deployment.md`
- Create: `docs/stander-acp-runtime-deployment.zh-CN.md`

- [ ] **Step 1: Write English deployment guide**

Create `docs/stander-acp-runtime-deployment.md`:

```md
# Stander ACP Runtime Deployment

## Overview

This deployment connects Stander Agent to TDS/OpenMA through ACP without changing TDS.

TDS runs:

```bash
npx @stander-agent/stander-agent acp
```

The ACP adapter connects over the internal network to:

```text
STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
```

## Runtime Service

Start the private Stander runtime service in the environment that owns model credentials and tool execution:

```bash
export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
export STANDER_MODEL=azure-gpt-o4-mini
export OPENAI_API_KEY="$YOUR_OPENAI_API_KEY"
export OPENAI_BASE_URL="$YOUR_OPENAI_BASE_URL"
npm run dev:runtime
```

## TDS Runtime Machine

If using a private npm registry:

```bash
export STANDER_NPM_REGISTRY_URL="https://your-private-npm-registry"
npm config set @stander-agent:registry "$STANDER_NPM_REGISTRY_URL"
npm login --registry "$STANDER_NPM_REGISTRY_URL"
```

Install the adapter globally:

```bash
npm install -g @stander-agent/stander-agent
```

Configure adapter environment:

```bash
export STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
export STANDER_MODEL=azure-gpt-o4-mini
```

## TDS Manual Operator Checklist

1. Open TDS Local Runtimes and choose Connect machine.
2. On the TDS runtime machine, run:

   ```bash
   npx @openma/cli@beta bridge setup
   ```

3. Confirm `oma bridge daemon` is installed and running persistently.
4. Configure npm source for `@stander-agent/stander-agent` if using private npm.
5. Install the adapter globally with `npm install -g @stander-agent/stander-agent`.
6. Configure `STANDER_RUNTIME_URL`, `STANDER_RUNTIME_TOKEN`, and `STANDER_MODEL` for the daemon environment.
7. Ensure the TDS runtime machine can reach the Stander runtime service over the internal network.
8. Restart or refresh `oma bridge daemon` so it re-detects agents.
9. Confirm `stander-agent` appears in TDS Local Runtimes detected agents.
10. In TDS New Agent form, choose the connected runtime and `stander-agent`.
11. Create the agent and send one test message.
12. If it fails, inspect logs in this order: `oma bridge daemon`, `stander-agent acp adapter`, `Stander runtime service`.
```

- [ ] **Step 2: Write Chinese deployment guide**

Create `docs/stander-acp-runtime-deployment.zh-CN.md`:

```md
# Stander ACP Runtime 部署指南

## 概览

这个部署方式把 Stander Agent 通过 ACP 接入 TDS/OpenMA，并且不修改 TDS。

TDS 运行：

```bash
npx @stander-agent/stander-agent acp
```

ACP adapter 通过内网连接到：

```text
STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
```

## Runtime Service

在持有模型密钥和工具执行权限的私域环境里启动 Stander runtime service：

```bash
export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
export STANDER_MODEL=azure-gpt-o4-mini
export OPENAI_API_KEY="$YOUR_OPENAI_API_KEY"
export OPENAI_BASE_URL="$YOUR_OPENAI_BASE_URL"
npm run dev:runtime
```

## TDS Runtime 机器

如果使用私域 npm registry：

```bash
export STANDER_NPM_REGISTRY_URL="https://your-private-npm-registry"
npm config set @stander-agent:registry "$STANDER_NPM_REGISTRY_URL"
npm login --registry "$STANDER_NPM_REGISTRY_URL"
```

全局安装 adapter：

```bash
npm install -g @stander-agent/stander-agent
```

配置 adapter 环境变量：

```bash
export STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
export STANDER_MODEL=azure-gpt-o4-mini
```

## TDS 用户手动配置清单

1. 打开 TDS Local Runtimes，选择 Connect machine。
2. 在 TDS runtime 机器运行：

   ```bash
   npx @openma/cli@beta bridge setup
   ```

3. 确认 `oma bridge daemon` 已安装，并且会常驻运行。
4. 如果使用私域 npm，配置 `@stander-agent/stander-agent` 的 npm 来源。
5. 使用 `npm install -g @stander-agent/stander-agent` 全局安装 adapter。
6. 为 daemon 环境配置 `STANDER_RUNTIME_URL`、`STANDER_RUNTIME_TOKEN`、`STANDER_MODEL`。
7. 确认 TDS runtime 机器可以通过内网访问 Stander runtime service。
8. 重启或刷新 `oma bridge daemon`，让它重新 detect agents。
9. 在 TDS Local Runtimes 页面确认 `stander-agent` 出现在 detected agents。
10. 在 TDS New Agent 表单里选择 connected runtime 和 `stander-agent`。
11. 创建 agent，并发送一条测试消息。
12. 如果失败，按这个顺序看日志：`oma bridge daemon`、`stander-agent acp adapter`、`Stander runtime service`。
```

- [ ] **Step 3: Run docs-free verification**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/stander-acp-runtime-deployment.md docs/stander-acp-runtime-deployment.zh-CN.md
git commit -m "docs: add stander acp deployment guide"
```

---

## Task 8: End-to-End Local Smoke Test

**Files:**
- No source changes expected.
- Possible documentation fix only if smoke test exposes inaccurate instructions.

- [ ] **Step 1: Start fake/private runtime service**

Run:

```bash
export STANDER_RUNTIME_TOKEN=local-test-token
export STANDER_MODEL=azure-gpt-o4-mini
export PERSISTENCE_MODE=memory
npm run dev:runtime
```

Expected output:

```text
Stander runtime service listening on http://0.0.0.0:8787
```

Keep this process running.

- [ ] **Step 2: In another terminal, run ACP initialize by hand**

Run:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}\n' \
  | STANDER_RUNTIME_URL=http://127.0.0.1:8787 STANDER_RUNTIME_TOKEN=local-test-token npm run dev:acp
```

Expected output includes:

```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1
```

- [ ] **Step 3: Create a session through ACP by hand**

Run:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}\n{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"."}}\n' \
  | STANDER_RUNTIME_URL=http://127.0.0.1:8787 STANDER_RUNTIME_TOKEN=local-test-token npm run dev:acp
```

Expected output includes:

```json
{"jsonrpc":"2.0","id":2,"result":{"sessionId":"stander-runtime-
```

- [ ] **Step 4: Run the full automated suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit any smoke-test documentation fixes**

If no docs changed:

```bash
git status --short
```

Expected: no changes from this task.

If docs changed:

```bash
git add docs/stander-acp-runtime-deployment.md docs/stander-acp-runtime-deployment.zh-CN.md
git commit -m "docs: clarify stander acp smoke test"
```

---

## Final Verification

Run:

```bash
npm test
npm run build
git status --short
```

Expected:

- `npm test` passes.
- `npm run build` passes.
- Only intentional files are modified.
- Existing unrelated workspace changes remain untouched.

## Spec Coverage Review

This plan covers:

- ACP stdio adapter: Tasks 1, 3, 4, 5, 6.
- Remote runtime service: Task 2 and Task 5.
- Bearer-token authentication: Task 2 and Task 3.
- Default model `azure-gpt-o4-mini`: Tasks 2, 3, 5, and docs.
- Event mapping: Task 1 and Task 4.
- Cancellation path: Task 2 and Task 4.
- Deployment/manual operator checklist: Task 7.
- Local smoke testing: Task 8.

Not covered in first implementation by design:

- Official ACP registry submission.
- Public/private npm publishing.
- Durable sessions.
- Full TDS skill/tool/sandbox parity.
- TDS template integration.
