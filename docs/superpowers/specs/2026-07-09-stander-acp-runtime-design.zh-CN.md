# Stander ACP Runtime 接入设计

## 摘要

把 Stander Agent 作为 ACP-compatible runtime 接入 TDS/OpenMA 平台，并且不修改 TDS。

已确认方向是 **Stander ACP Adapter + Remote Runtime Transport**：

```text
TDS Agent
  -> AcpProxyHarness
  -> RuntimeRoom WebSocket
  -> oma bridge daemon
  -> npx @stander-agent/stander-agent acp
  -> 内网 HTTP/WebSocket transport
  -> Stander runtime service
  -> Strands agent loop / model / tools
```

TDS 只看到一个标准 ACP child process。这个 ACP child process 是一个薄 adapter，负责把 session 操作转发到运行在你私域环境里的 Stander runtime service。

## 目标

- 让 Stander 在 TDS Local Runtime / New Agent 流程里成为可选择的 ACP agent。
- 不修改 TDS。
- 真实执行环境、模型密钥、工具权限、session 状态留在你的私域 Stander runtime 环境里。
- 使用环境变量配置 adapter 和鉴权。
- 默认模型使用 `azure-gpt-o4-mini`。
- 第一版先做一个可测试的最小集成，再扩展高级平台能力。

## 非目标

- 不修改 TDS 源码，也不依赖给 TDS overlay 加条目。
- 不要求 Stander 出现在 Deep Researcher、Field Monitor 这类 New Agent template 卡片里。
- 第一版不做长期 durable session storage。
- 第一版不做完整 TDS skill/tool/sandbox 对齐。
- 除非后续明确需要，否则不把模型 provider secrets 放在 TDS 机器上。

## TDS 当前行为

TDS 有两个容易混淆的界面：

- New Agent templates，例如 Deep Researcher 和 Field Monitor，只负责预填 agent config。
- Local Runtime ACP agents 由 `oma bridge daemon` 检测，在 agent 表单里通过 runtime binding 选择。

ACP runtime 链路如下：

1. daemon 加载 official ACP registry，并合并 TDS/OMA overlay。
2. daemon 检测本机已安装的 ACP-compatible agents。
3. daemon 连接 TDS `RuntimeRoom`，通过 `hello` message 上报 detected agents。
4. TDS 把 detected agent ids 存到 runtime 的 `agents_json`。
5. New Agent 可以把 agent config 绑定到 `{ runtime_id, acp_agent_id }`。
6. `AcpProxyHarness` 通过 `RuntimeRoom` 发送 `session.start`、`session.prompt`、`session.cancel`。
7. daemon 启动选中的 ACP child process，并把 ACP session updates 转回 TDS。

因为我们不能改 TDS，Stander 必须通过 official ACP registry，或者另一个 TDS 已认识的 registry/overlay entry 被发现。干净路径是 official ACP registry。

## 架构

### ACP Adapter

`@stander-agent/stander-agent` 包暴露：

```bash
npx @stander-agent/stander-agent acp
```

这个命令运行在 TDS runtime 机器上。它通过 stdio 实现 ACP，并把 ACP requests 映射成远程 Stander runtime 调用。

职责：

- 处理 ACP `initialize`。
- 处理 ACP `session/new`。
- 处理 ACP `session/prompt`。
- 处理 ACP `session/cancel`。
- 把 Stander runtime events 转成 ACP `session/update` notifications。
- 对 runtime 连接、鉴权、取消、模型/配置错误返回明确 ACP errors。

adapter 应该保持轻量，不变成主 agent runtime。

### Stander Runtime Service

Stander runtime service 运行在你的私域项目环境里，负责真正的 agent 执行。

职责：

- 创建和跟踪 runtime sessions。
- 通过现有 Strands runtime adapter 执行 prompts。
- 把标准化 events stream 回 ACP adapter。
- 持有模型密钥和工具/runtime 权限。
- 对 adapter 做简单 bearer-token 鉴权。

