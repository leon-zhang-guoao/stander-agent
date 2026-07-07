# M7 Execution Plan: Sessionized Multi-Agent Runs and Timeline

## Summary

M7 builds on the M6 SQLite event log and session persistence by moving the M5 Graph and Swarm experiment APIs into platform session truth. Each Graph or Swarm run now creates a platform session, appends multi-agent events, and can be inspected through the existing `/v1/sessions/:id/events` API and Console timeline.

M7 does not add a drag-and-drop workflow builder, reusable workflow persistence, node-level live streaming, or tool/MCP/agentTools loading for Graph/Swarm node agents.

## Scope

- Add `SessionKind = "agent" | "graph" | "swarm"`.
- Extend `SessionMeta` with `kind`, optional `title`, and optional `meta`.
- Keep normal `/v1/sessions` sessions as `kind: "agent"`.
- Persist Graph and Swarm runs as sessions:
  - Graph session `agentId` uses `nodeAgentIds[0]`.
  - Swarm session `agentId` uses `startAgentId`.
- Add multi-agent session events:
  - `multi_agent.run_started`
  - `multi_agent.node_result`
  - `multi_agent.run_completed`
  - `multi_agent.run_failed`
- Add SQLite migration support for `sessions.kind`, `sessions.title`, and `sessions.meta`.
- Add a Console `Runs` tab with simple Graph and Swarm forms.

## API Behavior

### `POST /v1/multi-agent/graph/runs`

Request:

```json
{
  "input": "Analyze this problem",
  "nodeAgentIds": ["agent-a", "agent-b"],
  "edges": [["agent-a", "agent-b"]]
}
```

Success response:

```json
{
  "sessionId": "...",
  "runId": "...",
  "status": "completed",
  "output": "...",
  "nodeResults": [],
  "events": []
}
```

Validation errors return `400` and do not create a session.

### `POST /v1/multi-agent/swarm/runs`

Request:

```json
{
  "input": "Coordinate a plan",
  "nodeAgentIds": ["agent-a", "agent-b"],
  "startAgentId": "agent-a",
  "maxSteps": 4
}
```

Success response mirrors Graph and includes `sessionId`, `runId`, `status`, `output`, `nodeResults`, and `events`.

If execution fails after validation, M7 keeps the created session, appends `multi_agent.run_failed`, `session.error`, and updates the session status to `error`.

### Direct Messages

`POST /v1/sessions/:id/messages` only accepts sessions with `kind: "agent"`.

Graph or Swarm sessions return:

```json
{ "error": "Session does not accept direct messages" }
```

with status `400`.

## Event Contract

Every multi-agent event includes:

- `sessionId`
- `runId`
- `mode: "graph" | "swarm"`
- a timestamp field

The event log remains append-only and is the source of truth for timeline recovery after refresh or restart.

## Console

The Console gains a `Runs` tab:

- Graph form:
  - input
  - node agents multi-select
  - edges JSON textarea
- Swarm form:
  - input
  - node agents multi-select
  - start agent select
  - max steps input
- On success, the Console selects the created session and renders the run events in the existing timeline.
- Session list labels prefer `session.title`, then fall back to the associated agent name.

## Acceptance

- `node --check public/app.js`
- `npm run build`
- `npm run test`
- Unknown node agents return `400` and do not create sessions.
- Invalid Graph edges return `400` and do not create sessions.
- Swarm `startAgentId` outside `nodeAgentIds` returns `400` and does not create sessions.
- Graph/Swarm execution creates sessions and writes run events.
- SQLite restart preserves run sessions and multi-agent events.
- The Console `Runs` tab can create Graph/Swarm runs and display the resulting timeline.

## Deferred

- M8: Graph/Swarm visual builder.
- Reusable workflow definitions.
- Live node-level streaming.
- Loading tools, MCP servers, or agentTools inside Graph/Swarm node agents.
