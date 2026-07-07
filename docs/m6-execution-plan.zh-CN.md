# M6 执行计划：Durable Persistence、Local Secrets 与 Sandbox Port

## 摘要

M6 把平台从内存态演示推进到本地长期使用形态。它新增 SQLite 持久化、本地 provider API key secret store、服务重启后的 event log 恢复能力，以及第一版 local workspace sandbox port。

M6 不实现 cloud vault、多用户认证、Docker/E2B sandbox、Graph/Swarm session 化，也不做 Graph/Swarm 可视化拖拽编排器。

## 关键改动

- 新增 `createPlatformPersistence()`，支持 `PERSISTENCE_MODE=memory|sqlite`。
- 在现有 `Persistence` port 后新增 SQLite persistence。
- 新增 `SecretStore`，用 SQLite 本地保存 provider API key。
- 新增 `GET /v1/platform/status`，并在 `/health` 中返回 platform status。
- 新增 `Sandbox` 和 `LocalWorkspaceSandbox` port。
- Console 显示 persistence mode，并更新本地 API key 提示文案。

## Runtime 行为

- 默认 persistence 为 SQLite。
- 默认 data dir 为 `.stander`。
- 默认 database path 为 `.stander/stander-agent.sqlite`。
- Provider list/get API 永不返回原始 API key。
- Runtime API key 解析顺序：
  1. provider local secret
  2. `apiKeyRef` 对应环境变量
  3. `OPENAI_API_KEY`
  4. 明确配置错误

## 环境变量

```bash
PERSISTENCE_MODE=sqlite
STANDER_DATA_DIR=.stander
STANDER_DB_PATH=.stander/stander-agent.sqlite
STANDER_WORKSPACE_ROOT=/path/to/workspace
```

如需恢复旧的内存态行为，可使用 `PERSISTENCE_MODE=memory`。

## 验证

- `node --check public/app.js`
- `npm run build`
- `npm run test`
- 使用 SQLite 启动，创建 provider/agent/MCP/session/events，重启后确认数据仍存在。
- 确认 provider 的 `hasApiKey: true` 重启后仍存在，但 API 不暴露明文 key。
- 确认 `/v1/platform/status` 返回 persistence 和 database path。
- 确认 sandbox 拒绝 workspace root 外路径。

