# M7 执行计划：Multi-Agent Runs Session 化与 Timeline

## 摘要

M7 基于 M6 的 SQLite event log 和 session persistence，把 M5 的 Graph/Swarm 实验 API 接入 platform session truth。每次 Graph 或 Swarm run 都会创建 platform session、写入 multi-agent events，并可通过现有 `/v1/sessions/:id/events` 和 Console timeline 查看。

M7 不做拖拽 workflow builder、不保存可复用 workflow、不做 node-level live streaming，也不让 Graph/Swarm node agents 加载 tools/MCP/agentTools。

## 范围

- 新增 `SessionKind = "agent" | "graph" | "swarm"`。
- `SessionMeta` 增加 `kind`、可选 `title`、可选 `meta`。
- 普通 `/v1/sessions` 创建的 session 默认保持 `kind: "agent"`。
- Graph/Swarm run 会被持久化为 session：
  - Graph session 的 `agentId` 使用 `nodeAgentIds[0]`。
  - Swarm session 的 `agentId` 使用 `startAgentId`。
- 新增 multi-agent session events：
  - `multi_agent.run_started`
  - `multi_agent.node_result`
  - `multi_agent.run_completed`
  - `multi_agent.run_failed`
- SQLite migration 支持 `sessions.kind`、`sessions.title`、`sessions.meta`。
- Console 新增 `Runs` tab，提供简单 Graph 和 Swarm 表单。

## API 行为

### `POST /v1/multi-agent/graph/runs`

请求：

```json
{
  "input": "Analyze this problem",
  "nodeAgentIds": ["agent-a", "agent-b"],
  "edges": [["agent-a", "agent-b"]]
}
```

成功响应：

```json
{
  "sessionId": "...",
  "runId": "...",
  "status": "completed",
  "output": "...",
  "nodeResults": [],
  "events": []
}
```

运行前 validation 失败返回 `400`，并且不创建 session。

### `POST /v1/multi-agent/swarm/runs`

请求：

```json
{
  "input": "Coordinate a plan",
  "nodeAgentIds": ["agent-a", "agent-b"],
  "startAgentId": "agent-a",
  "maxSteps": 4
}
```

成功响应与 Graph 一致，包含 `sessionId`、`runId`、`status`、`output`、`nodeResults` 和 `events`。

如果 validation 之后执行失败，M7 会保留已创建的 session，追加 `multi_agent.run_failed`、`session.error`，并把 session 状态更新为 `error`。

### 直接消息

`POST /v1/sessions/:id/messages` 只接受 `kind: "agent"` 的 session。

Graph 或 Swarm session 返回：

```json
{ "error": "Session does not accept direct messages" }
```

状态码为 `400`。

## 事件契约

每个 multi-agent event 都包含：

- `sessionId`
- `runId`
- `mode: "graph" | "swarm"`
- 时间戳字段

Event log 仍然是 append-only，并作为刷新页面或服务重启后恢复 timeline 的事实来源。

## Console

Console 新增 `Runs` tab：

- Graph 表单：
  - input
  - node agents 多选
  - edges JSON textarea
- Swarm 表单：
  - input
  - node agents 多选
  - start agent select
  - max steps input
- Run 成功后，Console 自动选中新建 session，并用现有 timeline 渲染 run events。
- Session 列表优先显示 `session.title`，其次回退到关联 agent 名称。

## 验收

- `node --check public/app.js`
- `npm run build`
- `npm run test`
- unknown node agent 返回 `400`，不创建 session。
- invalid Graph edge 返回 `400`，不创建 session。
- Swarm `startAgentId` 不在 `nodeAgentIds` 中返回 `400`，不创建 session。
- Graph/Swarm 执行会创建 session 并写 run events。
- SQLite 重启后仍能看到 run sessions 和 multi-agent events。
- Console `Runs` tab 可以创建 Graph/Swarm run，并显示对应 timeline。

## 延后内容

- M8：Graph/Swarm visual builder。
- 可复用 workflow definitions。
- live node-level streaming。
- Graph/Swarm node agents 加载 tools、MCP servers 或 agentTools。