第一版可以使用内存 session，并暴露小型 HTTP streaming API。

### Runtime Transport

初始 transport：

```text
POST /v1/runtime/sessions
POST /v1/runtime/sessions/:id/prompt
POST /v1/runtime/sessions/:id/cancel
```

鉴权：

```http
Authorization: Bearer <STANDER_RUNTIME_TOKEN>
```

prompt endpoint 应该 stream newline-delimited JSON 或 server-sent events。实现时选择和当前 Node runtime、测试环境最贴合的简单方案。

## 配置

ACP adapter 读取：

```bash
STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
STANDER_RUNTIME_TOKEN=...
STANDER_MODEL=azure-gpt-o4-mini
```

后续可选配置：

```bash
STANDER_RUNTIME_TIMEOUT_MS=60000
STANDER_RUNTIME_TLS_CA=...
```

Stander runtime service 应尽量持有模型 provider secrets：

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
```

第一版把 `STANDER_MODEL` 视为默认模型，并 fallback 到 `azure-gpt-o4-mini`。

## ACP Registry Entry 草案

official ACP registry entry 可以类似：

```json
{
  "id": "stander-agent",
  "name": "Stander Agent",
  "description": "A Strands-native managed-agent runtime exposed through ACP.",
  "distribution": {
    "npx": {
      "package": "@stander-agent/stander-agent",
      "args": ["acp"],
      "env": {
        "STANDER_RUNTIME_URL": "",
        "STANDER_RUNTIME_TOKEN": "",
        "STANDER_MODEL": "azure-gpt-o4-mini"
      }
    }
  }
}
```

提交前要补充 ACP registry review process 要求的真实 repository、website、license metadata。

如果包只发布到私域 npm registry，TDS runtime 机器必须为 `@stander-agent` scope 配置 registry，并全局安装包。official ACP registry 是否接受不能公开安装的 package 需要确认，所以 public npm 仍然是阻力最小的路径。

## 数据流

### 发现阶段

```text
oma bridge daemon
  -> 加载 official ACP registry
  -> 看到 stander-agent
  -> 检测 npx/npm package installation
  -> 在 hello.agents 里上报 stander-agent
  -> TDS 保存 runtime agents_json
```

### Agent 创建阶段

在 TDS New Agent 里，用户进入 form view 并选择：

```text
Runtime = connected local machine
ACP Agent = stander-agent
```

TDS 保存：

```ts
_oma: {
  harness: "acp-proxy",
  runtime_binding: {
    runtime_id: "...",
    acp_agent_id: "stander-agent"
  }
}
```

### Prompt 执行阶段

```text
User message in TDS
  -> AcpProxyHarness
  -> RuntimeRoom
  -> oma bridge daemon
  -> npx @stander-agent/stander-agent acp
  -> POST /v1/runtime/sessions/:id/prompt
  -> Strands runtime
  -> streamed Stander events
  -> ACP session/update
  -> TDS session.event
  -> TDS UI
