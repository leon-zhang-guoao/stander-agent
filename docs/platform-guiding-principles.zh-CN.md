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

`modelProviderId` 在从本地配置迁移到平台化 provider 的过程中是可选字段。缺省时，`modelId` 和 `baseURL` 继续保持当前 OpenAI-compatible 行为。

### ModelProviderConfig

用户应该可以定义可复用的 model provider，并把 agent 绑定到这些 provider。Provider 表示连接目标和 credential 引用；agent 负责选择具体模型和 prompt 行为。

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

规则：

- 原始 API key 只允许保存在本地开发用的内存态 provider store 中。公开的 provider list/get 只返回 `hasApiKey`，未来持久化存储应把 secret 放到 vault 后面。
- 在平台路径完全替代 legacy `/chat` 之前，继续保留 `config.json` 作为本地 fallback。
- 每个 `AgentConfig` 选择 `modelProviderId` 和 `modelId`；未来如果 `modelId` 缺省，则使用 provider 的 `defaultModelId`。
- runtime 要校验 provider 能力是否匹配。例如 agent 使用工具时，如果 provider 的 `toolCalling: false`，应该警告或 fail fast。
- 在 UI 暴露 provider 编辑之前，先提供一个简单的连接测试 endpoint。

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

现有 `/chat` 和 `/chat/stream` 可以暂时保留为兼容入口，但平台主路径应该转向基于 session 的 API。

## Model Provider 管理

Model provider 是平台能力，而不是 Strands 专属细节。它让用户可以在多个 agent 之间复用模型端点，后续轮换 credential，并显式记录 provider 能力。

第一版实现：

- 增加 `ModelProviderStore` 接口和内存实现。
- 优先支持 OpenAI-compatible provider，因为当前 runtime 已经使用 `OpenAIModel`。
- 在 provider 上保存 `baseURL`、`defaultModelId` 和 capability metadata。
- 继续把 `modelId` 放在 agent 上，让多个 agent 可以共享 provider，但使用不同模型。
- 增加 `/v1/model-providers` CRUD 和 `/test` 轻量连接测试。

未来实现：

- 把 `apiKeyRef` 接到 vault 或 credential store 后面。
- 增加 Anthropic、Ollama、OpenRouter 和本地模型的 provider-specific adapter。
- 当 provider 暴露 models endpoint 时，支持模型发现。
- 增加 provider 级默认配置，例如 timeout、headers、rate-limit 标签、organization/project 标识。

不要把原始 provider credential 写进 agent config、session events、导出的 trajectories，或 provider list/get API 响应。

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

## MCP Registry

MCP 是平台 registry 能力。Agent config 引用 MCP server id；runtime adapter 解析启用状态，创建 `McpClient`，并把这些 client 加入当前 session runtime 的 Strands tools 列表。

M5 支持一个面向本地开发的最小 registry：

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

规则：

- `/v1/mcp-servers/:id/test` 创建临时 MCP client，调用 `listTools()`，然后断开。
- `/v1/mcp-servers/:id/tools` 返回 live tool 摘要，不把结果缓存进持久状态。
- disabled 或 missing MCP server 会在 session message 执行前 fail fast。
- M5 中 MCP credential 推荐通过本地 env/config 表达，不把原始 secret 写入 session events。
- Stdio MCP command 在 M5 中直接在本机运行，暂时没有 sandbox 隔离。

## Multi-Agent 计划

Strands multi-agent 能力分两层进入平台：agents-as-tools 可以进入普通 platform session；Graph 和 Swarm 在事件模型稳定前保持为实验 API。

M5 支持的模式：

- agents-as-tools：orchestrator agent 通过 `agentTools` 把选中的 child agents 暴露为可调用工具。
- Graph：通过 `/v1/multi-agent/graph/runs` 运行确定性流程，例如 analyze -> implement -> test -> review。
- Swarm：通过 `/v1/multi-agent/swarm/runs` 运行动态 handoff。

M5 中 Graph 和 Swarm run 不创建 platform session，不写 event log，也不提供 SSE。它们使用各 node agent 的 model、provider、system prompt 和 skills，但不加载 tools/MCP/agentTools，以降低实验 API 的副作用。

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

- 增加 `ModelProviderStore`
- 增加 `/v1/model-providers`
- 允许 agent 选择 model provider
- 把 tools 移到 `ToolRegistry`
- 把 skills 移到 `SkillRegistry`
- 允许 agent 选择 tools 和 skills
- 保留 `$skill-name` 触发机制

### M4：Console UI

- Agent 列表
- Agent 创建/编辑
- Model provider 列表
- Model provider 创建/编辑/测试
- Session 列表
- Event timeline
- Tool call 展示
- Skill 展示

### M5：MCP 和 Multi-Agent

- 增加 `McpServerStore`
- 增加 `/v1/mcp-servers` CRUD、`/test` 和 live `/tools`
- 允许 agent 选择 MCP server ids
- 增加 `agentTools` 支持 agents-as-tools 委托
- 增加 Graph/Swarm 实验 run endpoints
- 在 Console 中增加 MCP registry 和 agent 选择控件

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
5. model providers、tools 和 skills 必须可以按 agent 配置。
6. 不要把原始 model provider credential 存进 agent config 或 events。
7. 保持简单的本地开发体验。
8. 等平台 API 稳定后，再实现持久化和 sandbox。

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
