# M8 执行计划：Visual Multi-Agent Workflow Builder

## 摘要

M8 基于 M7 sessionized Graph/Swarm runs，新增可复用 multi-agent workflow 定义和 Console 可视化编排器。用户可以创建、保存、编辑并运行 Graph 或 Swarm workflow。每次运行仍创建 platform session，并写入现有 `multi_agent.*` timeline events。

M8 不做 node-level live streaming、不做 workflow import/export、不做 templates、不做权限，也不让 Graph/Swarm node agents 加载 tools/MCP/agentTools。

## 关键改动

- 新增 `WorkflowDefinition`、`WorkflowNode`、`WorkflowEdge` 和 `WorkflowStore`。
- in-memory 和 SQLite persistence 都支持 workflow 持久化。
- 新增 `/v1/workflows` CRUD 和 `/v1/workflows/:id/runs`。
- 保留 M7 ad-hoc `/v1/multi-agent/graph/runs` 和 `/v1/multi-agent/swarm/runs`。
- 将 Console 的 `Runs` 区域升级为 `Workflows` builder：saved workflow 列表、SVG 连线画布、可拖拽 agent nodes、node inspector 和 workflow run 表单。

## API 行为

- `POST /v1/workflows` 在校验 node ids、agent 引用、Graph edges 和 Swarm start node 后创建 workflow。
- `GET /v1/workflows` 列出已保存 workflows。
- `GET /v1/workflows/:id` 返回单个 workflow 或 `404`。
- `PATCH /v1/workflows/:id` 拒绝空 patch，校验合并后的 workflow，并返回更新结果。
- `DELETE /v1/workflows/:id` 只删除 workflow definition；历史 run sessions 继续可读。
- `POST /v1/workflows/:id/runs` 接收 `{ input }`，执行已保存 Graph/Swarm workflow，返回 `sessionId/runId/workflowId/status/output/nodeResults/events`，并写入 M7 timeline events。

## 测试计划

- `node --check public/app.js`
- `npm run build`
- `npm run test`
- API smoke：
  - 创建/list/get/patch/delete Graph workflow
  - 创建/list/get/patch/delete Swarm workflow
  - unknown agent、invalid edge、invalid start node 返回 `400`
  - workflow run 创建 session 并写 multi-agent events
  - SQLite 重启后恢复 workflows、run sessions 和 events
- Console smoke：
  - 创建 workflow
  - 添加 agent nodes
  - 拖拽 nodes
  - 连接 Graph nodes
  - 保存后刷新可恢复 workflow positions
  - 运行 workflow 并查看对应 timeline

## 假设

- M8 继续使用 vanilla HTML/CSS/JS。
- Workflow nodes 的画布位置作为 workflow definition 的一部分保存。
- Graph/Swarm node agents 仍只使用 model/provider/systemPrompt/skills。
- node-level live streaming、workflow templates、import/export 和更完整的 workflow governance 延后到 M9+。
