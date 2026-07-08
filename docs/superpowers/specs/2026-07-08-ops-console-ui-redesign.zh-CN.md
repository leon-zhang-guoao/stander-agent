# Ops Console UI 重构设计

## 摘要

把 Stander Console 重构成一个“运行观察优先”的 managed-agent 控制台。它的核心任务是：让开发者配置 agents 和 registries，运行 sessions 或 workflows，并在不丢上下文的情况下检查事件时间线。

已批准方向是 **Ops Console**：`SessionEvent` 仍然是主工作区，右侧 inspector 根据当前选中对象展示配置和诊断。设计会吸收 Builder Studio 的 workflow canvas 体验，以及 Mission Control 的全局状态摘要，但主层级仍然围绕 sessions 和 events。

## 产品原则

- **Events 是事实来源。** UI 要让 `SessionEvent` 历史可见、可读、适合调试。
- **配置靠近执行。** Agents、providers、MCP servers、workflows、tools、skills 都应能在不离开当前 timeline 的情况下编辑。
- **密集、冷静、偏运维。** 这是开发者控制台，不是 landing page。优先紧凑扫描、稳定分栏、克制色彩、清晰状态。
- **小平台，清边界。** 保留当前无前端构建链的本地启动方式。本次重构不引入前端框架。

## 信息架构

主导航改成任务导向：

- **Monitor**：sessions、event timeline、composer、run status、event filters。
- **Agents**：agent 列表和 agent 编辑。
- **Workflows**：workflow 列表、workflow canvas、templates、run history。
- **Connections**：model providers 和 MCP servers。
- **Registry**：tools 和 skills 浏览。

Session 列表保持常驻，因为它是切换历史 runs 的最快入口。右侧 inspector 根据当前主导航和选中对象切换内容。

## 布局

桌面端保留三个功能区域：

```text
┌───────────────┬──────────────────────────────┬──────────────────────┐
│ Navigation    │ Workspace                    │ Inspector            │
│               │                              │                      │
│ Platform      │ Active session/run header    │ Selected object      │
│ status        │ Metrics and filters          │ details              │
│               │                              │                      │
│ Primary nav   │ Event timeline               │ Forms, canvas tools, │
│               │                              │ test results         │
│ Session list  │ Composer / run input         │                      │
└───────────────┴──────────────────────────────┴──────────────────────┘
```

响应式行为：

- 平板以下宽度改为导航、工作区、inspector 纵向堆叠。
- Composer 保持靠近当前 timeline。
- 长表单使用完整宽度，避免卡片套卡片。
- Workflow canvas 保持稳定最小高度，必要时横向滚动。

## 视觉方向

界面应该像一个精确但有人味的 runtime console。

Token 计划：

- `ink`: `#17211f`
- `panel`: `#fbfcfa`
- `field`: `#f4f7f5`
- `rail`: `#111918`
- `line`: `#d8dfda`
- `accent`: `#197c6b`
- `accent-strong`: `#0d5f53`
- `blue`: `#315acb`
- `amber`: `#b97121`
- `danger`: `#b43b31`

字体：

- UI 文本使用系统 sans。
- Event types、ids、JSON、技术元数据使用系统 monospace。
- 不使用夸张 display 字号。标题应紧凑，并和 panel 尺寸匹配。

记忆点：

- 在 timeline 旁增加一条纤细的 **event rail**，用事件类型颜色标记和紧凑 metadata 帮助扫描。它应该服务调试，不做装饰性时间线。

## 组件

### Shell

- 左侧 rail 包含品牌、连接/persistence 状态、主导航和 sessions。
- Workspace 承载当前 timeline 或当前 workflow run 视图。
- Inspector 承载 CRUD 表单、选中 workflow node 属性、provider/MCP 测试、registry detail 和 run history。

### 主导航

使用清晰标签，并在合适时用小图标/符号。移除当前编号式导航，因为这些 sections 不是固定步骤。

### Session 列表

每个 session item 展示：

- title 或 agent/workflow 名称
- kind：`agent`、`graph` 或 `swarm`
- status
- short id
- 可用时展示 updated time

Status 使用一致的 pill：`idle`、`running`、`error`。

### Timeline

Timeline rows 支持：

- user messages
- assistant messages 和 streaming text
- tool use
- tool result
- session status changes
- session errors
- multi-agent run started/completed/failed
- multi-agent node result

Rows 默认展示紧凑 metadata，同时保留调试需要的正文。JSON-like payload 展开时使用可读 monospace block。

### Composer

Composer 保持简单：

- 给当前 `agent` session 发送 message。
- 对非 agent 的 workflow sessions 禁用发送。
- Workflow sessions 下展示清晰的 disabled copy。
- 保留 Enter 发送、Shift+Enter 换行行为。

### Inspector

Inspector panels 按新导航重组：

- Agents editor：model provider、model id、prompt、tools、skills、MCP servers、child agents。
- Workflows editor：列表、canvas、node inspector、templates、import/export、run history。
- Connections editor：providers 和 MCP servers，并展示测试结果。
- Registry browser：tools 和 skills，含 skill 内容 detail。

### 空状态和错误状态

空状态要指向下一步：

- 没有 provider：创建 provider。
- 没有 agent：创建 agent。
- 没有 session：基于当前 agent 创建 session。
- 没有 workflow nodes：添加 agent nodes。
- SSE 断开：刷新 events 或重新选择 session。

错误文案要具体、可操作，不使用道歉式模糊表达。

## 数据流

重构保持当前 API 使用：

- `/v1/platform/status`
- `/v1/model-providers`
- `/v1/mcp-servers`
- `/v1/agents`
- `/v1/tools`
- `/v1/skills`
- `/v1/sessions`
- `/v1/sessions/:id/events`
- `/v1/sessions/:id/events/stream`
- `/v1/workflows`
- `/v1/workflow-templates`
- `/v1/workflows/:id/runs`

本次 UI 重构不需要后端 API 改造。缺失的展示字段由前端防御性处理。

## 实施范围

范围内：

- 重写 `public/index.html` 的静态结构。
- 围绕新 shell 和组件重组 `public/styles.css`。
- 只在 selector、导航分组、状态标签、渲染假设变化处更新 `public/app.js`。
- 把 `.superpowers/` 加入 `.gitignore`。
- 保留现有 CRUD 和 run 行为。

范围外：

- 引入 React、Vite、Tailwind 或前端 package pipeline。
- 后端 API 变化。
- Auth、多租户 UI、真实 sandbox controls、billing、quota。
- 超出当前本地 console 需要的完整视觉稿保真。

## 测试

验证包括：

- `npm test`
- 用 `npm run dev:server` 启动开发服务
- 浏览器 smoke test：
  - platform load
  - nav switching
  - provider/agent/workflow forms visible
  - session selection
  - timeline rendering
  - desktop 和 mobile 响应式截图

手动测试数据可以使用当前本地平台 stores。实现不应依赖 seeded data。

## 风险

- `public/app.js` 很大，并且和 DOM ids 紧耦合。应尽量少改 id，或谨慎同步 selector。
- 完整视觉重构可能误伤现有 workflows。重构后要逐一验证当前 panels。
- Workflow canvas 依赖 pointer interaction。除非必要，不改它的 DOM anchors 和 event handlers。
