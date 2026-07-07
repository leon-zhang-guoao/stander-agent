# M5 Execution Plan: MCP Registry and Multi-Agent Experiments

## Summary

M5 extends the M1-M4 platform with an MCP server registry and the first Strands multi-agent experiment paths. Agents can select MCP server ids and child agent ids. The runtime resolves those references, adds enabled MCP clients and agents-as-tools to Strands, and keeps Graph/Swarm as explicit experiment APIs outside the platform session truth.

M5 does not add durable persistence, vault storage, sandbox isolation, permission confirmation flows, or a full multi-agent timeline UI.

## Platform Types and Stores

- Add `McpServerConfig`, `CreateMcpServerInput`, and `UpdateMcpServerInput`.
- Add `McpServerStore` and expose it as `persistence.mcpServers`.
- Treat `AgentConfig.mcpServers` as MCP server id references.
- Add `AgentConfig.agentTools?: string[]` as child agent id references for agents-as-tools.
- Keep the in-memory persistence implementation as the only M5 storage backend.

## MCP API

```http
POST   /v1/mcp-servers
GET    /v1/mcp-servers
GET    /v1/mcp-servers/:id
PATCH  /v1/mcp-servers/:id
DELETE /v1/mcp-servers/:id
POST   /v1/mcp-servers/:id/test
GET    /v1/mcp-servers/:id/tools
```

Supported transports:

- `stdio`: `{ name, transport: "stdio", command, args?, env?, cwd?, enabled? }`
- `streamable-http`: `{ name, transport: "streamable-http", url, headers?, enabled? }`

Behavior:

- Invalid bodies return `400 { error: "Invalid request body" }`.
- Unknown MCP servers return `404 { error: "MCP server not found" }`.
- Empty patches are invalid.
- `/test` creates a temporary `McpClient`, calls `listTools()`, disconnects, and returns `{ ok, tools, error? }`.
- `/tools` returns live tool summaries and does not persist a cache.

## Runtime Integration

- `StrandsRuntime` resolves the selected built-in tools, enabled MCP clients, and selected child-agent tools for each platform session.
- Runtime cache keys include agent, provider, MCP server, and child agent `updatedAt` values.
- Updating a related config causes the next session turn to rebuild the runtime agent.
- Deleting a session disconnects session-owned MCP clients.
- Missing or disabled MCP servers fail before model execution and append `session.error`.

## Agents-as-Tools

- Agent create/update accepts `agentTools`.
- Unknown child agents and direct self-reference are rejected.
- Each child agent is exposed as `call_agent_<childAgentIdWithoutHyphens>`.
- Tool input is `{ query: string }`.
- The child agent runs with its own provider, model, system prompt, tools, skills, and MCP servers.
- M5 does not recursively expand the child agent's own `agentTools`.

## Multi-Agent Experiment API

```http
POST /v1/multi-agent/graph/runs
POST /v1/multi-agent/swarm/runs
```

Graph body:

```json
{ "input": "...", "nodeAgentIds": ["..."], "edges": [["source", "target"]] }
```

Swarm body:

```json
{ "input": "...", "nodeAgentIds": ["..."], "startAgentId": "...", "maxSteps": 4 }
```

Rules:

- Graph/Swarm runs return `{ status, output, nodeResults }`.
- Unknown node agents, invalid edges, and missing start agents return `400`.
- Experiment runs do not create sessions, do not write the event log, and do not stream SSE.
- Node agents use their model, provider, system prompt, and skills; tools, MCP, and agentTools are intentionally not loaded.

## Console UI

- Add an `MCP` tab with list, create, edit, delete, test, and live tools inspection.
- Extend the agent form with MCP server multi-select and child agent multi-select.
- Keep Graph/Swarm as HTTP-only smoke-test APIs in M5.

## Verification

Run:

```bash
node --check public/app.js
npm run build
npm run test
```

Smoke:

- Create/list/get/patch/delete MCP servers.
- Confirm invalid MCP bodies return `400`.
- Confirm unknown deletes return `404`.
- Confirm `/test` and `/tools` return either tools or explicit connection errors.
- Create an agent with unknown MCP or child agent ids and confirm `400`.
- Create child and orchestrator agents, then verify `agentTools` persists.
- Verify disabled MCP server use during message execution returns an explicit error and writes a `session.error`.
- Verify Graph/Swarm validation errors return `400`.
- Recheck M1-M4 flows: providers, agents, sessions, messages, events, Console timeline, and legacy `/chat`.
