# M1 Execution Plan: Platform API Skeleton

## Purpose

M1 turns Stander Agent from a single local Strands chat harness into the first slice of a managed-agent platform. The goal is to introduce stable platform-facing types, stores, and REST APIs without breaking the current local startup flow.

M1 should not implement the Strands runtime adapter, session message execution, event streaming, durable persistence, or real sandbox isolation. Those are later milestones.

## Scope

M1 includes:

- `AgentConfig`
- `SessionMeta`
- a minimal `SessionEvent` vocabulary
- store interfaces for agents, sessions, and event logs
- in-memory store implementations
- `/v1/agents`
- `/v1/sessions`
- preservation of the existing `/chat` and `/chat/stream` routes

M1 excludes:

- `POST /v1/sessions/:id/messages`
- `GET /v1/sessions/:id/events`
- `GET /v1/sessions/:id/events/stream`
- Strands stream event translation
- tool and skill registries
- MCP registry
- durable persistence
- real sandbox isolation

## Design Rules

- Keep Strands SDK usage behind the current simple local route for now.
- Do not move all runtime behavior into the platform API during M1.
- Treat events as the future source of truth, even if M1 only records lifecycle events.
- Keep stores behind interfaces so SQLite, Postgres, or file-backed storage can be added later.
- Keep the existing local development path working.
- Do not commit `config.json`; keep only `config.example.json`.

## Proposed Files

```text
src/
  platform/
    types.ts
    agents-store.ts
    sessions-store.ts
    event-log.ts
    persistence.ts
    in-memory-persistence.ts
    schemas.ts
```

## Platform Types

Create `src/platform/types.ts`.

Define:

```ts
export type AgentConfig = {
  id: string
  name: string
  modelId: string
  baseURL: string
  systemPrompt: string
  tools: string[]
  skills: string[]
  mcpServers?: string[]
  createdAt: string
  updatedAt: string
}

export type SessionStatus = 'idle' | 'running' | 'error'

export type SessionMeta = {
  id: string
  agentId: string
  status: SessionStatus
  createdAt: string
  updatedAt: string
}

export type SessionEvent =
  | { type: 'session.created'; sessionId: string; agentId: string; createdAt: string }
  | { type: 'session.deleted'; sessionId: string; deletedAt: string }
  | { type: 'session.status_updated'; sessionId: string; status: SessionStatus; updatedAt: string }
  | { type: 'session.error'; sessionId: string; message: string; createdAt: string }
```

Keep user and agent message events for M2, where the runtime adapter can generate them from Strands stream events.

## Store Interfaces

Create `src/platform/agents-store.ts`.

```ts
export interface AgentStore {
  create(input: CreateAgentConfigInput): Promise<AgentConfig>
  list(): Promise<AgentConfig[]>
  get(id: string): Promise<AgentConfig | undefined>
  update(id: string, patch: UpdateAgentConfigInput): Promise<AgentConfig | undefined>
  delete(id: string): Promise<boolean>
}
```

Create `src/platform/sessions-store.ts`.

```ts
export interface SessionStore {
  create(input: { agentId: string }): Promise<SessionMeta>
  list(): Promise<SessionMeta[]>
  get(id: string): Promise<SessionMeta | undefined>
  updateStatus(id: string, status: SessionStatus): Promise<SessionMeta | undefined>
  delete(id: string): Promise<boolean>
}
```

Create `src/platform/event-log.ts`.

```ts
export interface EventLog {
  append(sessionId: string, event: SessionEvent): Promise<void>
  list(sessionId: string): Promise<SessionEvent[]>
}
```

Create `src/platform/persistence.ts`.

```ts
export interface Persistence {
  agents: AgentStore
  sessions: SessionStore
  events: EventLog
}
```

## In-Memory Persistence

Create `src/platform/in-memory-persistence.ts`.

Implementation rules:

- Use `Map<string, AgentConfig>` for agents.
- Use `Map<string, SessionMeta>` for sessions.
- Use `Map<string, SessionEvent[]>` for events.
- Generate IDs with `randomUUID()`.
- Use ISO timestamp strings.
- Update `updatedAt` whenever a resource changes.
- Append `session.created` when a session is created.
- Append `session.deleted` when a session is deleted.

The implementation can be a single `createInMemoryPersistence()` factory that returns `Persistence`.

## Request Schemas

Create `src/platform/schemas.ts`.

Use `zod` schemas for:

- `createAgentRequestSchema`
- `patchAgentRequestSchema`
- `createPlatformSessionRequestSchema`

Recommended create-agent body:

```json
{
  "name": "Default",
  "modelId": "gpt-4.1-mini",
  "baseURL": "https://api.openai.com/v1",
  "systemPrompt": "You are helpful.",
  "tools": [],
  "skills": [],
  "mcpServers": []
}
```

Recommended create-session body:

```json
{
  "agentId": "agent-id"
}
```

## API Routes

Add the platform persistence singleton in `src/server.ts`.

```ts
const platform = createInMemoryPersistence()
```

Implement:

```http
POST   /v1/agents
GET    /v1/agents
GET    /v1/agents/:id
PATCH  /v1/agents/:id
DELETE /v1/agents/:id

POST   /v1/sessions
GET    /v1/sessions
GET    /v1/sessions/:id
DELETE /v1/sessions/:id
```

Response rules:

- Return `201` for created resources.
- Return `200` for successful reads, updates, and deletes.
- Return `404` for unknown agents or sessions.
- Return `400` for invalid request bodies.
- Verify that `agentId` exists before creating a session.

Keep the existing compatibility routes:

```http
POST   /chat
POST   /chat/stream
POST   /sessions
DELETE /sessions/:id
```

These compatibility routes may continue using the existing in-memory Strands agent session map until M2.

## Optional Debug Endpoint

Strict M1 can leave session events unexposed because `/v1/sessions/:id/events` belongs to M2.

If debugging the event log becomes useful during implementation, add:

```http
GET /v1/sessions/:id/events
```

If added, mark it as lifecycle-event-only until M2.

## Verification

Run:

```bash
npm run build
npm run test
```

Manual checks:

```bash
curl -X POST http://localhost:3000/v1/agents \
  -H 'content-type: application/json' \
  -d '{"name":"Default","modelId":"gpt-4.1-mini","baseURL":"https://api.openai.com/v1","systemPrompt":"You are helpful.","tools":[],"skills":[]}'

curl http://localhost:3000/v1/agents

curl -X POST http://localhost:3000/v1/sessions \
  -H 'content-type: application/json' \
  -d '{"agentId":"<agent-id>"}'

curl http://localhost:3000/v1/sessions
```

Also verify that the existing chat path still works:

```bash
curl -X POST http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message":"hello"}'
```

## Definition Of Done

M1 is complete when:

- platform types exist
- store interfaces exist
- in-memory persistence implements those interfaces
- `/v1/agents` CRUD works
- `/v1/sessions` create/list/get/delete works
- session lifecycle events are appended internally
- existing `/chat` and `/chat/stream` routes still work
- `npm run build` and `npm run test` pass

## Handoff To M2

M2 should build on this structure by adding:

- `AgentRuntime`
- Strands runtime adapter
- `POST /v1/sessions/:id/messages`
- `GET /v1/sessions/:id/events`
- `GET /v1/sessions/:id/events/stream`
- translation from Strands stream events into `SessionEvent`
