# M9 Execution Plan: Workflow Operations

## Summary

M9 builds on the M8 visual workflow builder by adding workflow operations: import/export, built-in templates, workflow run history, and clearer workflow run status visibility in the Console. The goal is to make saved workflows easier to reuse, move, audit, and revisit without adding a separate run store.

M9 does not change Graph/Swarm node-agent execution boundaries. Node agents still use only model/provider/systemPrompt/skills and do not load tools, MCP servers, or agentTools. Multi-user collaboration, permissions, and a template marketplace remain out of scope.

## Key Changes

- Add `GET /v1/workflows/:id/export` for portable workflow JSON.
- Add `POST /v1/workflows/import` for validated workflow imports that create a new local workflow id.
- Add built-in workflow template APIs:
  - `GET /v1/workflow-templates`
  - `POST /v1/workflow-templates/:id/create`
- Add three initial templates:
  - `graph-review-flow`: Plan -> Implement -> Review
  - `graph-research-flow`: Research -> Synthesize
  - `swarm-brainstorm`: multi-agent brainstorm starter
- Add `GET /v1/workflows/:id/runs`, derived from sessions and event log rather than a new run table.
- Extend the Console workflow area with Export JSON, Import JSON, Templates, and Run History panels.
- Improve workflow run timeline labels to show workflow/run status, node result count, and error summaries.

## API Behavior

- `GET /v1/workflows/:id/export`
  - Returns `200` with workflow JSON containing name, description, kind, nodes, edges, optional Swarm settings, and `exportedAt`.
  - Returns `404 { error: "Workflow not found" }` for unknown workflow ids.
- `POST /v1/workflows/import`
  - Accepts exported workflow-shaped JSON.
  - Strips original `id/createdAt/updatedAt`.
  - Appends `Imported` and a timestamp to the name.
  - Validates agent references, node ids, edges, and Swarm start node before creating the workflow.
- `GET /v1/workflow-templates`
  - Returns template summaries: `id/name/description/kind/nodeLabels`.
- `POST /v1/workflow-templates/:id/create`
  - Returns a draft-like `WorkflowDefinition` with `id: ""`.
  - Nodes include labels and positions, but `agentId` is an empty string placeholder.
  - The Console requires users to assign agents before saving or running.
- `GET /v1/workflows/:id/runs`
  - Filters sessions by `session.meta.workflowId`.
  - Derives `sessionId/runId/status/startedAt/completedAt/error/outputPreview` from session metadata and `multi_agent.*` events.
  - Sorts summaries by `startedAt` descending.

## Test Plan

- `node --check public/app.js`
- `npm run build`
- `npm run test`
- API smoke:
  - Export a workflow and import it as a new workflow.
  - Import a workflow with an unknown agent and confirm `400`.
  - List workflow templates and confirm the three built-in templates.
  - Create a template draft and confirm empty `agentId` placeholders.
  - Run a workflow and confirm `/v1/workflows/:id/runs` returns the new session summary.
  - Delete a workflow and confirm historical sessions/events remain readable through `/v1/sessions` and `/events`.
- Console smoke:
  - Export JSON from a saved workflow.
  - Import JSON and select the imported workflow.
  - Create a workflow from a template, fill node agents, save, and run.
  - Confirm Run History updates and history items open the session timeline.
  - Refresh and confirm workflows, history, and timelines recover from SQLite.

## Assumptions

- M9 keeps vanilla HTML/CSS/JS.
- Templates are static built-ins, not persisted template records.
- Run history is derived from session truth and event log.
- Node-level live streaming is deferred to M11 because it requires either different Graph/Swarm orchestration or SDK-level node event streams after the platform/harness event contract is hardened.
