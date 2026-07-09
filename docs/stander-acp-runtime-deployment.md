# Stander ACP Runtime Deployment

## Overview

This deployment connects Stander Agent to TDS/OpenMA through ACP without changing TDS.

TDS runs the ACP adapter:

```bash
npx @stander-agent/stander-agent acp
```

The adapter connects over the internal network to a private Stander runtime service:

```text
STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
```

## Runtime Service

Start the private Stander runtime service in the environment that owns model credentials and tool execution:

```bash
export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
export STANDER_MODEL=azure-gpt-o4-mini
export OPENAI_API_KEY="$YOUR_OPENAI_API_KEY"
export OPENAI_BASE_URL="$YOUR_OPENAI_BASE_URL"
npm run dev:runtime
```

For a local smoke run, use:

```bash
export STANDER_RUNTIME_TOKEN=local-test-token
export STANDER_MODEL=azure-gpt-o4-mini
export PERSISTENCE_MODE=memory
npm run dev:runtime
```

## TDS Runtime Machine

If using a private npm registry:

```bash
export STANDER_NPM_REGISTRY_URL="https://your-private-npm-registry"
npm config set @stander-agent:registry "$STANDER_NPM_REGISTRY_URL"
npm login --registry "$STANDER_NPM_REGISTRY_URL"
```

Install the adapter globally:

```bash
npm install -g @stander-agent/stander-agent
```

Configure adapter environment:

```bash
export STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
export STANDER_MODEL=azure-gpt-o4-mini
```

## TDS Manual Operator Checklist

These are the steps the operator must perform after the adapter and runtime service are available:

1. Open TDS Local Runtimes and choose Connect machine.
2. On the TDS runtime machine, run:

   ```bash
   npx @openma/cli@beta bridge setup
   ```

3. Confirm `oma bridge daemon` is installed and running persistently.
4. Configure npm source for `@stander-agent/stander-agent` if using private npm.
5. Install the adapter globally with `npm install -g @stander-agent/stander-agent`.
6. Configure `STANDER_RUNTIME_URL`, `STANDER_RUNTIME_TOKEN`, and `STANDER_MODEL` for the daemon environment.
7. Ensure the TDS runtime machine can reach the Stander runtime service over the internal network.
8. Restart or refresh `oma bridge daemon` so it re-detects agents.
9. Confirm `stander-agent` appears in TDS Local Runtimes detected agents.
10. In TDS New Agent form, choose the connected runtime and `stander-agent`.
11. Create the agent and send one test message.
12. If it fails, inspect logs in this order: `oma bridge daemon`, `stander-agent acp adapter`, `Stander runtime service`.

## ACP Registry Note

Without changing TDS, `stander-agent` must be known to TDS through the official ACP registry or another TDS-recognized registry/overlay entry.

The registry entry should point to:

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

If the package is private, the TDS runtime machine must be configured so `npm install -g @stander-agent/stander-agent` and `npx @stander-agent/stander-agent acp` resolve through the private registry.
