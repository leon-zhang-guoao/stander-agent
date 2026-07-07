# Stander Agent Platform Guiding Principles

## Purpose

Stander Agent should evolve from a single-agent demo into a small managed-agent platform inspired by Open Managed Agents, while using Strands Agents as the agent loop and orchestration engine.

The goal is not to copy Open Managed Agents wholesale. The goal is to build an OpenMA-style platform core around Strands:

```text
Strands Agents = brain / harness / agent loop
Stander Platform = meta-harness / API / sessions / events / tools / skills
```

## Current Position

The current project already has a useful baseline:

- HTTP server
- Browser UI
- In-memory session management
- Strands Agent runtime
- Streaming responses
- Basic tools: read, write, shell, HTTP, calculator
- Basic skill triggering with `$skill-name`
- Local model config through `config.json`

This is a good foundation, but it is still a single application harness. The next step is to separate platform concerns from Strands runtime concerns.

## Design Thesis

Open Managed Agents frames the system in three layers:

```text
Harness
  Reads history, builds context, calls the model, runs the loop.

Meta-Harness
  Prepares what is available: agents, sessions, tools, skills, events, memory,
  vaults, sandbox, streams, and lifecycle.

Infrastructure
  Stores data and runs isolated workloads.
```

For Stander Agent:

```text
Harness        -> Strands Agent / Graph / Swarm / MCP
Meta-Harness   -> Stander platform APIs, event log, registries, runtime
Infrastructure -> initially in-memory/local; later SQLite/Postgres and sandbox
```

The platform prepares what is available. The Strands harness decides how to use it.

## Near-Term Scope

Build a small OpenMA-style platform, not a full OpenMA clone.

In scope:

- Agents API
- Sessions API
- Event log
- Tool registry
- Skill registry
- Strands runtime adapter
- Streaming session messages
- Console/UI improvements
- Interfaces for persistence and sandboxing

Deferred:

- Durable session persistence
- Real sandbox isolation
- Vaults
- Memory stores
- Full MCP marketplace
- Integrations such as GitHub, Slack, Linear
- Billing, quotas, multi-tenant auth

Session persistence and sandboxing are important, but they should be designed as ports first and implemented later.

## Target Architecture

Suggested source layout:

```text
src/
  server.ts
  platform/
    agents-store.ts
    sessions-store.ts
    event-log.ts
    tool-registry.ts
    skill-registry.ts
    mcp-registry.ts
    runtime.ts
    persistence.ts
    sandbox.ts
  strands/
    create-agent.ts
    runtime-adapter.ts
    tools/
    skills.ts
```

Runtime flow:

```text
HTTP API
  -> Platform Runtime
    -> load AgentConfig
    -> load SessionState
    -> load tools and skills
    -> create or reuse Strands Agent
    -> call agent.stream()
    -> translate Strands events into SessionEvents
    -> append events
    -> stream events to client
```

## Core Domain Types

### AgentConfig

```ts
type AgentConfig = {
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
```

### SessionMeta

```ts
type SessionMeta = {
  id: string
  agentId: string
  status: 'idle' | 'running' | 'error'
  createdAt: string
  updatedAt: string
}
```

### SessionEvent

Start with a small event vocabulary and expand toward an OMA-style trajectory later.

```ts
type SessionEvent =
  | { type: 'session.created'; sessionId: string }
  | { type: 'session.status_running'; sessionId: string }
  | { type: 'session.status_idle'; sessionId: string }
  | { type: 'session.error'; sessionId: string; message: string }
  | { type: 'user.message'; sessionId: string; text: string }
  | { type: 'agent.text_delta'; sessionId: string; text: string }
  | { type: 'agent.message'; sessionId: string; text: string }
  | { type: 'agent.tool_use'; sessionId: string; name: string; input?: unknown }
  | { type: 'agent.tool_result'; sessionId: string; name?: string; result?: unknown }
```

Events should be the platform's source of truth. UI timelines, replay, debugging, future persistence, and future evaluation should consume events.

## API Shape

Prefer OpenMA-compatible naming where practical.

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

POST   /v1/sessions/:id/messages
GET    /v1/sessions/:id/events
GET    /v1/sessions/:id/events/stream

