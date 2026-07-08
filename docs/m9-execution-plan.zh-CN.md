# M9 执行计划：Workflow Operations

## 摘要

M9 基于 M8 的 visual workflow builder，补齐 workflow 运维能力：import/export、内置 templates、workflow run history，以及 Console 中更清晰的 workflow run 状态展示。目标是让已保存的 workflows 可以复用、迁移、审计和回看，同时不新增独立 run store。

M9 不改变 Graph/Swarm node agent 的执行边界。Node agents 仍只使用 model/provider/systemPrompt/skills，不加载 tools、MCP servers 或 agentTools。多人协作、权限系统和模板市场继续留到后续。

## 关键改动

- 新增 `GET /v1/workflows/:id/export`，返回可迁移的 workflow JSON。
- 新增 `POST /v1/workflows/import`，校验后创建新的本地 workflow id。
- 新增内置 workflow template APIs：
  - `GET /v1/workflow-templates`
  - `POST /v1/workflow-templates/:id/create`
- 新增三个初始 templates：
  - `graph-review-flow`：Plan -> Implement -> Review
  - `graph-research-flow`：Research -> Synthesize
  - `swarm-brainstorm`：multi-agent brainstorm 起点
- 新增 `GET /v1/workflows/:id/runs`，从 sessions 和 event log 推导，不新增 run 表。
- Console workflow 区域新增 Export JSON、Import JSON、Templates 和 Run History 面板。
- 增强 workflow run timeline 文案，展示 workflow/run 状态、node result count 和错误摘要。

## API 行为

- `GET /v1/workflows/:id/export`
  - 返回 `200` workflow JSON，包含 name、description、kind、nodes、edges、可选 Swarm 配置和 `exportedAt`。
  - workflow 不存在返回 `404 { error: "Workflow not found" }`。
- `POST /v1/workflows/import`
  - 接收 exported workflow 形状的 JSON。
  - 忽略原始 `id/createdAt/updatedAt`。
  - 名称追加 `Imported` 和 timestamp。
  - 创建前校验 agent 引用、node ids、edges 和 Swarm start node。
- `GET /v1/workflow-templates`
  - 返回 template 摘要：`id/name/description/kind/nodeLabels`。
- `POST /v1/workflow-templates/:id/create`
  - 返回 draft-like `WorkflowDefinition`，其中 `id: ""`。
  - Nodes 带 label 和 position，但 `agentId` 是空字符串占位。
  - Console 要求用户补齐 agents 后才能保存或运行。
- `GET /v1/workflows/:id/runs`
  - 按 `session.meta.workflowId` 筛选 sessions。
  - 从 session metadata 和 `multi_agent.*` events 推导 `sessionId/runId/status/startedAt/completedAt/error/outputPreview`。
  - 按 `startedAt` 倒序返回。

## 测试计划

- `node --check public/app.js`
- `npm run build`
- `npm run test`
- API smoke：
  - 导出 workflow 后再导入，得到新的 workflow。
  - 导入 unknown agent workflow，确认返回 `400`。
  - 列出 workflow templates，确认有三个内置模板。
  - 从 template 创建 draft，确认 node `agentId` 是空占位。
  - 运行 workflow，确认 `/v1/workflows/:id/runs` 返回新 session summary。
  - 删除 workflow 后，确认历史 sessions/events 仍可通过 `/v1/sessions` 和 `/events` 读取。
- Console smoke：
  - 从已保存 workflow 导出 JSON。
  - 导入 JSON 并选中新 workflow。
  - 从 template 创建 workflow，补齐 node agents，保存并运行。
  - Run History 出现新记录，点击记录可打开 session timeline。
  - 刷新页面后 workflows、history 和 timelines 可从 SQLite 恢复。

## 假设

- M9 继续使用 vanilla HTML/CSS/JS。
- Templates 是代码内置静态模板，不做持久化 template records。
- Run history 从 session truth 和 event log 推导。
- Node-level live streaming 延后到 M10，因为它需要替换 Graph/Swarm 执行编排或等待 SDK 暴露 node event streams。
