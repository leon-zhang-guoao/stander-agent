# M10 Execution Plan: Platform/Harness Boundary Hardening

## Summary

M10 makes the platform event log the first-class substrate for runtime context. Strands remains the loop engine, but prompt assembly and model context projection move into platform modules so sessions can be replayed, inspected, and evolved toward trajectory export without relying on Strands in-memory conversation state.

This stage intentionally does not implement full OpenMA compatibility, real automatic compaction, or full trajectory export.

## Key Changes

- Add platform-owned prompt composition through `src/platform/prompt.ts`.
- Add event-to-model-context projection through `src/platform/context-projection.ts`.
- Add event ids and richer tool event fields to `SessionEvent`.
- Add `agent.thread_context_compacted` as the future durable compaction marker.
- Pass platform-composed `systemPrompt` and derived `modelContext` into `AgentRuntime.runMessage`.
- Seed Strands agents from derived model context when creating or refreshing the session runtime.
- Keep old events compatible by making new fields optional.
- Show tool correlation ids and compaction markers in the Console timeline.

## Runtime Boundary

The platform now prepares:

- resolved agent config
- default and triggered skill prompt fragments
- final system prompt
- event-derived model context
- model provider, MCP servers, child agent tools, and session metadata

The Strands runtime consumes these inputs, runs the loop, and translates stream events back into `SessionEvent`.

## Testing

- `npm run test:platform-boundary`
- `npm run build`
- `npm run test`

The platform boundary test covers prompt composition, event projection, legacy event compatibility, compaction marker projection, and event id creation.

## Deferred

The previous M10 idea, Node-Level Workflow Streaming, is deferred until the event contract is stable enough to represent node-level progress without leaking SDK-specific runtime details.
