# Stander ACP Runtime 部署指南

## 概览

这个部署方式把 Stander Agent 通过 ACP 接入 TDS/OpenMA，并且不修改 TDS。

TDS 运行 ACP adapter：

```bash
npx @stander-agent/stander-agent acp
```

adapter 通过内网连接到私域 Stander runtime service：

```text
STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
```

## Runtime Service

在持有模型密钥和工具执行权限的私域环境里启动 Stander runtime service：

```bash
export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
export STANDER_MODEL=azure-gpt-o4-mini
export OPENAI_API_KEY="$YOUR_OPENAI_API_KEY"
export OPENAI_BASE_URL="$YOUR_OPENAI_BASE_URL"
npm run dev:runtime
```

本地 smoke run 可以使用：

```bash
export STANDER_RUNTIME_TOKEN=local-test-token
export STANDER_MODEL=azure-gpt-o4-mini
export PERSISTENCE_MODE=memory
npm run dev:runtime
```

## TDS Runtime 机器

如果使用私域 npm registry：

```bash
export STANDER_NPM_REGISTRY_URL="https://your-private-npm-registry"
npm config set @stander-agent:registry "$STANDER_NPM_REGISTRY_URL"
npm login --registry "$STANDER_NPM_REGISTRY_URL"
```

全局安装 adapter：

```bash
npm install -g @stander-agent/stander-agent
```

配置 adapter 环境变量：

```bash
export STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
export STANDER_MODEL=azure-gpt-o4-mini
```

## TDS 用户手动配置清单

adapter 和 runtime service 可用后，你需要手动执行这些步骤：

1. 打开 TDS Local Runtimes，选择 Connect machine。
2. 在 TDS runtime 机器运行：

   ```bash
   npx @openma/cli@beta bridge setup
   ```

3. 确认 `oma bridge daemon` 已安装，并且会常驻运行。
4. 如果使用私域 npm，配置 `@stander-agent/stander-agent` 的 npm 来源。
5. 使用 `npm install -g @stander-agent/stander-agent` 全局安装 adapter。
6. 为 daemon 环境配置 `STANDER_RUNTIME_URL`、`STANDER_RUNTIME_TOKEN`、`STANDER_MODEL`。
7. 确认 TDS runtime 机器可以通过内网访问 Stander runtime service。
8. 重启或刷新 `oma bridge daemon`，让它重新 detect agents。
9. 在 TDS Local Runtimes 页面确认 `stander-agent` 出现在 detected agents。
10. 在 TDS New Agent 表单里选择 connected runtime 和 `stander-agent`。
11. 创建 agent，并发送一条测试消息。
12. 如果失败，按这个顺序看日志：`oma bridge daemon`、`stander-agent acp adapter`、`Stander runtime service`。

## ACP Registry 说明

在不修改 TDS 的前提下，`stander-agent` 必须通过 official ACP registry，或者另一个 TDS 已认识的 registry/overlay entry 被 TDS 认识。

registry entry 应指向：

```json
{
  "id": "stander-agent",
  "name": "Stander Agent",
  "distribution": {
    "npx": {
      "package": "@stander-agent/stander-agent",
      "args": ["acp"]
    }
  }
}
```

如果包是私域包，TDS runtime 机器必须配置好 npm，使 `npm install -g @stander-agent/stander-agent` 和 `npx @stander-agent/stander-agent acp` 都能从私域 registry 解析。
