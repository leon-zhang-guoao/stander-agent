# Stander ACP Runtime Integration

## Summary

Expose Stander Agent to the TDS/OpenMA platform as an ACP-compatible runtime without modifying TDS.

The approved direction is **Stander ACP Adapter + Remote Runtime Transport**:

```text
TDS Agent
  -> AcpProxyHarness
  -> RuntimeRoom WebSocket
  -> oma bridge daemon
  -> npx @stander-agent/stander-agent acp
  -> internal HTTP/WebSocket transport
  -> Stander runtime service
  -> Strands agent loop / model / tools
```

TDS only sees a standard ACP child process. The ACP child process is a thin adapter that forwards session operations to a Stander runtime service running in the user's private environment.

## Goals

- Let Stander appear as a selectable ACP agent in TDS Local Runtime / New Agent flows.
- Keep TDS unchanged.
- Keep the real execution environment, model credentials, tools, and session state in the user's private Stander runtime environment.
- Use environment variables for adapter configuration and authentication.
- Default the Stander model to `azure-gpt-o4-mini`.
- Start with a minimal, testable integration before adding advanced platform features.

## Non-Goals

- Do not modify TDS source code or rely on TDS overlay changes.
- Do not require Stander to appear as a New Agent template such as Deep Researcher or Field Monitor.
- Do not implement long-term durable session storage in the first version.
- Do not implement full TDS skill/tool/sandbox parity in the first version.
- Do not put model provider secrets on the TDS machine unless explicitly needed later.

## Existing TDS Behavior

TDS has two distinct surfaces that are easy to confuse:

- New Agent templates, such as Deep Researcher and Field Monitor, prefill agent config.
- Local Runtime ACP agents are detected by `oma bridge daemon` and selected inside the agent form through runtime binding.

The ACP runtime path works as follows:

1. The daemon loads the official ACP registry and merges the TDS/OMA overlay.
2. The daemon detects installed ACP-compatible agents on the local machine.
3. The daemon connects to TDS `RuntimeRoom` and reports detected agents through a `hello` message.
4. TDS stores detected agent ids in the runtime's `agents_json`.
5. New Agent can bind an agent config to `{ runtime_id, acp_agent_id }`.
6. `AcpProxyHarness` sends `session.start`, `session.prompt`, and `session.cancel` through `RuntimeRoom`.
7. The daemon spawns the selected ACP child process and relays ACP session updates back to TDS.

Because we cannot change TDS, Stander must be known through the official ACP registry or another TDS-recognized registry/overlay entry. The clean path is the official ACP registry.

## Architecture

### ACP Adapter

The package `@stander-agent/stander-agent` exposes:

```bash
npx @stander-agent/stander-agent acp
```

This command runs on the TDS runtime machine. It implements ACP over stdio and maps ACP requests to remote Stander runtime calls.

Responsibilities:

- Handle ACP `initialize`.
- Handle ACP `session/new`.
- Handle ACP `session/prompt`.
- Handle ACP `session/cancel`.
- Convert Stander runtime events into ACP `session/update` notifications.
- Return explicit ACP errors for runtime connectivity, authentication, cancellation, and model/config failures.

The adapter should be thin. It should not become the main agent runtime.

### Stander Runtime Service

The Stander runtime service runs in the user's private project environment. It owns the actual agent execution.

Responsibilities:

- Create and track runtime sessions.
- Execute prompts through the existing Strands runtime adapter.
- Stream normalized events back to the ACP adapter.
- Hold model credentials and tool/runtime permissions.
- Enforce simple bearer-token authentication for the adapter.

The first version can keep sessions in memory and expose a small HTTP streaming API.

### Runtime Transport

Initial transport:

```text
POST /v1/runtime/sessions
POST /v1/runtime/sessions/:id/prompt
POST /v1/runtime/sessions/:id/cancel
```

Authentication:

```http
Authorization: Bearer <STANDER_RUNTIME_TOKEN>
```

The prompt endpoint should stream newline-delimited JSON or server-sent events. The implementation should choose the simpler option that fits the current Node runtime and test setup.

## Configuration

The ACP adapter reads:

```bash
STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
STANDER_RUNTIME_TOKEN=...
STANDER_MODEL=azure-gpt-o4-mini
```

Optional later configuration:

```bash
STANDER_RUNTIME_TIMEOUT_MS=60000
STANDER_RUNTIME_TLS_CA=...
```

The Stander runtime service should own model provider secrets where possible:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
```

The first version should treat `STANDER_MODEL` as default model selection and fall back to `azure-gpt-o4-mini`.

## ACP Registry Entry Draft

The official ACP registry entry should be similar to:

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

Before submission, add the real repository, website, and license metadata required by the ACP registry review process.

If the package is published only to a private npm registry, the TDS runtime machine must configure that registry for the `@stander-agent` scope and install the package globally. The official ACP registry may or may not accept a package that is not publicly installable, so public npm remains the lowest-friction path.

## Data Flow

### Discovery

```text
oma bridge daemon
  -> load official ACP registry
  -> see stander-agent
  -> detect npx/npm package installation
  -> report stander-agent in hello.agents
  -> TDS stores runtime agents_json
