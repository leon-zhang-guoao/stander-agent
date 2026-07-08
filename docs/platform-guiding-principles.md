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
  modelProviderId?: string
  modelId: string
  baseURL: string
  systemPrompt: string
  tools: string[]
  skills: string[]
  mcpServers?: string[]
  agentTools?: string[]
  createdAt: string
  updatedAt: string
}
```

`modelProviderId` is optional during the transition from local config to platform-managed providers. When it is missing, `modelId` and `baseURL` keep the current OpenAI-compatible behavior.

### ModelProviderConfig

Users should be able to define reusable model providers and attach agents to them. A provider represents a connection target and credential reference, while an agent chooses the concrete model and prompt behavior.

```ts
type ModelProviderType =
  | 'openai-compatible'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'openrouter'
  | 'custom'

type ModelProviderConfig = {
  id: string
  name: string
  type: ModelProviderType
  baseURL: string
  apiKeyRef?: string
  defaultModelId?: string
  availableModels?: string[]
  capabilities: {
    streaming: boolean
    toolCalling: boolean
    vision: boolean
    jsonMode: boolean
    reasoning: boolean
  }
  enabled: boolean
  createdAt: string
  updatedAt: string
}
```

Rules:

- Store raw API keys only in the local in-memory provider store for development. Public provider reads should expose only `hasApiKey`, and future durable storage should move secrets behind a vault.
- Keep `config.json` as the local fallback for the legacy `/chat` routes until the platform path replaces them.
- Let each `AgentConfig` select `modelProviderId` and `modelId`; if `modelId` is omitted in a future version, use the provider's `defaultModelId`.
- Validate provider compatibility at runtime. For example, an agent that uses tools should warn or fail fast when the selected provider has `toolCalling: false`.
- Add a simple connection test endpoint before exposing provider editing in the UI.

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

POST   /v1/model-providers
GET    /v1/model-providers
GET    /v1/model-providers/:id
PATCH  /v1/model-providers/:id
DELETE /v1/model-providers/:id
POST   /v1/model-providers/:id/test

POST   /v1/mcp-servers
GET    /v1/mcp-servers
GET    /v1/mcp-servers/:id
PATCH  /v1/mcp-servers/:id
DELETE /v1/mcp-servers/:id
POST   /v1/mcp-servers/:id/test
GET    /v1/mcp-servers/:id/tools

POST   /v1/multi-agent/graph/runs
POST   /v1/multi-agent/swarm/runs
```

The existing `/chat` and `/chat/stream` routes may remain temporarily as compatibility wrappers, but the platform path should be session-based.

## Model Provider Management

Model providers are a platform concern, not a Strands-specific detail. They let users reuse model endpoints across agents, rotate credentials later, and make provider capabilities explicit.

Initial implementation:

- Add a `ModelProviderStore` interface and an in-memory implementation.
- Support OpenAI-compatible providers first, because the current runtime already uses `OpenAIModel`.
- Keep `baseURL`, `defaultModelId`, and capability metadata in the provider.
- Keep `modelId` on the agent so different agents can share one provider but use different models.
- Add `/v1/model-providers` CRUD and `/test` for a lightweight connection check.

Future implementation:

- Move `apiKeyRef` behind a vault or credential store.
- Add provider-specific adapters for Anthropic, Ollama, OpenRouter, and local models.
- Add model discovery when the provider exposes a models endpoint.
- Add per-provider defaults such as timeout, headers, rate-limit labels, and organization/project identifiers.

Do not put raw provider credentials into agent configs, session events, exported trajectories, or API responses that list/read providers.

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

## MCP Registry

MCP is a platform registry concern. Agent configs reference MCP server ids; the runtime adapter resolves enabled servers, creates `McpClient` instances, and adds those clients to the Strands tools list for the session runtime.

M5 supports a minimal local-development registry:

```ts
type McpServerConfig = {
  id: string
  name: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  enabled: boolean
  createdAt: string
  updatedAt: string
}
```

Rules:

