# Stander Agent 平台化指导思想

## 目标

Stander Agent 应该从一个单 Agent Demo，逐步演进成一个受 Open Managed Agents 启发的小型 Managed Agents 平台，同时使用 Strands Agents 作为 Agent Loop 和编排引擎。

目标不是完整复制 Open Managed Agents，而是围绕 Strands 构建一个 OpenMA 风格的平台核心：

```text
Strands Agents = 大脑 / harness / agent loop
Stander Platform = meta-harness / API / sessions / events / tools / skills
```

## 当前状态

当前项目已经具备一个可用的基础：

- HTTP server
- 浏览器前端
- 内存级 session 管理
- Strands Agent runtime
- 流式响应
- 基础工具：读文件、写文件、shell、HTTP、计算器
- 基础 skill 触发：`$skill-name`
- 通过本地 `config.json` 配置模型

这是一套不错的基础 harness，但它仍然更像一个单应用。下一步需要把“平台能力”和“Strands runtime 能力”拆开。

## 核心设计判断

Open Managed Agents 把系统分成三层：

```text
Harness
  读取历史，构建上下文，调用模型，运行 agent loop。

Meta-Harness
  准备 agent 可用的能力：agents、sessions、tools、skills、events、
  memory、vaults、sandbox、stream 和生命周期管理。

Infrastructure
  存储数据并运行隔离任务。
```

对应到 Stander Agent：

```text
Harness        -> Strands Agent / Graph / Swarm / MCP
Meta-Harness   -> Stander 平台 API、event log、registry、runtime
Infrastructure -> 初期使用内存/本地实现；后续接 SQLite/Postgres 和 sandbox
```

平台负责准备“有什么可用”。Strands harness 负责决定“怎么使用这些能力”。

## 近期范围

先构建一个小型 OpenMA 风格平台，不做完整 OpenMA 复制品。

近期范围：

- Agents API
- Sessions API
- Event log
- Tool registry
- Skill registry
- Strands runtime adapter
- 流式 session message
- Console/UI 改进
- 为 persistence 和 sandbox 预留接口

暂缓范围：

- 持久化 session
- 真正的 sandbox 隔离
- Vaults
- Memory stores
- 完整 MCP marketplace
- GitHub、Slack、Linear 等集成
- Billing、quota、多租户 auth

Session 持久化和 sandbox 很重要，但第一阶段只设计接口，不急着实现。

## 目标架构

建议源码结构：

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

运行流程：

```text
HTTP API
  -> Platform Runtime
    -> 加载 AgentConfig
    -> 加载 SessionState
    -> 加载 tools 和 skills
    -> 创建或复用 Strands Agent
    -> 调用 agent.stream()
    -> 把 Strands events 转成 SessionEvents
    -> 追加 events
    -> 通过 SSE 返回给客户端
```

## 核心领域类型

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

先从小事件词表开始，后续再演进成接近 OMA trajectory 的结构。

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

Events 应该成为平台的事实来源。UI 时间线、重放、调试、未来持久化和未来评测都应该消费 events。

## API 形态

尽量使用接近 OpenMA 的命名方式。

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

现有 `/chat` 和 `/chat/stream` 可以暂时保留为兼容入口，但平台主路径应该转向基于 session 的 API。

## Tool Registry

工具不应该一直写死在一个固定的 `src/agent.ts` 数组里，而应该移动到 registry。

示例：

```ts
type ToolRegistry = {
  list(): ToolSummary[]
  get(name: string): ToolDefinition | undefined
}
```

Agent config 通过名字选择工具：

```json
{
  "tools": ["read_file", "write_file", "list_files", "run_shell"]
}
```

建议下一批工具：

- `list_files`
- `grep`
- `glob`
- `edit_file` 或 `apply_patch`
- 更安全的 `run_shell`

## Skill Registry

当前 skill 已经有一个有用的最小形态：

```text
skills/<name>/SKILL.md
```

平台化版本应支持：

- 列出 skills
- 读取 skills
- 给 agent 分配 skills
- 通过 `$skill-name` 显式触发
- 将 agent 默认 skills 注入 system prompt
- 将显式触发的 skills 注入当前 turn

Agent-level skill 配置：

```json
{
  "skills": ["code-review", "frontend"]
}
```

规则：

- `agent.skills` 是默认能力。
- `$skill-name` 是单轮显式触发。
- Skill 内容应被视为说明和约束，而不是可执行代码。

