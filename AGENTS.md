# AGENTS.md

This project is evolving from a small Strands-based agent harness into an Open Managed Agents-style managed-agent platform.

Use the references below as the primary local knowledge sources before inventing new architecture or APIs.

## Source Research Priority

When researching this repository's source code, use CodeGraph first whenever the `.codegraph/` directory exists.

- Prefer `codegraph_explore` when the MCP tool is available.
- Otherwise use `codegraph explore "<question, file, or symbol>"` from the shell.
- Fall back to `rg`, `sed`, or direct file reads only after CodeGraph does not provide enough context, or for non-code files that CodeGraph does not index.

## Reference Sources

### 1. `stander-agent.txt`

Path:

```text
/Users/ameng/Desktop/code/stander-agent/stander-agent.txt
```

Use this when:

- You need quick local documentation about Strands Agents concepts.
- You want to look up high-level Strands capabilities, such as tools, agent loop, model-driven agents, MCP, community packages, deployment ideas, or multi-agent concepts.
- You need broad context without browsing the internet.

How to use:

- Search first with `rg`, not by opening the whole file.
- Prefer targeted searches:

```bash
rg -n "agent loop|tools|MCP|Graph|Swarm|session|hook|telemetry" stander-agent.txt
```

- Open only the matching line ranges with `sed` or `nl -ba`.
- Treat this file as documentation/context, not as source code.

Notes:

- This file is large.
- It may contain scraped or concatenated documentation.
- For exact SDK behavior, confirm against the official SDK source in `harness-sdk`.

### 2. Strands Agents TypeScript SDK

Path:

```text
/Users/ameng/Desktop/code/harness-sdk
```

Use this when:

- You need authoritative behavior for Strands TypeScript SDK APIs.
- You need to inspect official examples.
- You need to understand `Agent`, tools, stream events, hooks, MCP, session managers, telemetry, Graph, Swarm, or browser-agent patterns.
- You are implementing project code that depends on Strands SDK behavior.

Important subpaths:

```text
/Users/ameng/Desktop/code/harness-sdk/strands-ts/README.md
/Users/ameng/Desktop/code/harness-sdk/strands-ts/examples/
/Users/ameng/Desktop/code/harness-sdk/strands-ts/src/
```

Example directories:

```text
examples/first-agent        Basic Agent, tools, invoke, stream
examples/mcp                MCP integration
examples/agents-as-tools    Agents wrapped as tools
examples/graph              Deterministic multi-agent Graph
examples/swarm              Dynamic multi-agent handoff
examples/browser-agent      Browser-based Agent demo
examples/telemetry          OpenTelemetry / Jaeger tracing
```

How to use:

- Start from `examples/README.md` when comparing capabilities.
- Use examples for integration patterns.
- Use `src/` for exact types and event names.
- Prefer local source over assumptions.

Useful commands:

```bash
rg -n "class Agent|stream\\(|ContentBlockEvent|ToolResultEvent" /Users/ameng/Desktop/code/harness-sdk/strands-ts/src
rg -n "Graph|Swarm|McpClient|setupTracer" /Users/ameng/Desktop/code/harness-sdk/strands-ts/examples
```

Notes:

- For stream handling, verify actual event names in SDK source. Do not assume simplified event names.
- For multi-agent work, compare `graph`, `swarm`, and `agents-as-tools` examples before choosing a design.

### 3. Open Managed Agents

Path:

```text
/Users/ameng/Desktop/code/open-managed-agents
```

Use this when:

- You are designing platform-level architecture.
- You need guidance for managed-agent APIs, sessions, event logs, tool registries, skill registries, runtime ports, persistence ports, sandbox ports, memory, vaults, MCP, or console UI.
- You are deciding how Stander Agent should evolve toward an OpenMA-style platform.

Important files:

```text
/Users/ameng/Desktop/code/open-managed-agents/README.md
/Users/ameng/Desktop/code/open-managed-agents/docs/architecture-overview.md
/Users/ameng/Desktop/code/open-managed-agents/docs/trajectory-v1-spec.md
```

Important packages:

```text
packages/api-types
packages/http-routes
packages/session-runtime
packages/sessions-store
packages/event-log
packages/sandbox
packages/memory-store
packages/vaults-store
```

How to use:

- Use Open Managed Agents as an architectural reference, not as code to copy wholesale.
- Extract concepts and boundaries:
  - agents
  - sessions
  - event log
  - trajectory
  - runtime ports
  - sandbox ports
  - persistence ports
  - skills
  - tools
- Keep Stander Agent smaller and Strands-native.

Useful commands:

```bash
rg -n "AgentConfig|SessionEvent|StoredEvent|Harness|Sandbox|EventLog" /Users/ameng/Desktop/code/open-managed-agents
rg -n "sessions|agents|events|trajectory" /Users/ameng/Desktop/code/open-managed-agents/docs
```

Notes:

- Open Managed Agents is a large monorepo with Cloudflare, Durable Objects, storage, integrations, and sandboxing.
- Do not import its internal packages into this project unless explicitly planned.
- Use it to shape interfaces and roadmap.

## Project Direction

Stander Agent should follow this sequence:

```text
single agent app
  -> managed agents API
  -> session event runtime
  -> configurable tools and skills
  -> Strands runtime adapter
  -> persistence and sandbox implementations
```

Current priority:

```text
M1: Platform API skeleton
- AgentConfig
- SessionMeta
- SessionEvent
- in-memory stores
- /v1/agents
- /v1/sessions
- event log interface
```

Deferred by design:

```text
- durable session persistence
- real sandbox isolation
```

These should be represented as interfaces first, then implemented later.

## Implementation Rules

- Prefer `rg` for searching.
- Read local source before changing architecture.
- Keep Strands SDK usage behind a runtime adapter as the platform evolves.
- Treat events as the future source of truth.
- Keep stores and sandbox behind interfaces.
- Do not hard-code all tools in one fixed agent forever; move toward a registry.
- Do not break the current simple local startup flow without replacing it.
- Keep `config.json` local only; commit only `config.example.json`.

## Response Language Rule

- Reply to the user in Chinese by default for all conversations, status updates, reviews, explanations, and final answers.
- Keep code, API names, file paths, commands, identifiers, and protocol literals in their original language.
- If the user explicitly asks for another language for a specific artifact or response, follow that request for that item only.

## Documentation Language Rule

For documentation-type tasks, especially architecture notes, design proposals, guiding-principle documents, roadmap documents, implementation plans, and operational guides, produce both English and Chinese versions by default.

Use this split:

```text
English version -> for agents, tools, future automation, and code-facing references.
Chinese version -> for the user to read, review, and discuss.
```

Recommended naming:

```text
docs/example.md
docs/example.zh-CN.md
```

When updating an existing document, update both language versions unless the user explicitly asks for only one language.

## Related Project Docs

Project roadmap and platform design:

```text
docs/platform-guiding-principles.md
docs/platform-guiding-principles.zh-CN.md
```
