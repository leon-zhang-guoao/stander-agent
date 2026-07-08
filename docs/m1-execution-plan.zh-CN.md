# M1 执行计划：Platform API 骨架

## 目标

M1 的目标是把 Stander Agent 从一个单一的本地 Strands chat harness，推进到 managed-agent platform 的第一层骨架。这个阶段只建立平台侧稳定的类型、store 边界和 REST API，不破坏当前简单的本地启动流程。

M1 不实现 Strands runtime adapter、不实现 session 消息执行、不实现事件流、不实现持久化数据库，也不实现真正的 sandbox 隔离。这些都留到后续 milestone。

## 范围

M1 包含：

- `AgentConfig`
- `SessionMeta`
- 最小的 `SessionEvent` 事件词汇
- agents、sessions、event log 的 store 接口
- 内存 store 实现
- `/v1/agents`
- `/v1/sessions`
- 保留现有 `/chat` 和 `/chat/stream` 路由

M1 不包含：

- `POST /v1/sessions/:id/messages`
- `GET /v1/sessions/:id/events`
- `GET /v1/sessions/:id/events/stream`
- Strands stream event 转换
- tool 和 skill registry
- MCP registry
- durable persistence
- 真正的 sandbox 隔离

## 设计规则

- M1 阶段暂时让 Strands SDK 继续留在当前简单本地路由后面。
- 不要在 M1 里把全部 runtime 行为迁进 platform API。
- 即使 M1 只记录生命周期事件，也要把 events 当成未来的事实来源。
- stores 必须走接口，方便后续替换为 SQLite、Postgres 或文件存储。
- 当前本地开发路径必须继续可用。
- 不提交 `config.json`，只保留 `config.example.json`。

## 建议文件结构

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

## 平台类型

新增 `src/platform/types.ts`。

定义：

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

`user.message`、`agent.text_delta`、`agent.message`、`agent.tool_use`、`agent.tool_result` 等运行期事件放到 M2。因为它们应该来自 Strands runtime adapter 对 stream events 的转换。

## Store 接口

新增 `src/platform/agents-store.ts`。

```ts
export interface AgentStore {
  create(input: CreateAgentConfigInput): Promise<AgentConfig>
  list(): Promise<AgentConfig[]>
  get(id: string): Promise<AgentConfig | undefined>
  update(id: string, patch: UpdateAgentConfigInput): Promise<AgentConfig | undefined>
  delete(id: string): Promise<boolean>
}
```

新增 `src/platform/sessions-store.ts`。

```ts
export interface SessionStore {
  create(input: { agentId: string }): Promise<SessionMeta>
  list(): Promise<SessionMeta[]>
  get(id: string): Promise<SessionMeta | undefined>
  updateStatus(id: string, status: SessionStatus): Promise<SessionMeta | undefined>
  delete(id: string): Promise<boolean>
}
```

新增 `src/platform/event-log.ts`。

```ts
export interface EventLog {
  append(sessionId: string, event: SessionEvent): Promise<void>
  list(sessionId: string): Promise<SessionEvent[]>
}
```

新增 `src/platform/persistence.ts`。

```ts
export interface Persistence {
  agents: AgentStore
  sessions: SessionStore
  events: EventLog
}
```

## 内存 Persistence

新增 `src/platform/in-memory-persistence.ts`。

实现规则：

- agents 使用 `Map<string, AgentConfig>`。
- sessions 使用 `Map<string, SessionMeta>`。
- events 使用 `Map<string, SessionEvent[]>`。
- ID 用 `randomUUID()` 生成。
- 时间使用 ISO 字符串。
- 资源更新时刷新 `updatedAt`。
- 创建 session 时追加 `session.created`。
- 删除 session 时追加 `session.deleted`。

实现可以是一个 `createInMemoryPersistence()` factory，返回 `Persistence`。

## 请求 Schema

新增 `src/platform/schemas.ts`。

用 `zod` 定义：

- `createAgentRequestSchema`
- `patchAgentRequestSchema`
- `createPlatformSessionRequestSchema`

推荐的创建 agent 请求：

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

推荐的创建 session 请求：

```json
{
  "agentId": "agent-id"
}
```

## API 路由

在 `src/server.ts` 里增加平台 persistence 单例。

```ts
const platform = createInMemoryPersistence()
```

实现：

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

响应规则：

- 创建资源返回 `201`。
- 成功读取、更新、删除返回 `200`。
- agent 或 session 不存在返回 `404`。
- 请求 body 校验失败返回 `400`。
- 创建 session 前必须确认 `agentId` 存在。

保留现有兼容路由：

```http
POST   /chat
POST   /chat/stream
POST   /sessions
DELETE /sessions/:id
```

这些兼容路由可以继续使用当前的内存 Strands agent session map，直到 M2 再统一到 runtime adapter。

## 可选调试端点

严格按 M1 来说，可以先不暴露 session events，因为 `/v1/sessions/:id/events` 属于 M2。

如果实现时需要更方便地调试 event log，可以提前加：

```http
GET /v1/sessions/:id/events
```

如果提前添加，需要标注它目前只返回生命周期事件，完整运行期事件等 M2。

## 验证方式

运行：

```bash
npm run build
npm run test
```

手动检查：

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

同时确认现有 chat 路径仍然可用：

```bash
curl -X POST http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message":"hello"}'
```

## 完成标准

M1 完成时应该满足：

- platform types 已存在。
- store interfaces 已存在。
- in-memory persistence 实现了这些接口。
- `/v1/agents` CRUD 可用。
- `/v1/sessions` create/list/get/delete 可用。
- session 生命周期事件会写入内部 event log。
- 现有 `/chat` 和 `/chat/stream` 仍然可用。
- `npm run build` 和 `npm run test` 通过。

## 交接给 M2

M2 在这个结构上继续增加：

- `AgentRuntime`
- Strands runtime adapter
- `POST /v1/sessions/:id/messages`
- `GET /v1/sessions/:id/events`
- `GET /v1/sessions/:id/events/stream`
- 把 Strands stream events 转换成 `SessionEvent`
