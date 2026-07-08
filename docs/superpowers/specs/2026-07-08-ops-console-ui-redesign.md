# Ops Console UI Redesign

## Summary

Redesign Stander Console as an operations-first managed-agent console. The main product job is to let a developer configure agents and registries, run sessions or workflows, and inspect the resulting event timeline without losing context.

The approved direction is **Ops Console**: session events remain the central workspace, with object configuration and diagnostics in a right-side inspector. The design borrows workflow canvas affordances from the Builder Studio concept and global status summaries from the Mission Control concept, but the main hierarchy stays centered on sessions and events.

## Product Principles

- **Events are the source of truth.** The UI should make `SessionEvent` history visible, readable, and useful for debugging.
- **Configuration stays close to execution.** Agents, providers, MCP servers, workflows, tools, and skills are edited without navigating away from the active timeline.
- **Dense, calm, operational.** This is a developer console, not a landing page. Favor compact scanning, stable panes, restrained color, and clear status.
- **Small platform, clear boundaries.** Keep the current no-framework local startup flow. Do not introduce a frontend build system during this redesign.

## Information Architecture

Primary navigation should become task-oriented:

- **Monitor**: sessions, event timeline, composer, run status, event filters.
- **Agents**: agent list and agent editor.
- **Workflows**: workflow list, workflow canvas, templates, run history.
- **Connections**: model providers and MCP servers.
- **Registry**: tools and skills browser.

The session list stays visible because it is the fastest way to move between historical runs. The inspector changes content based on the active primary nav item and selected object.

## Layout

Desktop layout keeps three functional regions:

```text
┌───────────────┬──────────────────────────────┬──────────────────────┐
│ Navigation    │ Workspace                    │ Inspector            │
│               │                              │                      │
│ Platform      │ Active session/run header    │ Selected object      │
│ status        │ Metrics and filters          │ details              │
│               │                              │                      │
│ Primary nav   │ Event timeline               │ Forms, canvas tools, │
│               │                              │ test results         │
│ Session list  │ Composer / run input         │                      │
└───────────────┴──────────────────────────────┴──────────────────────┘
```

Responsive behavior:

- Below tablet widths, the layout stacks as navigation, workspace, inspector.
- The composer remains near the current timeline.
- Long forms use full width and avoid nested cards.
- Workflow canvas keeps a stable minimum height and scrolls horizontally if needed.

## Visual Direction

The UI should feel like a runtime console with a precise but human tone.

Token plan:

- `ink`: `#17211f`
- `panel`: `#fbfcfa`
- `field`: `#f4f7f5`
- `rail`: `#111918`
- `line`: `#d8dfda`
- `accent`: `#197c6b`
- `accent-strong`: `#0d5f53`
- `blue`: `#315acb`
- `amber`: `#b97121`
- `danger`: `#b43b31`

Typography:

- Use system sans for UI text.
- Use system monospace for event types, ids, JSON, and technical metadata.
- Avoid oversized display type. Headings should be compact and proportional to panels.

Signature element:

- Add a slim **event rail** beside the timeline, with event-specific color marks and compact metadata. This should make event sequences easier to scan without turning the page into a decorative timeline.

## Components

### Shell

- Left rail includes brand, connection/persistence status, primary nav, and sessions.
- Workspace owns the active timeline or active workflow run view.
- Inspector owns CRUD forms, selected workflow node properties, provider/MCP tests, registry details, and run history.

### Primary Nav

Use clear labels and small icons/symbols if implemented with text-safe characters or existing local assets. Numbered nav labels should be removed because the sections are not a fixed sequence.

### Session List

Each session item should show:

- title or agent/workflow name
- kind: `agent`, `graph`, or `swarm`
- status
- short id
- updated time when available

Status should use consistent pills: `idle`, `running`, `error`.

### Timeline

Timeline rows should support:

- user messages
- assistant messages and streaming text
- tool use
- tool result
- session status changes
- session errors
- multi-agent run started/completed/failed
- multi-agent node result

Rows should expose compact metadata by default and preserve enough content for debugging. JSON-like payloads should render in readable monospace blocks when shown.

### Composer

Composer behavior stays simple:

- Send message to the active `agent` session.
- Disable sending for non-agent workflow sessions.
- Keep clear disabled copy for workflow sessions.
- Preserve Enter-to-send and Shift+Enter behavior.

### Inspector

Inspector panels should be reorganized around the new nav:

- Agents editor: model provider, model id, prompt, tools, skills, MCP servers, child agents.
- Workflows editor: list, canvas, node inspector, templates, import/export, run history.
- Connections editor: providers and MCP servers, with test result blocks.
- Registry browser: tools and skills, with skill content detail.

### Empty and Error States

Empty states should guide the next action:

- No provider: create a provider.
- No agent: create an agent.
- No session: create a session from selected agent.
- No workflow nodes: add agent nodes.
- SSE disconnected: refresh events or select the session again.

Errors should be specific and operational, not apologetic.

## Data Flow

The redesign should keep the current API usage:

- `/v1/platform/status`
- `/v1/model-providers`
- `/v1/mcp-servers`
- `/v1/agents`
- `/v1/tools`
- `/v1/skills`
- `/v1/sessions`
- `/v1/sessions/:id/events`
- `/v1/sessions/:id/events/stream`
- `/v1/workflows`
- `/v1/workflow-templates`
- `/v1/workflows/:id/runs`

No backend API redesign is required for the UI refactor. Any missing display field should be handled defensively in the frontend.

## Implementation Scope

In scope:

- Rewrite the static HTML structure in `public/index.html`.
- Restructure CSS in `public/styles.css` around the new shell and components.
- Update `public/app.js` only where selectors, nav grouping, state labels, and rendering assumptions need to change.
- Add `.superpowers/` to `.gitignore`.
- Preserve all existing CRUD and run behaviors.

Out of scope:

- Introducing React, Vite, Tailwind, or a frontend package pipeline.
- Backend API changes.
- Authentication, multi-tenant UI, real sandbox controls, billing, or quota.
- Full visual mockup fidelity beyond the current local console needs.

## Testing

Verification should include:

- `npm test`
- Start the dev server with `npm run dev:server`
- Browser smoke test for:
  - platform load
  - nav switching
  - provider/agent/workflow forms visible
  - session selection
  - timeline rendering
  - responsive desktop and mobile screenshots

Manual test data can use the current local platform stores. The implementation should avoid depending on seeded data.

## Risks

- `public/app.js` is large and tightly coupled to DOM ids. Keep id changes minimal or update selectors carefully.
- A full visual rewrite can accidentally break existing workflows. Verify each current panel after restructuring.
- Workflow canvas layout is pointer-interaction heavy. Preserve its DOM anchors and event handlers unless a targeted change is necessary.