GET    /v1/tools
GET    /v1/skills
GET    /v1/skills/:name
```

The existing `/chat` and `/chat/stream` routes may remain temporarily as compatibility wrappers, but the platform path should be session-based.

## Tool Registry

Tools should move out of one fixed `src/agent.ts` list and into a registry.

Example:

```ts
type ToolRegistry = {
  list(): ToolSummary[]
  get(name: string): ToolDefinition | undefined
}
```

Agent configs should choose tools by name:

```json
{
  "tools": ["read_file", "write_file", "list_files", "run_shell"]
}
```

Recommended next tools:

- `list_files`
- `grep`
- `glob`
- `edit_file` or `apply_patch`
- safer `run_shell`

## Skill Registry

Current skills already follow a useful minimal shape:

```text
skills/<name>/SKILL.md
```

The platform version should support:

- listing skills
- reading skills
- assigning skills to an agent
- explicit user trigger with `$skill-name`
- injecting assigned skills into the system prompt
- injecting explicitly triggered skills into the current turn

Agent-level skill config:

```json
{
  "skills": ["code-review", "frontend"]
}
```

Rules:

- `agent.skills` are default capabilities.
- `$skill-name` is an explicit per-turn trigger.
- Skill content should be treated as instructions, not as executable code.

## Strands Runtime Adapter

Strands should be wrapped behind a runtime adapter so the platform does not depend on raw `Agent` usage everywhere.

```ts
interface AgentRuntime {
  runMessage(input: {
    agent: AgentConfig
    session: SessionMeta
    message: string
    events: SessionEvent[]
    signal?: AbortSignal
  }): AsyncIterable<SessionEvent>
}
```

The first implementation should use:

- `new Agent(...)`
- `agent.stream(...)`
- configured tools
- configured skills
- configured model provider

Later implementations may use:

- Strands Graph
- Strands Swarm
- agents-as-tools
- MCP-enriched agents

## Persistence Port

Persistence should be an interface first.

```ts
interface Persistence {
  agents: AgentStore
  sessions: SessionStore
  events: EventLog
}

interface EventLog {
  append(sessionId: string, event: SessionEvent): Promise<void>
  list(sessionId: string): Promise<SessionEvent[]>
}
```

Initial implementation:

```text
InMemoryPersistence
```

Future implementations:

```text
FilePersistence
SQLitePersistence
PostgresPersistence
```

Do not make the first platform version depend on durable persistence. Keep the interface stable and swap implementation later.

## Sandbox Port

Sandboxing should also be an interface first.

```ts
interface Sandbox {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string, options?: { overwrite?: boolean }): Promise<void>
  runShell(command: string): Promise<{ stdout: string; stderr?: string; exitCode: number }>
}
```

Initial implementation:

```text
LocalWorkspaceSandbox
```

Rules for the local implementation:

- restrict file paths to a workspace root
- block obvious dangerous commands
- set shell timeouts
- limit output size

Future implementations:

```text
DockerSandbox
E2BSandbox
CloudflareSandbox
```

Sandbox is intentionally deferred. The platform should call the sandbox port from tools, not call `fs` or `child_process` directly everywhere.

## MCP Plan

MCP should be a second-stage platform feature.

Agent config can eventually include MCP servers:

```ts
type McpServerConfig = {
  id: string
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
}
```

The runtime adapter can create `McpClient` instances and include them in the Strands tools list.

## Multi-Agent Plan

Use Strands multi-agent capabilities after the core platform is stable.

Possible patterns:

- agents-as-tools: orchestrator delegates to specialized agents
- Graph: deterministic workflows such as analyze -> implement -> test -> review
- Swarm: dynamic handoff between agents

Do not start here. Multi-agent orchestration depends on clean agents, sessions, events, and tools.

## Milestones

### M1: Platform API Skeleton

- Add `AgentConfig`
- Add `SessionMeta`
- Add in-memory stores
- Add event log interface and in-memory implementation
- Add `/v1/agents`
- Add `/v1/sessions`

### M2: Strands Runtime

- Add `AgentRuntime`
- Wrap Strands `agent.stream()`
- Translate Strands stream events into `SessionEvent`
- Implement `/v1/sessions/:id/messages`
- Implement `/v1/sessions/:id/events`
- Implement `/v1/sessions/:id/events/stream`

### M3: Registries

- Move tools into `ToolRegistry`
- Move skills into `SkillRegistry`
- Allow agents to select tools and skills
- Keep `$skill-name` trigger

### M4: Console UI

- Agent list
- Agent create/edit
- Session list
- Event timeline
- Tool call display
- Skill display

### M5: MCP and Multi-Agent

- Add MCP server config
- Add MCP client creation
- Add agents-as-tools experiment
- Add Graph/Swarm experiment

### M6: Deferred Infrastructure

- Implement persistence behind `Persistence`
- Implement sandbox behind `Sandbox`
- Add recovery/replay from event log
- Add stronger security boundaries

## Non-Goals for the First Platform Version

- Multi-tenant billing
- Vault credential isolation
- Cloudflare Durable Objects
- Real container sandbox
- Full OpenMA API compatibility
- GitHub/Slack/Linear integrations
- RL trajectory export

These are good future directions, but building them too early will slow down the core platform.

## Guiding Constraints

1. Keep Strands behind a runtime adapter.
2. Treat events as the source of truth.
3. Keep stores and sandbox behind interfaces.
4. Prefer small stable APIs over large framework abstractions.
5. Make tools and skills configurable by agent.
6. Preserve the simple local developer experience.
7. Add persistence and sandboxing only after the platform API is stable.

## Summary

The right direction is:

```text
single agent app
  -> managed agents API
  -> session event runtime
  -> configurable tools and skills
  -> Strands runtime adapter
  -> persistence and sandbox implementations
```

This turns Stander Agent into a small Open Managed Agents-style platform while keeping Strands Agents as the agent loop engine.
