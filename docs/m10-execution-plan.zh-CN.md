# M10 执行计划：强化平台层与 Harness 边界

## 摘要

M10 将平台 event log 提升为 runtime context 的核心底座。Strands 仍然是 loop engine，但 prompt assembly 和 model context projection 上移到平台模块，这样 sessions 可以被重放、检查，并逐步演进到 trajectory export，而不依赖 Strands 内存 conversation state。

本阶段不实现完整 OpenMA 兼容、不实现真实自动 compaction，也不实现完整 trajectory export。

## 关键改动

- 通过 `src/platform/prompt.ts` 增加平台所有的 prompt composition。
- 通过 `src/platform/context-projection.ts` 增加 event-to-model-context projection。
- 给 `SessionEvent` 增加 event ids 和更完整的 tool event fields。
- 增加 `agent.thread_context_compacted`，作为未来 durable compaction marker。
- 将平台组装的 `systemPrompt` 和 derived `modelContext` 传入 `AgentRuntime.runMessage`。
- 创建或刷新 session runtime 时，用 derived model context seed Strands agent。
- 新字段保持 optional，兼容旧 events。
- Console timeline 展示 tool correlation ids 和 compaction markers。

## Runtime 边界

平台现在负责准备：

- resolved agent config
- default and triggered skill prompt fragments
- final system prompt
- event-derived model context
- model provider、MCP servers、child agent tools 和 session metadata

Strands runtime 消费这些输入，运行 loop，并把 stream events 翻译回 `SessionEvent`。

## 测试

- `npm run test:platform-boundary`
- `npm run build`
- `npm run test`

平台边界测试覆盖 prompt composition、event projection、旧 event 兼容、compaction marker projection 和 event id creation。

## 延后

原本的 M10：Node-Level Workflow Streaming，顺延到 event contract 稳定之后再做，避免过早把 SDK-specific runtime details 泄漏进平台事件协议。
