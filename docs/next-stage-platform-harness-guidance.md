# Next Stage Guidance: Platform and Harness Boundary Hardening

## Purpose

This document defines the next platform stage for Stander Agent. It borrows the most useful Open Managed Agents boundary lessons while keeping this project smaller, local-first, and Strands-native.

The goal is not to copy OMA. The goal is to make Stander Agent's platform/runtime split strong enough that sessions, events, prompts, tools, and future workflow runs can be recovered, replayed, inspected, and governed without depending on Strands internals as the source of truth.

One sentence:

```text
Stander Platform owns session truth and capability preparation.
Strands Runtime owns loop orchestration and model/tool execution strategy.
```

## Why This Stage Exists

The current project already has the right direction:

- `AgentConfig`, `SessionMeta`, `SessionEvent`, stores, and registries exist.
- `AgentRuntime` wraps Strands usage.
- Session messages append events and stream runtime output.
- Tools, skills, model providers, MCP servers, agent tools, workflows, and sandbox ports are already represented.

The remaining risk is that some runtime behavior still depends on Strands' internal conversation state and adapter-local prompt assembly. That is fine for a working local app, but it weakens the managed-agent platform model.

This stage turns events and platform-prepared context into the primary contract.

## Core Principles

### 1. Event Log Is Session Truth

The append-only `SessionEvent` log should become the authoritative source for:

- session replay
- model context derivation
- UI timeline rendering
- debugging
- crash recovery
- future eval and trajectory export
- workflow run history

Runtime adapters may cache Strands agents for performance, but they must not require in-memory Strands conversation state to understand the session.

### 2. Harnesses Consume Platform Context

The platform should resolve and prepare the context that any harness needs:

- resolved agent config
- resolved model provider and credentials reference
- enabled tools
- enabled MCP servers
- callable child agents
- skill prompt fragments
- platform guidance
- session events
- sandbox port
- abort signal and stream lifecycle hooks

The harness decides how to use those inputs in the loop, but it should not be the owner of platform governance or session truth.

### 3. Prompt Assembly Is a Platform Capability

System prompt construction should move toward a platform-owned function, for example:

```ts
composePlatformPrompt({
  agent,
  defaultSkills,
  triggeredSkills,
  platformGuidance,
  memoryPrompts,
  appendablePrompts,
})
```

The Strands adapter can still pass the final result into `new Agent(...)`, but skill injection and platform guidance should not be hidden inside the adapter.

### 4. Context Projection Is an Explicit Contract

Add an explicit projection step:

```ts
deriveModelContext(events: SessionEvent[], options: DeriveModelContextOptions): ModelContext
```

The first implementation can be simple:

- convert `user.message` to user messages
- convert final `agent.message` to assistant messages
- ignore `agent.text_delta` when a final `agent.message` exists
- include compacted summaries once compaction events exist
- keep tool events out of the model context until their ids and payloads are reliable

Later implementations can add sliding windows, RAG, compaction, and workflow-specific context rules.

### 5. Compaction Must Be Evented

Compaction should not mutate or delete session history. It should append a durable event, such as:

```ts
{
  type: 'agent.thread_context_compacted',
  sessionId: string,
  summary: unknown,
  compactedEventCount: number,
  reason: string,
  createdAt: string
}
```

Projection code then decides how to replace older events with the summary for model input. The raw event log remains available for replay, audits, and evaluation.

### 6. Tool Use Needs Stable IDs

Tool events should become correlatable:

```ts
agent.tool_use    -> toolUseId, name, input
agent.tool_result -> toolUseId, name, result, error?
```

This enables:

- timeline grouping
- pending confirmation flows
- retry/recovery
- sub-agent lineage
- eval and trajectory export

### 7. Runtime Interface Should Grow Carefully

Keep `AgentRuntime.runMessage()` as the first stable adapter entry point, but evolve the input from raw pieces into a resolved runtime context:

```ts
type ResolvedRuntimeContext = {
  agent: AgentConfig
  session: SessionMeta
  modelProvider?: ModelProviderConfig
  systemPrompt: string
  events: SessionEvent[]
  modelContext: ModelContext
  tools: RuntimeTool[]
  mcpServers: McpServerConfig[]
  agentTools: AgentConfig[]
  signal?: AbortSignal
}
```

The platform prepares this object. The Strands adapter consumes it.

## Next Stage Scope

### In Scope

- Add a platform prompt composition module.
- Add a model context projection module.
- Change `StrandsRuntime` to consume platform-composed prompt/context where feasible.
- Extend `SessionEvent` with stable ids and richer tool payloads.
- Add compaction event types and projection semantics, even if automatic compaction is implemented later.
- Add tests for event-to-context projection and prompt composition.
- Preserve current `/chat` and `/v1/sessions` local startup flow.

### Out of Scope

- Full OpenMA API compatibility.
- Durable multi-tenant auth, billing, or quotas.
- Real container sandbox isolation.
- Vault-backed credential isolation.
- Full trajectory export implementation.
- Replacing Strands with a custom loop.

## Suggested Implementation Order

1. Create `src/platform/prompt.ts`.
2. Create `src/platform/context-projection.ts`.
3. Add unit tests for prompt composition and event projection.
4. Add event ids and tool-use ids to new session events.
5. Update `StrandsRuntime` to use platform-composed prompt and derived model context.
6. Add compaction event types and no-op projection support.
7. Add API/UI timeline improvements for correlated tool events.

## Acceptance Criteria

- A session can be reconstructed from `SessionEvent[]` without relying on Strands in-memory conversation state.
- Prompt assembly is testable outside `StrandsRuntime`.
- Event-to-model-context projection is testable outside `StrandsRuntime`.
- Tool use and tool result events can be correlated by id.
- Existing local startup and simple chat flow still work.
- The Strands adapter remains the loop engine, not the platform truth source.

## Design Guardrails

- Do not import OpenMA internal packages.
- Keep Stander Agent smaller than OpenMA.
- Prefer ports and plain TypeScript modules over framework-heavy abstractions.
- Preserve existing local development ergonomics.
- Expand the event model gradually, with compatibility for older events.
- Treat raw credentials as secrets; do not write them into events, agent configs, or exported trajectories.

## Relationship to Existing Roadmap

This guidance should be treated as a platform hardening stage before deeper workflow streaming, durable recovery, or trajectory export.

It complements the existing roadmap:

```text
single agent app
  -> managed agents API
  -> session event runtime
  -> configurable tools and skills
  -> Strands runtime adapter
  -> platform/harness boundary hardening
  -> persistence, sandbox, workflow streaming, and trajectory export
```

The key shift is subtle but important: events are no longer only something the runtime emits. Events become the substrate from which runtime context, timelines, recovery, and future evaluation are derived.