## Strands Runtime Adapter

Strands 应该被包在 runtime adapter 后面，避免平台代码到处直接依赖 `Agent` 细节。

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

第一版实现使用：

- `new Agent(...)`
- `agent.stream(...)`
- 配置化 tools
- 配置化 skills
- 配置化 model provider

后续实现可以支持：

- Strands Graph
- Strands Swarm
- agents-as-tools
- MCP-enriched agents

## Persistence Port

持久化先设计接口。

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

第一版实现：

```text
InMemoryPersistence
```

未来实现：

```text
FilePersistence
SQLitePersistence
PostgresPersistence
```

第一版平台不要依赖 durable persistence。先让接口稳定，后续替换实现。

## Sandbox Port

Sandbox 同样先设计接口。

```ts
interface Sandbox {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string, options?: { overwrite?: boolean }): Promise<void>
  runShell(command: string): Promise<{ stdout: string; stderr?: string; exitCode: number }>
}
```

第一版实现：

```text
LocalWorkspaceSandbox
```

本地实现规则：

- 文件路径限制在 workspace root 内
- 拦截明显危险命令
- 设置 shell 超时
- 限制输出长度

未来实现：

```text
DockerSandbox
E2BSandbox
CloudflareSandbox
```

Sandbox 明确延后。平台里的工具应该调用 sandbox port，而不是在各处直接调用 `fs` 或 `child_process`。

## MCP 计划

MCP 应作为第二阶段平台能力。

Agent config 后续可以包含 MCP server：

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

Runtime adapter 根据配置创建 `McpClient`，并把 MCP client 加入 Strands tools 列表。

## Multi-Agent 计划

核心平台稳定后，再使用 Strands 的多 Agent 能力。

可能模式：

- agents-as-tools：orchestrator 把任务委托给专家 agent
- Graph：确定性流程，例如 analyze -> implement -> test -> review
- Swarm：agent 之间动态 handoff

不要从这里开始。多 Agent 编排依赖干净的 agents、sessions、events 和 tools 设计。

## 里程碑

### M1：Platform API 骨架

- 增加 `AgentConfig`
- 增加 `SessionMeta`
- 增加内存 stores
- 增加 event log 接口和内存实现
- 增加 `/v1/agents`
- 增加 `/v1/sessions`

### M2：Strands Runtime

- 增加 `AgentRuntime`
- 包装 Strands `agent.stream()`
- 把 Strands stream events 转成 `SessionEvent`
- 实现 `/v1/sessions/:id/messages`
- 实现 `/v1/sessions/:id/events`
- 实现 `/v1/sessions/:id/events/stream`

### M3：Registries

- 把 tools 移到 `ToolRegistry`
- 把 skills 移到 `SkillRegistry`
- 允许 agent 选择 tools 和 skills
- 保留 `$skill-name` 触发机制

### M4：Console UI

- Agent 列表
- Agent 创建/编辑
- Session 列表
- Event timeline
- Tool call 展示
- Skill 展示

### M5：MCP 和 Multi-Agent

- 增加 MCP server config
- 增加 MCP client 创建
- 增加 agents-as-tools 实验
- 增加 Graph/Swarm 实验

### M6：延后的基础设施

- 在 `Persistence` 后实现持久化
- 在 `Sandbox` 后实现隔离执行
- 增加从 event log 恢复/重放
- 增强安全边界

## 第一版非目标

- 多租户 billing
- Vault credential isolation
- Cloudflare Durable Objects
- 真正 container sandbox
- 完整 OpenMA API 兼容
- GitHub/Slack/Linear 集成
- RL trajectory export

这些都是好的未来方向，但太早做会拖慢核心平台成型。

## 指导约束

1. 把 Strands 放在 runtime adapter 后面。
2. 把 events 当作事实来源。
3. stores 和 sandbox 都走接口。
4. 优先小而稳定的 API，不要过早抽象成大框架。
5. tools 和 skills 必须可以按 agent 配置。
6. 保持简单的本地开发体验。
7. 等平台 API 稳定后，再实现持久化和 sandbox。

## 总结

正确演进方向是：

```text
single agent app
  -> managed agents API
  -> session event runtime
  -> configurable tools and skills
  -> Strands runtime adapter
  -> persistence and sandbox implementations
```

这会把 Stander Agent 演进成一个小型 Open Managed Agents 风格平台，同时保留 Strands Agents 作为 agent loop 引擎。
