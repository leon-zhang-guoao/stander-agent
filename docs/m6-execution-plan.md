# M6 Execution Plan: Durable Persistence, Local Secrets, and Sandbox Port

## Summary

M6 moves the platform from in-memory demos toward local long-running use. It adds SQLite-backed persistence, a local secret store for provider API keys, event log recovery after server restart, and a first local workspace sandbox port.

M6 does not implement cloud vaults, multi-user auth, Docker/E2B sandboxing, Graph/Swarm sessionization, or a visual Graph/Swarm builder.

## Key Changes

- Add `createPlatformPersistence()` with `PERSISTENCE_MODE=memory|sqlite`.
- Add SQLite persistence behind the existing `Persistence` port.
- Add `SecretStore` and local SQLite-backed provider API key storage.
- Add `GET /v1/platform/status` and include platform status in `/health`.
- Add `Sandbox` and `LocalWorkspaceSandbox` ports.
- Update Console to show persistence mode and local API key hints.

## Runtime Behavior

- Default persistence is SQLite.
- Default data directory is `.stander`.
- Default database path is `.stander/stander-agent.sqlite`.
- Public provider list/get responses never return raw API keys.
- Runtime API key resolution order:
  1. provider local secret
  2. `apiKeyRef` environment variable
  3. `OPENAI_API_KEY`
  4. explicit configuration error

## Environment

```bash
PERSISTENCE_MODE=sqlite
STANDER_DATA_DIR=.stander
STANDER_DB_PATH=.stander/stander-agent.sqlite
STANDER_WORKSPACE_ROOT=/path/to/workspace
```

Use `PERSISTENCE_MODE=memory` to recover the previous in-memory behavior.

## Verification

- `node --check public/app.js`
- `npm run build`
- `npm run test`
- Start with SQLite, create provider/agent/MCP/session/events, restart, and confirm data remains.
- Confirm provider `hasApiKey: true` persists after restart without exposing the raw key.
- Confirm `/v1/platform/status` reports persistence and database path.
- Confirm sandbox rejects paths outside the workspace root.

