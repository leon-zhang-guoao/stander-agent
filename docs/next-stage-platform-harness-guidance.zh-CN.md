# 下一阶段指导：强化平台层与 Harness 边界

## 目标

本文定义 Stander Agent 的下一阶段平台化方向。它借鉴 Open Managed Agents 最有价值的边界设计，但继续保持本项目“小型、本地优先、Strands-native”的定位。

目标不是复制 OMA，而是让 Stander Agent 的平台/runtime 分层足够稳定：sessions、events、prompts、tools 和未来 workflow runs 都可以被恢复、重放、检查和治理，而不是依赖 Strands 内部状态作为事实来源。

一句话概括：

```text
Stander Platform 负责 session 真相和能力准备。
Strands Runtime 负责 loop 编排和模型/工具执行策略。
```

## 为什么需要这个阶段

当前项目方向已经正确：

- 已经有 `AgentConfig`、`SessionMeta`、`SessionEvent`、stores 和 registries。
- `AgentRuntime` 已经把 Strands 包在 adapter 后面。
- Session message 会追加 events，并流式返回 runtime 输出。
- Tools、skills、model providers、MCP servers、agent tools、workflows 和 sandbox ports 都已经被表达出来。

剩下的主要风险是：部分 runtime 行为仍然依赖 Strands 内部 conversation state，系统提示词和 skill 注入也还偏 adapter 内部逻辑。这对一个可用的本地应用没问题，但会削弱 managed-agent platform 的模型。

这个阶段要把 events 和平台准备好的上下文升级成核心契约。

## 核心原则

### 1. Event Log 是 Session 真相

append-only `SessionEvent` log 应该成为以下能力的权威来源：

- session replay
- model context derivation
- UI timeline rendering
- debugging
- crash recovery
- future eval and trajectory export
- workflow run history

Runtime adapter 可以为了性能缓存 Strands agents，但不应该必须依赖内存中的 Strands conversation state 才能理解 session。

### 2. Harness 消费平台上下文

平台应该为任意 harness 解析并准备好运行上下文：

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

Harness 决定如何在 loop 中使用这些输入，但不应该拥有平台治理或 session 真相。

### 3. Prompt Assembly 是平台能力

系统提示词组装应该逐步上移到平台层，例如：

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

Strands adapter 仍然可以把最终结果传给 `new Agent(...)`，但 skill 注入和 platform guidance 不应该隐藏在 adapter 内部。

### 4. Context Projection 是显式契约

增加明确的上下文投影步骤：

```ts
deriveModelContext(events: SessionEvent[], options: DeriveModelContextOptions): ModelContext
```

第一版可以很简单：

- 将 `user.message` 转成 user messages。
- 将最终 `agent.message` 转成 assistant messages。
- 当存在最终 `agent.message` 时，忽略 `agent.text_delta`。
- 等 compaction event 存在后，把 compacted summaries 纳入上下文。
- 在 tool ids 和 payloads 稳定前，先不把 tool events 放进 model context。

后续再扩展 sliding window、RAG、compaction 和 workflow-specific context rules。

### 5. Compaction 必须事件化

Compaction 不应该修改或删除 session history，而应该追加一个持久事件，例如：

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

Projection code 决定如何在模型输入中用 summary 替换旧 events。原始 event log 仍然保留，用于 replay、audit 和 evaluation。

### 6. Tool Use 需要稳定 ID

Tool events 应该可以关联：

```ts
agent.tool_use    -> toolUseId, name, input
agent.tool_result -> toolUseId, name, result, error?
```

这会支持：

- timeline grouping
- pending confirmation flows
- retry/recovery
- sub-agent lineage
- eval and trajectory export

### 7. Runtime Interface 要小步扩展

保留 `AgentRuntime.runMessage()` 作为第一版稳定 adapter 入口，但把输入从零散字段逐步演进为平台解析好的 runtime context：

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

平台负责准备这个对象，Strands adapter 负责消费它。

## 下一阶段范围

### 范围内

- 新增 platform prompt composition module。
- 新增 model context projection module。
- 尽量让 `StrandsRuntime` 消费平台组装好的 prompt/context。
- 扩展 `SessionEvent`，加入 stable ids 和更完整的 tool payloads。
- 增加 compaction event types 和 projection semantics，即使自动 compaction 延后实现。
- 为 event-to-context projection 和 prompt composition 增加测试。
- 保持当前 `/chat` 和 `/v1/sessions` 本地启动流程不被破坏。

### 范围外

- 完整 OpenMA API 兼容。
- durable multi-tenant auth、billing 或 quotas。
- 真正 container sandbox isolation。
- vault-backed credential isolation。
- 完整 trajectory export 实现。
- 用自定义 loop 替换 Strands。

## 建议实现顺序

1. 创建 `src/platform/prompt.ts`。
2. 创建 `src/platform/context-projection.ts`。
3. 为 prompt composition 和 event projection 增加单元测试。
4. 为新 session events 增加 event ids 和 tool-use ids。
5. 更新 `StrandsRuntime`，让它使用平台组装好的 prompt 和 derived model context。
6. 增加 compaction event types 和 no-op projection support。
7. 改进 API/UI timeline，让 tool events 可以按 id 关联展示。

## 验收标准

- 可以只根据 `SessionEvent[]` 重建 session，而不依赖 Strands 内存 conversation state。
- Prompt assembly 可以在 `StrandsRuntime` 外被测试。
- Event-to-model-context projection 可以在 `StrandsRuntime` 外被测试。
- Tool use 和 tool result events 可以通过 id 关联。
- 现有本地启动和简单 chat flow 仍然可用。
- Strands adapter 仍然是 loop engine，而不是平台事实来源。

## 设计约束

- 不导入 OpenMA 内部 packages。
- 保持 Stander Agent 比 OpenMA 更小。
- 优先使用 ports 和普通 TypeScript modules，不急着引入重框架抽象。
- 保持现有本地开发体验。
- 渐进扩展 event model，并兼容旧 events。
- 把原始 credentials 当作 secret；不要写入 events、agent configs 或 exported trajectories。

## 和现有路线图的关系

这份指导应该被视为深入 workflow streaming、durable recovery 或 trajectory export 之前的平台强化阶段。

它补充现有路线图：

```text
single agent app
  -> managed agents API
  -> session event runtime
  -> configurable tools and skills
  -> Strands runtime adapter
  -> platform/harness boundary hardening
  -> persistence, sandbox, workflow streaming, and trajectory export
```

关键变化很微妙，但很重要：events 不再只是 runtime 产出的记录。Events 应该成为 runtime context、timeline、recovery 和未来 evaluation 的共同底座。