- `/v1/mcp-servers/:id/test` creates a temporary MCP client, calls `listTools()`, and disconnects.
- `/v1/mcp-servers/:id/tools` returns live tool summaries and does not cache them into durable state.
- Disabled or missing MCP servers fail fast before session message execution.
- MCP credentials should be expressed through local environment/config during M5; do not write raw secrets into session events.
- Stdio MCP commands run locally in M5 and are not sandboxed yet.

## Multi-Agent Plan

Use Strands multi-agent capabilities in staged layers: agents-as-tools can participate in normal platform sessions; Graph and Swarm first enter as experiment APIs, then become sessionized runs once their event model is stable.

Supported M5 patterns:

- agents-as-tools: an orchestrator agent can expose selected child agents as callable tools through `agentTools`.
- Graph: deterministic workflows such as analyze -> implement -> test -> review through `/v1/multi-agent/graph/runs`.
- Swarm: dynamic handoff between agents through `/v1/multi-agent/swarm/runs`.

M5 introduced Graph and Swarm as experiment APIs. M7 sessionizes those runs: each run creates a platform session, writes `multi_agent.*` events to the append-only event log, and can be inspected through the existing session events API and Console timeline. M8 adds reusable workflow definitions and a visual builder while keeping runs mapped back to session truth. Node agents still use only their model, provider, system prompt, and skills; they avoid tools/MCP/agentTools to reduce side effects while the trajectory contract matures.

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

- Add `ModelProviderStore`
- Add `/v1/model-providers`
- Allow agents to select a model provider
- Move tools into `ToolRegistry`
- Move skills into `SkillRegistry`
- Allow agents to select tools and skills
- Keep `$skill-name` trigger

### M4: Console UI

- Agent list
- Agent create/edit
- Model provider list
- Model provider create/edit/test
- Session list
- Event timeline
- Tool call display
- Skill display

### M5: MCP and Multi-Agent

- Add `McpServerStore`
- Add `/v1/mcp-servers` CRUD, `/test`, and live `/tools`
- Allow agents to select MCP server ids
- Add `agentTools` for agents-as-tools delegation
- Add Graph/Swarm experiment run endpoints
- Add Console MCP registry and agent selection controls

### M6: Deferred Infrastructure

- Add SQLite persistence behind `Persistence`
- Add local provider API key storage behind `SecretStore`
- Add `GET /v1/platform/status`
- Add `Sandbox` and `LocalWorkspaceSandbox`
- Recover sessions and event timelines after server restart
- Keep Graph/Swarm visual builder deferred

### M7: Sessionized Multi-Agent Runs

- Add `SessionKind` for `agent`, `graph`, and `swarm`
- Persist Graph/Swarm runs as platform sessions
- Add `multi_agent.run_started`, `multi_agent.node_result`, `multi_agent.run_completed`, and `multi_agent.run_failed`
- Recover multi-agent timelines from SQLite event log
- Add Console `Runs` tab for simple Graph/Swarm forms
- Keep Graph/Swarm visual builder and reusable workflow persistence deferred to M8+

### M8: Visual Multi-Agent Builder

- Add `WorkflowDefinition` and `WorkflowStore`
- Add `/v1/workflows` CRUD and `/v1/workflows/:id/runs`
- Save reusable Graph/Swarm workflow definitions
- Add Console visual workflow builder with draggable nodes and Graph edges
- Map workflow runs back to sessions and timeline events
- Keep node-level live streaming, templates, and import/export deferred to M9+

### M9: Workflow Operations

- Add workflow import/export for portable workflow definitions
- Add built-in workflow templates for common Graph/Swarm starting points
- Add workflow run history derived from session metadata and event log
- Improve Console workflow run status and timeline visibility
- Keep node-level live streaming deferred to M10 while the Graph/Swarm event contract matures

### M10: Node-Level Workflow Streaming

- Decide whether node-level live streaming becomes part of the platform event contract
- Explore replacing or wrapping Graph/Swarm execution to surface node start/progress/end events
- Add richer run filters, workflow templates, and governance only after the run event model is stable

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
5. Make model providers, tools, and skills configurable by agent.
6. Never store raw model provider credentials in agent configs or events.
7. Preserve the simple local developer experience.
8. Add persistence and sandboxing only after the platform API is stable.

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
