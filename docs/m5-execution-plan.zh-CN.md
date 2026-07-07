# M5 执行计划：MCP Registry 与 Multi-Agent Experiments

## 摘要

M5 在 M1-M4 平台基础上增加 MCP server registry，以及第一批 Strands multi-agent 实验入口。Agent 可以选择 MCP server ids 和 child agent ids。Runtime 会解析这些引用，把 enabled MCP clients 和 agents-as-tools 加入 Strands，并把 Graph/Swarm 保持为不进入 platform session truth 的显式实验 API。

M5 不增加 durable persistence、vault 存储、sandbox 隔离、权限确认流或完整 multi-agent timeline UI。

## 平台类型与 Store

- 增加 `McpServerConfig`、`CreateMcpServerInput` 和 `UpdateMcpServerInput`。
- 增加 `McpServerStore`，并挂到 `persistence.mcpServers`。
- 明确 `AgentConfig.mcpServers` 表示 MCP server id 引用。
- 增加 `AgentConfig.agentTools?: string[]`，表示 agents-as-tools 的 child agent id 引用。
- M5 继续只使用 in-memory persistence。

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

支持的 transport：

- `stdio`：`{ name, transport: "stdio", command, args?, env?, cwd?, enabled? }`
- `streamable-http`：`{ name, transport: "streamable-http", url, headers?, enabled? }`

行为：

- 非法 body 返回 `400 { error: "Invalid request body" }`。
- 未知 MCP server 返回 `404 { error: "MCP server not found" }`。
- 空 patch 非法。
- `/test` 创建临时 `McpClient`，调用 `listTools()`，断开连接，并返回 `{ ok, tools, error? }`。
- `/tools` 返回 live tool 摘要，不持久化缓存。

## Runtime 接入

- `StrandsRuntime` 为每个 platform session 解析 selected built-in tools、enabled MCP clients 和 selected child-agent tools。
- Runtime cache key 包含 agent、provider、MCP server 和 child agent 的 `updatedAt`。
- 相关配置更新后，同一 session 下一轮会重建 runtime agent。
- 删除 session 时断开该 session 持有的 MCP clients。
- missing 或 disabled MCP server 会在模型执行前失败，并追加 `session.error`。

## Agents-as-Tools

- Agent create/update 支持 `agentTools`。
- 未知 child agent 和直接 self-reference 会被拒绝。
- 每个 child agent 暴露为 `call_agent_<childAgentIdWithoutHyphens>`。
- Tool input 为 `{ query: string }`。
- Child agent 使用自己的 provider、model、system prompt、tools、skills 和 MCP servers。
- M5 不递归展开 child agent 自己的 `agentTools`。

## Multi-Agent 实验 API

```http
POST /v1/multi-agent/graph/runs
POST /v1/multi-agent/swarm/runs
```

Graph body：

```json
{ "input": "...", "nodeAgentIds": ["..."], "edges": [["source", "target"]] }
```

Swarm body：

```json
{ "input": "...", "nodeAgentIds": ["..."], "startAgentId": "...", "maxSteps": 4 }
```

规则：

- Graph/Swarm run 返回 `{ status, output, nodeResults }`。
- unknown node agents、invalid edges 和 missing start agent 返回 `400`。
- 实验 run 不创建 session，不写 event log，也不提供 SSE。
- Node agents 使用各自的 model、provider、system prompt 和 skills；故意不加载 tools、MCP 和 agentTools，以降低副作用。

## Console UI

- 增加 `MCP` tab，支持列表、创建、编辑、删除、测试和 live tools 查看。
- Agent 表单增加 MCP server 多选和 child agent 多选。
- Graph/Swarm 在 M5 中保持为 HTTP smoke test API，不做可视化编辑器。

## 验证

运行：

```bash
node --check public/app.js
npm run build
npm run test
```

Smoke：

- 创建/list/get/patch/delete MCP server。
- 确认 invalid MCP body 返回 `400`。
- 确认 unknown delete 返回 `404`。
- 确认 `/test` 和 `/tools` 返回 tools 或明确连接错误。
- 创建 agent 时传 unknown MCP 或 child agent ids，确认返回 `400`。
- 创建 child agent 和 orchestrator agent，确认 `agentTools` 能保存。
- 使用 disabled MCP server 发消息时返回明确错误，并写入 `session.error`。
- Graph/Swarm validation error 返回 `400`。
- 复查 M1-M4 流程：providers、agents、sessions、messages、events、Console timeline 和 legacy `/chat`。