```

### Agent Creation

In TDS New Agent, the user enters the form view and chooses:

```text
Runtime = connected local machine
ACP Agent = stander-agent
```

TDS stores:

```ts
_oma: {
  harness: "acp-proxy",
  runtime_binding: {
    runtime_id: "...",
    acp_agent_id: "stander-agent"
  }
}
```

### Prompt Execution

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

The first version should support the event types needed for useful TDS output:

- `agent.text_delta` -> ACP content delta/session update.
- `agent.tool_use` -> ACP tool call start/update.
- `agent.tool_result` -> ACP tool call result/update.
- `agent.message` -> final assistant message/completion signal.
- `agent.error` -> ACP prompt error or session update error.

The exact ACP payload shapes should be implemented against the local `agent-client-protocol` source and verified with the TDS ACP runtime client.

## Error Handling

The adapter should fail loudly and usefully:

- Missing `STANDER_RUNTIME_URL`: fail during `initialize` or first session creation with a clear config error.
- Missing/invalid `STANDER_RUNTIME_TOKEN`: return authentication error.
- Stander runtime unavailable: return connection error.
- Prompt stream interrupted: return prompt/session error.
- TDS cancellation: forward cancellation to Stander runtime and stop streaming.

Errors should propagate back to TDS as ACP errors or session updates that TDS can render as `session.error`.

## Testing Strategy

Unit tests:

- ACP adapter request handling.
- Runtime client request construction and error handling.
- Stander event to ACP update mapping.

Integration tests:

- Start a fake Stander runtime service.
- Start the ACP adapter over stdio.
- Use the ACP SDK/client shape used by TDS to call `initialize`, `session/new`, `session/prompt`, and `session/cancel`.

Manual smoke test:

- Run `npx @stander-agent/stander-agent acp` with local environment variables.
- Connect it through an installed TDS `oma bridge daemon`.
- Create a TDS agent bound to `stander-agent`.
- Send a prompt and verify streaming text and completion.

## Manual Operator Checklist

After implementation, the user must complete these steps:

1. Open TDS Local Runtimes and choose Connect machine.
2. On the TDS runtime machine, run:

   ```bash
   npx @openma/cli@beta bridge setup
   ```

3. Confirm `oma bridge daemon` is installed and running persistently.
4. Configure npm source for `@stander-agent/stander-agent`:

   ```bash
   export STANDER_NPM_REGISTRY_URL="https://your-private-npm-registry"
   npm config set @stander-agent:registry "$STANDER_NPM_REGISTRY_URL"
   npm login --registry "$STANDER_NPM_REGISTRY_URL"
   ```

   Skip this registry step if the package is on public npm.

5. Install the adapter globally on the TDS runtime machine:

   ```bash
   npm install -g @stander-agent/stander-agent
   ```

6. Configure adapter environment variables on the daemon machine:

   ```bash
   export STANDER_RUNTIME_URL=http://stander-runtime.internal:8787
   export STANDER_RUNTIME_TOKEN="$YOUR_STANDER_RUNTIME_TOKEN"
   export STANDER_MODEL=azure-gpt-o4-mini
   ```

7. Ensure the TDS runtime machine can reach the Stander runtime service over the internal network.
8. Restart or refresh `oma bridge daemon` so it re-detects agents.
9. Confirm `stander-agent` appears in TDS Local Runtimes detected agents.
10. In TDS New Agent form, choose:

    ```text
    Runtime = the connected machine
    ACP Agent = stander-agent
    ```

11. Create the agent and send one test message.
12. If it fails, inspect logs in this order:

    ```text
    oma bridge daemon
    stander-agent acp adapter
    Stander runtime service
    ```

## Implementation Scope

In scope for the first implementation:

- CLI/bin entry for `stander-agent acp`.
- Minimal ACP server over stdio.
- Remote runtime client.
- Minimal Stander runtime service endpoints.
- Bearer-token authentication.
- Default model `azure-gpt-o4-mini`.
- Basic event mapping.
- Local and fake-runtime tests.
- Deployment documentation with the manual checklist above.

Out of scope for the first implementation:

- Full durable session persistence.
- TDS template integration.
- Full skill registry synchronization.
- Full sandbox/file-system parity with TDS tools.
- Multi-tenant authorization beyond a single shared runtime token.
- Automatic private npm setup.

## Risks

- TDS detection for npm/npx entries may require global installation, not only `npx` fetchability.
- Official ACP registry submission may reject private npm-only packages.
- ACP event payload compatibility must be verified against the local ACP schema and TDS client behavior.
- Streaming and cancellation semantics can drift between Stander events, ACP updates, and TDS UI expectations.
- Running model credentials on the wrong machine would weaken the desired private-runtime boundary.

## Open Decisions

- Final npm publishing target: public npm or private npm registry.
- Final project repository/website/license metadata for the ACP registry entry.
- HTTP NDJSON vs SSE for the internal Stander runtime prompt stream.
- Whether `STANDER_MODEL` is passed per session or treated as runtime-wide default.