```

## Event Mapping

第一版支持能让 TDS 正常展示输出的事件类型：

- `agent.text_delta` -> ACP content delta/session update。
- `agent.tool_use` -> ACP tool call start/update。
- `agent.tool_result` -> ACP tool call result/update。
- `agent.message` -> final assistant message/completion signal。
- `agent.error` -> ACP prompt error 或 session update error。

具体 ACP payload shape 要基于本地 `agent-client-protocol` 源码实现，并用 TDS ACP runtime client 验证。

## 错误处理

adapter 应该明确失败、明确报错：

- 缺少 `STANDER_RUNTIME_URL`：在 `initialize` 或首次创建 session 时返回清晰 config error。
- 缺少/错误 `STANDER_RUNTIME_TOKEN`：返回 authentication error。
- Stander runtime 不可用：返回 connection error。
- Prompt stream 中断：返回 prompt/session error。
- TDS cancellation：转发 cancellation 到 Stander runtime 并停止 streaming。

错误应以 TDS 能展示为 `session.error` 的 ACP errors 或 session updates 形式返回。

## 测试策略

单元测试：

- ACP adapter request handling。
- Runtime client request construction 和 error handling。
- Stander event 到 ACP update 的 mapping。

集成测试：

- 启动 fake Stander runtime service。
- 通过 stdio 启动 ACP adapter。
- 使用和 TDS 相同形态的 ACP SDK/client 调 `initialize`、`session/new`、`session/prompt`、`session/cancel`。

手动 smoke test：

- 用本地环境变量运行 `npx @stander-agent/stander-agent acp`。
- 通过已安装的 TDS `oma bridge daemon` 接入。
- 创建绑定到 `stander-agent` 的 TDS agent。
- 发送 prompt，确认流式文本和完成事件。

## 用户手动配置清单

实现完成后，你需要手动完成这些步骤：

1. 打开 TDS Local Runtimes，选择 Connect machine。
2. 在 TDS runtime 机器上运行：

   ```bash
   npx @openma/cli@beta bridge setup
   ```

3. 确认 `oma bridge daemon` 已安装，并且会常驻运行。
4. 配置 `@stander-agent/stander-agent` 的 npm 来源：

   ```bash
   export STANDER_NPM_REGISTRY_URL="https://your-private-npm-registry"
   npm config set @stander-agent:registry "$STANDER_NPM_REGISTRY_URL"
   npm login --registry "$STANDER_NPM_REGISTRY_URL"
   ```

   如果包发布在 public npm，则跳过 registry 配置。

5. 在 TDS runtime 机器全局安装 adapter：

   ```bash
   npm install -g @stander-agent/stander-agent
   ```

6. 在 daemon 机器配置 adapter 环境变量：

   ```bash
   export STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
   export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
   export STANDER_MODEL=azure-gpt-o4-mini
   ```

7. 确认 TDS runtime 机器可以通过内网访问 Stander runtime service。
8. 重启或刷新 `oma bridge daemon`，让它重新 detect agents。
9. 在 TDS Local Runtimes 页面确认 `stander-agent` 出现在 detected agents。
10. 在 TDS New Agent 表单里选择：

    ```text
    Runtime = the connected machine
    ACP Agent = stander-agent
    ```

11. 创建 agent，并发送一条测试消息。
12. 如果失败，按这个顺序看日志：

    ```text
    oma bridge daemon
    stander-agent acp adapter
    Stander runtime service
    ```

## 实施范围

第一版范围内：

- `stander-agent acp` CLI/bin entry。
- 最小 ACP server over stdio。
- Remote runtime client。
- 最小 Stander runtime service endpoints。
- Bearer-token authentication。
- 默认模型 `azure-gpt-o4-mini`。
- 基础 event mapping。
- 本地测试和 fake-runtime 测试。
- 带有上述手动清单的部署文档。

第一版范围外：

- 完整 durable session persistence。
- TDS template integration。
- 完整 skill registry synchronization。
- 完整 sandbox/file-system 与 TDS tools 对齐。
- 超出单一 shared runtime token 的多租户授权。
- 自动配置 private npm。

## 风险

- TDS 对 npm/npx entries 的 detect 可能需要全局安装，不只是 `npx` 可拉取。
- official ACP registry submission 可能拒绝仅 private npm 可安装的包。
- ACP event payload compatibility 必须通过本地 ACP schema 和 TDS client 行为验证。
- Streaming 和 cancellation 语义可能在 Stander events、ACP updates、TDS UI 之间发生偏差。
- 如果模型密钥放错机器，会削弱我们希望保持的 private-runtime 边界。

## 待决策项

- 最终 npm 发布目标：public npm 还是 private npm registry。
- ACP registry entry 的真实 repository/website/license metadata。
- 内部 Stander runtime prompt stream 使用 HTTP NDJSON 还是 SSE。
- `STANDER_MODEL` 是按 session 传递，还是作为 runtime-wide default。
