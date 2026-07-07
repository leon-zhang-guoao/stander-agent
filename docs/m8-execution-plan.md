# M8 Execution Plan: Visual Multi-Agent Workflow Builder

## Summary

M8 adds reusable multi-agent workflow definitions and a visual Console builder on top of M7 sessionized Graph/Swarm runs. Users can create, save, edit, and run Graph or Swarm workflows. Each run still creates a platform session and writes the existing `multi_agent.*` timeline events.

M8 does not add node-level live streaming, workflow import/export, templates, permissions, or tools/MCP/agentTools inside Graph/Swarm node agents.

## Key Changes

- Add `WorkflowDefinition`, `WorkflowNode`, `WorkflowEdge`, and `WorkflowStore`.
- Add workflow persistence to both in-memory and SQLite persistence.
- Add `/v1/workflows` CRUD and `/v1/workflows/:id/runs`.
- Keep M7 ad-hoc `/v1/multi-agent/graph/runs` and `/v1/multi-agent/swarm/runs`.
- Upgrade the Console `Runs` area into a `Workflows` builder with saved workflow list, SVG edge canvas, draggable agent nodes, node inspector, and workflow run form.

## API Behavior

- `POST /v1/workflows` creates a workflow after validating node ids, agent references, Graph edges, and Swarm start node.
- `GET /v1/workflows` lists saved workflows.
- `GET /v1/workflows/:id` returns one workflow or `404`.
- `PATCH /v1/workflows/:id` rejects empty patches, validates the merged workflow, and returns the updated definition.
- `DELETE /v1/workflows/:id` deletes only the workflow definition; previous run sessions remain readable.
- `POST /v1/workflows/:id/runs` accepts `{ input }`, executes the saved Graph/Swarm workflow, returns `sessionId/runId/workflowId/status/output/nodeResults/events`, and writes M7 timeline events.

## Test Plan

- `node --check public/app.js`
- `npm run build`
- `npm run test`
- API smoke:
  - create/list/get/patch/delete Graph workflow
  - create/list/get/patch/delete Swarm workflow
  - unknown agent, invalid edge, invalid start node return `400`
  - workflow run creates a session and writes multi-agent events
  - SQLite restart restores workflows, run sessions, and events
- Console smoke:
  - create workflow
  - add agent nodes
  - drag nodes
  - connect Graph nodes
  - save and reload workflow positions
  - run workflow and inspect resulting timeline

## Assumptions

- M8 keeps vanilla HTML/CSS/JS.
- Workflow nodes store canvas positions as part of the workflow definition.
- Graph/Swarm node agents continue to use only model/provider/systemPrompt/skills.
- Node-level live streaming, workflow templates, import/export, and deeper workflow governance are deferred to M9+.
