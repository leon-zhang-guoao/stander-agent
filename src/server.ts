import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Agent, Graph, Swarm, type ContentBlock } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import { z } from 'zod'
import {
  createAgent,
  getTextDelta,
  getToolUseName,
  isToolResultEvent,
} from './agent'
import { EventStreamHub } from './platform/event-stream-hub'
import { deriveModelContext } from './platform/context-projection'
import { LocalWorkspaceSandbox } from './platform/local-workspace-sandbox'
import { createPlatformPersistence } from './platform/persistence-factory'
import { composePlatformPrompt } from './platform/prompt'
import {
  createAgentRequestSchema,
  createModelProviderRequestSchema,
  createMcpServerRequestSchema,
  createPlatformSessionRequestSchema,
  createWorkflowRequestSchema,
  graphRunRequestSchema,
  importWorkflowRequestSchema,
  patchModelProviderRequestSchema,
  patchMcpServerRequestSchema,
  patchAgentRequestSchema,
  patchWorkflowRequestSchema,
  postSessionMessageRequestSchema,
  swarmRunRequestSchema,
  workflowRunRequestSchema,
} from './platform/schemas'
import { listMcpTools } from './platform/mcp-runtime'
import { createProviderFetch } from './platform/model-provider-tls'
import { createSessionEvent } from './platform/session-events'
import { createFileSkillRegistry } from './platform/skill-registry'
import { StrandsRuntime } from './platform/strands-runtime'
import { createBuiltinToolRegistry } from './platform/tool-registry'
import type {
  AgentConfig,
  CreateAgentConfigInput,
  McpServerConfig,
  ModelProviderConfig,
  MultiAgentMode,
  SessionEvent,
  UpdateAgentConfigInput,
  WorkflowDefinition,
  WorkflowRunSummary,
  WorkflowTemplateSummary,
} from './platform/types'
import { withTriggeredSkills } from './skills'

const chatRequestSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1).optional(),
})

const createSessionRequestSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
  })
  .optional()

type SessionState = {
  agent: ReturnType<typeof createAgent>
  queue: Promise<void>
  lastUsedAt: number
}

type PlatformSessionRun = Promise<void>

type MultiAgentNodeResult = {
  nodeId: string
  status: string
  output: string
  error?: string
}

type MultiAgentSerializedResult = {
  status: string
  output: string
  nodeResults: MultiAgentNodeResult[]
}

const workflowTemplates: Array<
  WorkflowTemplateSummary & Pick<WorkflowDefinition, 'nodes' | 'edges' | 'startNodeId' | 'maxSteps'>
> = [
  {
    id: 'graph-review-flow',
    name: 'Graph Review Flow',
    description: 'Plan -> Implement -> Review deterministic workflow skeleton.',
    kind: 'graph',
    nodeLabels: ['Plan', 'Implement', 'Review'],
    nodes: [
      { id: 'plan', agentId: '', label: 'Plan', position: { x: 42, y: 88 } },
      { id: 'implement', agentId: '', label: 'Implement', position: { x: 242, y: 88 } },
      { id: 'review', agentId: '', label: 'Review', position: { x: 442, y: 88 } },
    ],
    edges: [
      { id: 'edge_plan_implement', sourceNodeId: 'plan', targetNodeId: 'implement' },
      { id: 'edge_implement_review', sourceNodeId: 'implement', targetNodeId: 'review' },
    ],
  },
  {
    id: 'graph-research-flow',
    name: 'Graph Research Flow',
    description: 'Research -> Synthesize workflow skeleton.',
    kind: 'graph',
    nodeLabels: ['Research', 'Synthesize'],
    nodes: [
      { id: 'research', agentId: '', label: 'Research', position: { x: 86, y: 112 } },
      { id: 'synthesize', agentId: '', label: 'Synthesize', position: { x: 330, y: 112 } },
    ],
    edges: [{ id: 'edge_research_synthesize', sourceNodeId: 'research', targetNodeId: 'synthesize' }],
  },
  {
    id: 'swarm-brainstorm',
    name: 'Swarm Brainstorm',
    description: 'Multi-agent brainstorm starting point for dynamic handoff experiments.',
    kind: 'swarm',
    nodeLabels: ['Starter', 'Diverge', 'Critique'],
    nodes: [
      { id: 'starter', agentId: '', label: 'Starter', position: { x: 76, y: 80 } },
      { id: 'diverge', agentId: '', label: 'Diverge', position: { x: 294, y: 54 } },
      { id: 'critique', agentId: '', label: 'Critique', position: { x: 294, y: 166 } },
    ],
    edges: [],
    startNodeId: 'starter',
    maxSteps: 4,
  },
]

const sessions = new Map<string, SessionState>()
const eventStreamHub = new EventStreamHub()
const platform = createPlatformPersistence({
  onEvent: (sessionId, event) => eventStreamHub.publish(sessionId, event),
})
const sandbox = new LocalWorkspaceSandbox({
  workspaceRoot: process.env.STANDER_WORKSPACE_ROOT ?? process.cwd(),
})
const toolRegistry = createBuiltinToolRegistry()
const skillRegistry = createFileSkillRegistry()
const runtime = new StrandsRuntime(toolRegistry, skillRegistry, platform)
const platformSessionRuns = new Map<string, PlatformSessionRun>()
const publicDir = path.join(process.cwd(), 'public')
const staticTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
])

function getSession(sessionId: string) {
  const existing = sessions.get(sessionId)
  if (existing) {
    existing.lastUsedAt = Date.now()
    return existing
  }

  const state: SessionState = {
    agent: createAgent(),
    queue: Promise.resolve(),
    lastUsedAt: Date.now(),
  }
  sessions.set(sessionId, state)
  return state
}

async function handleCreateSession(req: IncomingMessage, res: ServerResponse) {
  const body = createSessionRequestSchema.parse(await readJson(req))
  const sessionId = body?.sessionId ?? randomUUID()
  getSession(sessionId)
  sendJson(res, 201, { sessionId })
}

function handleDeleteSession(sessionId: string, res: ServerResponse) {
  const deleted = sessions.delete(sessionId)
  sendJson(res, 200, { sessionId, deleted })
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function sendSse(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function sendSseComment(res: ServerResponse, comment: string) {
  res.write(`: ${comment}\n\n`)
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const filePath = path.resolve(publicDir, relativePath)

  if (!filePath.startsWith(publicDir + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' })
    return
  }

  try {
    const content = await fs.readFile(filePath)
    const contentType =
      staticTypes.get(path.extname(filePath)) ?? 'application/octet-stream'

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : content)
  } catch {
    sendJson(res, 404, {
      error: 'Not Found',
      routes: ['GET /', 'GET /health', 'POST /chat', 'POST /chat/stream'],
    })
  }
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const rawBody = Buffer.concat(chunks).toString('utf-8')
  return rawBody ? JSON.parse(rawBody) : {}
}

async function runExclusive<T>(session: SessionState, task: () => Promise<T>) {
  const previous = session.queue
  let release!: () => void

  session.queue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous

  try {
    return await task()
  } finally {
    session.lastUsedAt = Date.now()
    release()
  }
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  const body = chatRequestSchema.parse(await readJson(req))
  const sessionId = body.sessionId ?? randomUUID()
  const session = getSession(sessionId)
  const message = await withTriggeredSkills(body.message)

  const answer = await runExclusive(session, async () => {
    let text = ''
    const tools: string[] = []
    const stream = await session.agent.stream(message)

    for await (const event of stream) {
      const textDelta = getTextDelta(event)
      const toolName = getToolUseName(event)

      if (textDelta) {
        text += textDelta
      } else if (toolName) {
        tools.push(toolName)
      }
    }

    return { text, tools }
  })

  sendJson(res, 200, {
    sessionId,
    answer: answer.text,
    tools: answer.tools,
  })
}

async function handleChatStream(req: IncomingMessage, res: ServerResponse) {
  const body = chatRequestSchema.parse(await readJson(req))
  const sessionId = body.sessionId ?? randomUUID()
  const session = getSession(sessionId)
  const message = await withTriggeredSkills(body.message)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  })

  await runExclusive(session, async () => {
    sendSse(res, 'session', { sessionId })
    const stream = await session.agent.stream(message)

    for await (const event of stream) {
      const text = getTextDelta(event)
      const toolName = getToolUseName(event)

      if (text) {
        sendSse(res, 'text', { text })
      } else if (toolName) {
        sendSse(res, 'tool_use', { name: toolName })
      } else if (isToolResultEvent(event)) {
        sendSse(res, 'tool_result', {})
      }
    }

    sendSse(res, 'done', { sessionId })
  })

  res.end()
}

function getRouteId(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) {
    return undefined
  }

  const rawId = pathname.slice(prefix.length)
  if (!rawId || rawId.includes('/')) {
    return undefined
  }

  return decodeURIComponent(rawId)
}

function getResourceSubpath(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) {
    return undefined
  }

  const rest = pathname.slice(prefix.length)
  const slashIndex = rest.indexOf('/')
  const rawId = slashIndex === -1 ? rest : rest.slice(0, slashIndex)
  const suffix = slashIndex === -1 ? '' : rest.slice(slashIndex)

  if (!rawId) {
    return undefined
  }

  return {
    id: decodeURIComponent(rawId),
    suffix,
  }
}

async function validateAgentConfigInput(
  input: CreateAgentConfigInput | UpdateAgentConfigInput,
  existingAgentId?: string,
) {
  if (input.modelProviderId) {
    const provider = await platform.modelProviders.get(input.modelProviderId)
    if (!provider) {
      return 'Unknown model provider'
    }
  }

  if (input.tools) {
    const unknownTools = toolRegistry.unknown(input.tools)
    if (unknownTools.length) {
      return `Unknown tools: ${unknownTools.join(', ')}`
    }
  }

  if (input.skills) {
    const unknownSkills = await skillRegistry.unknown(input.skills)
    if (unknownSkills.length) {
      return `Unknown skills: ${unknownSkills.join(', ')}`
    }
  }

  if (input.mcpServers) {
    const missingServers: string[] = []
    for (const id of input.mcpServers) {
      if (!(await platform.mcpServers.get(id))) {
        missingServers.push(id)
      }
    }
    if (missingServers.length) {
      return `Unknown MCP servers: ${missingServers.join(', ')}`
    }
  }

  if (input.agentTools) {
    const missingAgents: string[] = []
    for (const id of input.agentTools) {
      if (existingAgentId && id === existingAgentId) {
        return 'Agent cannot reference itself as an agent tool'
      }
      if (!(await platform.agents.get(id))) {
        missingAgents.push(id)
      }
    }
    if (missingAgents.length) {
      return `Unknown agent tools: ${missingAgents.join(', ')}`
    }
  }

  return undefined
}

async function handlePlatformModelProviders(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'POST' && pathname === '/v1/model-providers') {
    const body = createModelProviderRequestSchema.parse(await readJson(req))
    const provider = await platform.modelProviders.create(body)
    sendJson(res, 201, provider)
    return true
  }

  if (req.method === 'GET' && pathname === '/v1/model-providers') {
    sendJson(res, 200, await platform.modelProviders.list())
    return true
  }

  const providerPath = getProviderSubpath(pathname)
  if (!providerPath) {
    return false
  }

  const { providerId, suffix } = providerPath

  if (req.method === 'POST' && suffix === '/test') {
    await handleTestModelProvider(res, providerId)
    return true
  }

  if (suffix !== '') {
    return false
  }

  if (req.method === 'GET') {
    const provider = await platform.modelProviders.get(providerId)
    if (!provider) {
      sendJson(res, 404, { error: 'Model provider not found' })
      return true
    }

    sendJson(res, 200, provider)
    return true
  }

  if (req.method === 'PATCH') {
    const body = patchModelProviderRequestSchema.parse(await readJson(req))
    const provider = await platform.modelProviders.update(providerId, body)
    if (!provider) {
      sendJson(res, 404, { error: 'Model provider not found' })
      return true
    }

    sendJson(res, 200, provider)
    return true
  }

  if (req.method === 'DELETE') {
    const deleted = await platform.modelProviders.delete(providerId)
    if (!deleted) {
      sendJson(res, 404, { error: 'Model provider not found' })
      return true
    }

    sendJson(res, 200, { deleted: true })
    return true
  }

  return false
}

async function handlePlatformMcpServers(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'POST' && pathname === '/v1/mcp-servers') {
    const body = createMcpServerRequestSchema.parse(await readJson(req))
    const server = await platform.mcpServers.create(body)
    sendJson(res, 201, server)
    return true
  }

  if (req.method === 'GET' && pathname === '/v1/mcp-servers') {
    sendJson(res, 200, await platform.mcpServers.list())
    return true
  }

  const serverPath = getResourceSubpath(pathname, '/v1/mcp-servers/')
  if (!serverPath) {
    return false
  }

  const { id: serverId, suffix } = serverPath

  if (req.method === 'POST' && suffix === '/test') {
    await handleTestMcpServer(res, serverId)
    return true
  }

  if (req.method === 'GET' && suffix === '/tools') {
    await handleListMcpServerTools(res, serverId)
    return true
  }

  if (suffix !== '') {
    return false
  }

  if (req.method === 'GET') {
    const server = await platform.mcpServers.get(serverId)
    if (!server) {
      sendJson(res, 404, { error: 'MCP server not found' })
      return true
    }

    sendJson(res, 200, server)
    return true
  }

  if (req.method === 'PATCH') {
    const body = patchMcpServerRequestSchema.parse(await readJson(req))
    const server = await platform.mcpServers.update(serverId, body)
    if (!server) {
      sendJson(res, 404, { error: 'MCP server not found' })
      return true
    }

    sendJson(res, 200, server)
    return true
  }

  if (req.method === 'DELETE') {
    const deleted = await platform.mcpServers.delete(serverId)
    if (!deleted) {
      sendJson(res, 404, { error: 'MCP server not found' })
      return true
    }

    sendJson(res, 200, { deleted: true })
    return true
  }

  return false
}

async function handleTestMcpServer(res: ServerResponse, serverId: string) {
  const server = await platform.mcpServers.get(serverId)
  if (!server) {
    sendJson(res, 404, { error: 'MCP server not found' })
    return
  }

  try {
    const tools = await listMcpTools(server)
    sendJson(res, 200, { ok: true, tools })
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      cause: getErrorCauseMessage(error),
    })
  }
}

async function handleListMcpServerTools(res: ServerResponse, serverId: string) {
  const server = await platform.mcpServers.get(serverId)
  if (!server) {
    sendJson(res, 404, { error: 'MCP server not found' })
    return
  }

  try {
    sendJson(res, 200, await listMcpTools(server))
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      cause: getErrorCauseMessage(error),
    })
  }
}

function getProviderSubpath(pathname: string) {
  const prefix = '/v1/model-providers/'
  if (!pathname.startsWith(prefix)) {
    return undefined
  }

  const rest = pathname.slice(prefix.length)
  const slashIndex = rest.indexOf('/')
  const rawProviderId = slashIndex === -1 ? rest : rest.slice(0, slashIndex)
  const suffix = slashIndex === -1 ? '' : rest.slice(slashIndex)

  if (!rawProviderId) {
    return undefined
  }

  return {
    providerId: decodeURIComponent(rawProviderId),
    suffix,
  }
}

async function handleTestModelProvider(res: ServerResponse, providerId: string) {
  const provider = await platform.modelProviders.getWithSecret(providerId)
  if (!provider) {
    sendJson(res, 404, { error: 'Model provider not found' })
    return
  }

  if (provider.type !== 'openai-compatible') {
    sendJson(res, 400, { error: 'Model provider type is not supported yet' })
    return
  }

  const apiKey = getProviderApiKey(provider)
  if (!apiKey) {
    sendJson(res, 200, {
      ok: false,
      error: 'Model provider API key is not configured',
    })
    return
  }

  const modelsUrl = new URL('models', provider.baseURL.endsWith('/') ? provider.baseURL : `${provider.baseURL}/`)

  try {
    const providerFetch = createProviderFetch(provider) ?? fetch
    const response = await providerFetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    const json = await response.json().catch(() => undefined)

    if (!response.ok) {
      sendJson(res, 200, {
        ok: false,
        status: response.status,
        error: json,
      })
      return
    }

    const data = Array.isArray(json?.data) ? json.data : []
    sendJson(res, 200, {
      ok: true,
      status: response.status,
      models: data.slice(0, 20).map((model: any) => ({
        id: model.id,
        ownedBy: model.owned_by,
      })),
    })
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      cause: getErrorCauseMessage(error),
    })
  }
}

function getProviderApiKey(provider?: { apiKey?: string; apiKeyRef?: string }) {
  if (provider?.apiKey) {
    return provider.apiKey
  }
  if (provider?.apiKeyRef) {
    return process.env[provider.apiKeyRef] ?? process.env.OPENAI_API_KEY ?? ''
  }
  return process.env.OPENAI_API_KEY ?? ''
}

function getErrorCauseMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined
  }

  const cause = error.cause
  if (cause && typeof cause === 'object') {
    const message = 'message' in cause ? String(cause.message) : undefined
    const code = 'code' in cause ? String(cause.code) : undefined
    return code && message ? `${code}: ${message}` : message ?? code
  }

  return undefined
}

async function handlePlatformRegistries(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'GET' && pathname === '/v1/tools') {
    sendJson(res, 200, toolRegistry.list())
    return true
  }

  if (req.method === 'GET' && pathname === '/v1/skills') {
    sendJson(res, 200, await skillRegistry.list())
    return true
  }

  const skillName = getRouteId(pathname, '/v1/skills/')
  if (req.method === 'GET' && skillName) {
    const skill = await skillRegistry.get(skillName)
    if (!skill) {
      sendJson(res, 404, { error: 'Skill not found' })
      return true
    }

    sendJson(res, 200, skill)
    return true
  }

  return false
}

async function handlePlatformAgents(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'POST' && pathname === '/v1/agents') {
    const body = createAgentRequestSchema.parse(await readJson(req))
    const validationError = await validateAgentConfigInput(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      return true
    }

    const agent = await platform.agents.create(body)
    sendJson(res, 201, agent)
    return true
  }

  if (req.method === 'GET' && pathname === '/v1/agents') {
    sendJson(res, 200, await platform.agents.list())
    return true
  }

  const agentId = getRouteId(pathname, '/v1/agents/')
  if (!agentId) {
    return false
  }

  if (req.method === 'GET') {
    const agent = await platform.agents.get(agentId)
    if (!agent) {
      sendJson(res, 404, { error: 'Agent not found' })
      return true
    }

    sendJson(res, 200, agent)
    return true
  }

  if (req.method === 'PATCH') {
    const body = patchAgentRequestSchema.parse(await readJson(req))
    const validationError = await validateAgentConfigInput(body, agentId)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      return true
    }

    const agent = await platform.agents.update(agentId, body)
    if (!agent) {
      sendJson(res, 404, { error: 'Agent not found' })
      return true
    }

    sendJson(res, 200, agent)
    return true
  }

  if (req.method === 'DELETE') {
    const deleted = await platform.agents.delete(agentId)
    if (!deleted) {
      sendJson(res, 404, { error: 'Agent not found' })
      return true
    }

    sendJson(res, 200, { deleted: true })
    return true
  }

  return false
}

async function handlePlatformWorkflows(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'POST' && pathname === '/v1/workflows') {
    const body = createWorkflowRequestSchema.parse(await readJson(req))
    const validationError = await validateWorkflowDefinition(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      return true
    }

    const workflow = await platform.workflows.create(body)
    sendJson(res, 201, workflow)
    return true
  }

  if (req.method === 'GET' && pathname === '/v1/workflows') {
    sendJson(res, 200, await platform.workflows.list())
    return true
  }

  if (req.method === 'POST' && pathname === '/v1/workflows/import') {
    const body = importWorkflowRequestSchema.parse(await readJson(req))
    const input = {
      name: `${body.name} Imported ${new Date().toISOString().replace(/[:.]/g, '-')}`,
      description: body.description,
      kind: body.kind,
      nodes: body.nodes,
      edges: body.edges,
      startNodeId: body.startNodeId,
      maxSteps: body.maxSteps,
    }
    const validationError = await validateWorkflowDefinition(input)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      return true
    }

    const workflow = await platform.workflows.create(input)
    sendJson(res, 201, workflow)
    return true
  }

  const workflowPath = getResourceSubpath(pathname, '/v1/workflows/')
  if (!workflowPath) {
    return false
  }

  const { id: workflowId, suffix } = workflowPath

  if (req.method === 'POST' && suffix === '/runs') {
    await handleWorkflowRun(req, res, workflowId)
    return true
  }

  if (req.method === 'GET' && suffix === '/export') {
    const workflow = await platform.workflows.get(workflowId)
    if (!workflow) {
      sendJson(res, 404, { error: 'Workflow not found' })
      return true
    }
    sendJson(res, 200, createWorkflowExport(workflow))
    return true
  }

  if (req.method === 'GET' && suffix === '/runs') {
    const workflow = await platform.workflows.get(workflowId)
    if (!workflow) {
      sendJson(res, 404, { error: 'Workflow not found' })
      return true
    }
    sendJson(res, 200, await listWorkflowRuns(workflow.id))
    return true
  }

  if (suffix !== '') {
    return false
  }

  if (req.method === 'GET') {
    const workflow = await platform.workflows.get(workflowId)
    if (!workflow) {
      sendJson(res, 404, { error: 'Workflow not found' })
      return true
    }
    sendJson(res, 200, workflow)
    return true
  }

  if (req.method === 'PATCH') {
    const patch = patchWorkflowRequestSchema.parse(await readJson(req))
    const existing = await platform.workflows.get(workflowId)
    if (!existing) {
      sendJson(res, 404, { error: 'Workflow not found' })
      return true
    }

    const merged: WorkflowDefinition = {
      ...existing,
      ...patch,
      nodes: patch.nodes ?? existing.nodes,
      edges: patch.edges ?? existing.edges,
      updatedAt: existing.updatedAt,
    }
    const validationError = await validateWorkflowDefinition(merged)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      return true
    }

    const workflow = await platform.workflows.update(workflowId, patch)
    sendJson(res, 200, workflow)
    return true
  }

  if (req.method === 'DELETE') {
    const deleted = await platform.workflows.delete(workflowId)
    if (!deleted) {
      sendJson(res, 404, { error: 'Workflow not found' })
      return true
    }
    sendJson(res, 200, { deleted: true })
    return true
  }

  return false
}

async function handleWorkflowTemplates(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'GET' && pathname === '/v1/workflow-templates') {
    sendJson(
      res,
      200,
      workflowTemplates.map(({ nodes: _nodes, edges: _edges, startNodeId: _startNodeId, maxSteps: _maxSteps, ...summary }) => summary),
    )
    return true
  }

  const templatePath = getResourceSubpath(pathname, '/v1/workflow-templates/')
  if (!templatePath) {
    return false
  }

  if (req.method === 'POST' && templatePath.suffix === '/create') {
    const template = workflowTemplates.find((item) => item.id === templatePath.id)
    if (!template) {
      sendJson(res, 404, { error: 'Workflow template not found' })
      return true
    }

    sendJson(res, 200, instantiateWorkflowTemplate(template))
    return true
  }

  return false
}

function instantiateWorkflowTemplate(
  template: typeof workflowTemplates[number],
): WorkflowDefinition {
  const timestamp = nowIso()
  const nodeIdMap = new Map(
    template.nodes.map((node) => [node.id, `${node.id}_${randomUUID().slice(0, 8)}`]),
  )

  return {
    id: '',
    name: template.name,
    description: template.description,
    kind: template.kind,
    nodes: template.nodes.map((node) => ({
      ...node,
      id: nodeIdMap.get(node.id) ?? node.id,
      agentId: '',
      position: { ...node.position },
    })),
    edges: template.edges.map((edge) => ({
      id: `${edge.id}_${randomUUID().slice(0, 8)}`,
      sourceNodeId: nodeIdMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      targetNodeId: nodeIdMap.get(edge.targetNodeId) ?? edge.targetNodeId,
    })),
    startNodeId: template.startNodeId ? nodeIdMap.get(template.startNodeId) : undefined,
    maxSteps: template.maxSteps,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function createWorkflowExport(workflow: WorkflowDefinition) {
  return {
    name: workflow.name,
    description: workflow.description,
    kind: workflow.kind,
    nodes: workflow.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: workflow.edges.map((edge) => ({ ...edge })),
    startNodeId: workflow.startNodeId,
    maxSteps: workflow.maxSteps,
    exportedAt: nowIso(),
  }
}

async function listWorkflowRuns(workflowId: string): Promise<WorkflowRunSummary[]> {
  const sessions = (await platform.sessions.list()).filter(
    (session) => session.meta?.workflowId === workflowId,
  )
  const summaries = await Promise.all(
    sessions.map(async (session) => {
      const events = await platform.events.list(session.id)
      const started = events.find((event) => event.type === 'multi_agent.run_started')
      const completed = [...events].reverse().find((event) => event.type === 'multi_agent.run_completed')
      const failed = [...events].reverse().find((event) => event.type === 'multi_agent.run_failed')
      const error = [...events].reverse().find((event) => event.type === 'session.error')
      const runId =
        (typeof session.meta?.runId === 'string' ? session.meta.runId : undefined) ??
        (started?.type === 'multi_agent.run_started' ? started.runId : session.id)
      const startedAt =
        started?.type === 'multi_agent.run_started' ? started.createdAt : session.createdAt
      const completedAt =
        completed?.type === 'multi_agent.run_completed'
          ? completed.createdAt
          : failed?.type === 'multi_agent.run_failed'
            ? failed.createdAt
            : error?.type === 'session.error'
              ? error.createdAt
              : undefined
      const output =
        completed?.type === 'multi_agent.run_completed' && completed.output
          ? completed.output
          : undefined
      const message =
        failed?.type === 'multi_agent.run_failed'
          ? failed.message
          : error?.type === 'session.error'
            ? error.message
            : undefined

      return {
        sessionId: session.id,
        runId,
        status:
          message
            ? 'error'
            : completed?.type === 'multi_agent.run_completed'
              ? completed.status
              : session.status,
        startedAt,
        completedAt,
        error: message,
        outputPreview: output ? truncateText(output, 240) : undefined,
      }
    }),
  )

  return summaries.sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

async function handleWorkflowRun(
  req: IncomingMessage,
  res: ServerResponse,
  workflowId: string,
) {
  const body = workflowRunRequestSchema.parse(await readJson(req))
  const workflow = await platform.workflows.get(workflowId)
  if (!workflow) {
    sendJson(res, 404, { error: 'Workflow not found' })
    return
  }

  const validationError = await validateWorkflowDefinition(workflow)
  if (validationError) {
    sendJson(res, 400, { error: validationError })
    return
  }

  try {
    const nodeAgentIds = workflow.nodes.map((node) => node.agentId)
    const nodes = await resolveExperimentAgents(nodeAgentIds)
    const nodeAgentIdByNodeId = new Map(workflow.nodes.map((node) => [node.id, node.agentId]))
    const sessionAgentId =
      workflow.kind === 'swarm'
        ? nodeAgentIdByNodeId.get(workflow.startNodeId ?? '') ?? nodeAgentIds[0]
        : nodeAgentIds[0]

    const result = await runMultiAgentSession({
      mode: workflow.kind,
      input: body.input,
      sessionAgentId,
      nodeAgentIds,
      nodes,
      title: workflow.name,
      meta: {
        workflowId: workflow.id,
        workflowKind: workflow.kind,
      },
      createRunner: async (resolvedNodes) => {
        if (workflow.kind === 'graph') {
          const graph = new Graph({
            nodes: resolvedNodes,
            edges: workflow.edges.map((edge) => [
              nodeAgentIdByNodeId.get(edge.sourceNodeId) ?? edge.sourceNodeId,
              nodeAgentIdByNodeId.get(edge.targetNodeId) ?? edge.targetNodeId,
            ]),
          })
          return serializeMultiAgentResult(await graph.invoke(body.input))
        }

        const swarm = new Swarm({
          nodes: resolvedNodes,
          start: sessionAgentId,
          maxSteps: workflow.maxSteps ?? 4,
        })
        return serializeMultiAgentResult(await swarm.invoke(body.input))
      },
    })

    sendJson(res, 200, {
      workflowId: workflow.id,
      ...result,
    })
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

async function resolveAgentRuntimeConfig(agent: AgentConfig) {
  const modelProvider = agent.modelProviderId
    ? await platform.modelProviders.getWithSecret(agent.modelProviderId)
    : undefined
  const mcpServers = await Promise.all(
    (agent.mcpServers ?? []).map((id) => platform.mcpServers.get(id)),
  )
  const agentTools = await Promise.all(
    (agent.agentTools ?? []).map((id) => platform.agents.get(id)),
  )

  return {
    modelProvider,
    mcpServers,
    agentTools,
  }
}

function getMissingIds<T>(
  ids: string[],
  resolved: Array<T | undefined>,
) {
  return ids.filter((_, index) => !resolved[index])
}

function getDisabledMcpServers(servers: McpServerConfig[]) {
  return servers.filter((server) => !server.enabled)
}

async function validateWorkflowDefinition(workflow: {
  kind: 'graph' | 'swarm'
  nodes: Array<{ id: string; agentId: string }>
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>
  startNodeId?: string
}) {
  const nodeIds = new Set<string>()
  const duplicateNodeIds = new Set<string>()
  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      duplicateNodeIds.add(node.id)
    }
    nodeIds.add(node.id)
  }
  if (duplicateNodeIds.size) {
    return `Duplicate workflow node ids: ${[...duplicateNodeIds].join(', ')}`
  }

  const missingAgents: string[] = []
  for (const node of workflow.nodes) {
    if (!(await platform.agents.get(node.agentId))) {
      missingAgents.push(node.agentId)
    }
  }
  if (missingAgents.length) {
    return `Unknown workflow node agents: ${[...new Set(missingAgents)].join(', ')}`
  }

  if (workflow.kind === 'graph') {
    if (!workflow.edges.length) {
      return 'Graph workflow requires at least one edge'
    }
    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        return 'Graph workflow edges must reference workflow node ids'
      }
    }
  }

  if (workflow.kind === 'swarm') {
    if (!workflow.startNodeId) {
      return 'Swarm workflow requires startNodeId'
    }
    if (!nodeIds.has(workflow.startNodeId)) {
      return 'Swarm workflow startNodeId must reference a workflow node id'
    }
  }

  return undefined
}

function ensureModelProviderUsable(
  agent: AgentConfig,
  modelProvider: ModelProviderConfig | undefined,
  toolCount: number,
) {
  if (agent.modelProviderId && !modelProvider) {
    return 'Model provider not found'
  }

  if (modelProvider && !modelProvider.enabled) {
    return 'Model provider is disabled'
  }

  if (modelProvider && modelProvider.type !== 'openai-compatible') {
    return 'Model provider type is not supported yet'
  }

  if (modelProvider && !getProviderApiKey(modelProvider)) {
    return 'Model provider API key is not configured'
  }

  if (modelProvider && toolCount > 0 && !modelProvider.capabilities.toolCalling) {
    return 'Model provider does not support tool calling'
  }

  return undefined
}

function extractBlocksText(blocks: ContentBlock[]) {
  return blocks.map((block) => (block.type === 'textBlock' ? block.text : '')).join('')
}

function truncateText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

async function createExperimentAgent(
  agent: AgentConfig,
  provider: ModelProviderConfig | undefined,
) {
  const assignedSkills = await skillRegistry.resolve(agent.skills)
  const skillContext = assignedSkills.length
    ? assignedSkills
        .map(
          (skill) => `## Skill: ${skill.name}

${skill.content}`,
        )
        .join('\n\n---\n\n')
    : ''
  const systemPrompt = skillContext
    ? `${agent.systemPrompt}

The following skills are enabled for this experiment agent.

${skillContext}`
    : agent.systemPrompt

  return new Agent({
    id: agent.id,
    name: agent.name,
    description: agent.systemPrompt.slice(0, 240),
    model: new OpenAIModel({
      api: 'chat',
      modelId: agent.modelId,
      apiKey: getProviderApiKey(provider) || 'missing-api-key',
      clientConfig: {
        baseURL: provider?.baseURL ?? agent.baseURL,
      },
    }),
    systemPrompt,
    tools: [],
    printer: false,
  })
}

async function resolveExperimentAgents(agentIds: string[]) {
  const agents = await Promise.all(agentIds.map((id) => platform.agents.get(id)))
  const missing = getMissingIds(agentIds, agents)
  if (missing.length) {
    throw new Error(`Unknown agents: ${missing.join(', ')}`)
  }

  const resolvedAgents = agents as AgentConfig[]
  const providers = await Promise.all(
    resolvedAgents.map((agent) =>
      agent.modelProviderId
        ? platform.modelProviders.getWithSecret(agent.modelProviderId)
        : undefined,
    ),
  )

  for (let index = 0; index < resolvedAgents.length; index += 1) {
    const error = ensureModelProviderUsable(resolvedAgents[index], providers[index], 0)
    if (error) {
      throw new Error(`${resolvedAgents[index].name}: ${error}`)
    }
  }

  return Promise.all(
    resolvedAgents.map((agent, index) => createExperimentAgent(agent, providers[index])),
  )
}

function serializeMultiAgentResult(result: {
  status: string
  content: ContentBlock[]
  results: Array<{
    nodeId: string
    status: string
    content: ContentBlock[]
    error?: Error
  }>
}) {
  return {
    status: result.status,
    output: extractBlocksText(result.content),
    nodeResults: result.results.map((node) => ({
      nodeId: node.nodeId,
      status: node.status,
      output: extractBlocksText(node.content),
      error: node.error?.message,
    })),
  }
}

function nowIso() {
  return new Date().toISOString()
}

function createMultiAgentNodeEvents(
  sessionId: string,
  runId: string,
  mode: MultiAgentMode,
  nodeResults: MultiAgentNodeResult[],
) {
  return nodeResults.map(
    (node): SessionEvent => ({
      type: 'multi_agent.node_result',
      sessionId,
      runId,
      mode,
      nodeId: node.nodeId,
      status: node.status,
      output: node.output,
      error: node.error,
      createdAt: nowIso(),
    }),
  )
}

function isMultiAgentRunFailure(result: MultiAgentSerializedResult) {
  return (
    result.status.toLowerCase().includes('fail') ||
    result.nodeResults.some((node) => node.status.toLowerCase().includes('fail') || node.error)
  )
}

function getMultiAgentFailureMessage(result: MultiAgentSerializedResult) {
  const nodeError = result.nodeResults.find((node) => node.error)
  return nodeError?.error ?? `Multi-agent run failed with status: ${result.status}`
}

async function appendMultiAgentEvents(sessionId: string, events: SessionEvent[]) {
  for (const event of events) {
    await appendEvent(sessionId, event)
  }
}

async function runMultiAgentSession({
  mode,
  input,
  sessionAgentId,
  nodeAgentIds,
  nodes,
  title,
  meta,
  createRunner,
}: {
  mode: MultiAgentMode
  input: string
  sessionAgentId: string
  nodeAgentIds: string[]
  nodes: Agent[]
  title?: string
  meta?: Record<string, unknown>
  createRunner: (nodes: Agent[]) => Promise<MultiAgentSerializedResult>
}) {
  const runId = randomUUID()
  const session = await platform.sessions.create({
    agentId: sessionAgentId,
    kind: mode,
    title: title ?? `${mode === 'graph' ? 'Graph' : 'Swarm'} run`,
    meta: {
      ...meta,
      runId,
      mode,
      nodeAgentIds,
    },
  })
  const events: SessionEvent[] = []
  const pushEvent = async (event: SessionEvent) => {
    events.push(event)
    await appendEvent(session.id, event)
  }

  await pushEvent({
    type: 'multi_agent.run_started',
    sessionId: session.id,
    runId,
    mode,
    input,
    nodeAgentIds: [...nodeAgentIds],
    createdAt: nowIso(),
  })
  await updatePlatformSessionStatus(session.id, 'running', events)

  try {
    const result = await createRunner(nodes)
    const nodeEvents = createMultiAgentNodeEvents(session.id, runId, mode, result.nodeResults)
    events.push(...nodeEvents)
    await appendMultiAgentEvents(session.id, nodeEvents)
    if (isMultiAgentRunFailure(result)) {
      const message = getMultiAgentFailureMessage(result)
      await pushEvent({
        type: 'multi_agent.run_failed',
        sessionId: session.id,
        runId,
        mode,
        message,
        createdAt: nowIso(),
      })
      const errorEvent: SessionEvent = {
        type: 'session.error',
        sessionId: session.id,
        message,
        createdAt: nowIso(),
      }
      events.push(errorEvent)
      await appendEvent(session.id, errorEvent)
      await updatePlatformSessionStatus(session.id, 'error', events)

      return {
        sessionId: session.id,
        runId,
        ...result,
        events,
      }
    }

    await pushEvent({
      type: 'multi_agent.run_completed',
      sessionId: session.id,
      runId,
      mode,
      status: result.status,
      output: result.output,
      createdAt: nowIso(),
    })
    await updatePlatformSessionStatus(session.id, 'idle', events)

    return {
      sessionId: session.id,
      runId,
      ...result,
      events,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await pushEvent({
      type: 'multi_agent.run_failed',
      sessionId: session.id,
      runId,
      mode,
      message,
      createdAt: nowIso(),
    })
    const errorEvent: SessionEvent = {
      type: 'session.error',
      sessionId: session.id,
      message,
      createdAt: nowIso(),
    }
    events.push(errorEvent)
    await appendEvent(session.id, errorEvent)
    await updatePlatformSessionStatus(session.id, 'error', events)

    return {
      sessionId: session.id,
      runId,
      status: 'error',
      output: '',
      nodeResults: [],
      events,
    }
  }
}

async function handlePlatformMultiAgent(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'POST' && pathname === '/v1/multi-agent/graph/runs') {
    const body = graphRunRequestSchema.parse(await readJson(req))
    const nodeIds = new Set(body.nodeAgentIds)
    for (const [source, target] of body.edges) {
      if (!nodeIds.has(source) || !nodeIds.has(target)) {
        sendJson(res, 400, { error: 'Graph edges must reference nodeAgentIds' })
        return true
      }
    }

    try {
      const nodes = await resolveExperimentAgents(body.nodeAgentIds)
      const result = await runMultiAgentSession({
        mode: 'graph',
        input: body.input,
        sessionAgentId: body.nodeAgentIds[0],
        nodeAgentIds: body.nodeAgentIds,
        nodes,
        createRunner: async (resolvedNodes) => {
          const graph = new Graph({
            nodes: resolvedNodes,
            edges: body.edges,
          })
          return serializeMultiAgentResult(await graph.invoke(body.input))
        },
      })
      sendJson(res, 200, result)
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  if (req.method === 'POST' && pathname === '/v1/multi-agent/swarm/runs') {
    const body = swarmRunRequestSchema.parse(await readJson(req))
    if (!body.nodeAgentIds.includes(body.startAgentId)) {
      sendJson(res, 400, { error: 'startAgentId must be included in nodeAgentIds' })
      return true
    }

    try {
      const nodes = await resolveExperimentAgents(body.nodeAgentIds)
      const result = await runMultiAgentSession({
        mode: 'swarm',
        input: body.input,
        sessionAgentId: body.startAgentId,
        nodeAgentIds: body.nodeAgentIds,
        nodes,
        createRunner: async (resolvedNodes) => {
          const swarm = new Swarm({
            nodes: resolvedNodes,
            start: body.startAgentId,
            maxSteps: body.maxSteps ?? 4,
          })
          return serializeMultiAgentResult(await swarm.invoke(body.input))
        },
      })
      sendJson(res, 200, result)
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  return false
}

async function handlePlatformSessions(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'POST' && pathname === '/v1/sessions') {
    const body = createPlatformSessionRequestSchema.parse(await readJson(req))
    const agent = await platform.agents.get(body.agentId)
    if (!agent) {
      sendJson(res, 404, { error: 'Agent not found' })
      return true
    }

    const session = await platform.sessions.create({ agentId: body.agentId })
    sendJson(res, 201, session)
    return true
  }

  if (req.method === 'GET' && pathname === '/v1/sessions') {
    sendJson(res, 200, await platform.sessions.list())
    return true
  }

  const sessionPath = getSessionSubpath(pathname)
  if (!sessionPath) {
    return false
  }

  const { sessionId, suffix } = sessionPath

  if (req.method === 'POST' && suffix === '/messages') {
    await handlePostPlatformSessionMessage(req, res, sessionId)
    return true
  }

  if (req.method === 'GET' && suffix === '/events') {
    await handleListPlatformSessionEvents(res, sessionId)
    return true
  }

  if (req.method === 'GET' && suffix === '/events/stream') {
    await handleStreamPlatformSessionEvents(req, res, sessionId)
    return true
  }

  if (suffix !== '') {
    return false
  }

  if (req.method === 'GET') {
    const session = await platform.sessions.get(sessionId)
    if (!session) {
      sendJson(res, 404, { error: 'Session not found' })
      return true
    }

    sendJson(res, 200, session)
    return true
  }

  if (req.method === 'DELETE') {
    const deleted = await platform.sessions.delete(sessionId)
    if (!deleted) {
      sendJson(res, 404, { error: 'Session not found' })
      return true
    }

    runtime.deleteSession(sessionId)
    eventStreamHub.closeSession(sessionId)
    platformSessionRuns.delete(sessionId)
    sendJson(res, 200, { deleted: true })
    return true
  }

  return false
}

function getSessionSubpath(pathname: string) {
  const prefix = '/v1/sessions/'
  if (!pathname.startsWith(prefix)) {
    return undefined
  }

  const rest = pathname.slice(prefix.length)
  const slashIndex = rest.indexOf('/')
  const rawSessionId = slashIndex === -1 ? rest : rest.slice(0, slashIndex)
  const suffix = slashIndex === -1 ? '' : rest.slice(slashIndex)

  if (!rawSessionId) {
    return undefined
  }

  return {
    sessionId: decodeURIComponent(rawSessionId),
    suffix,
  }
}

function appendEvent(sessionId: string, event: SessionEvent) {
  return platform.events.append(sessionId, createSessionEvent(event))
}

async function updatePlatformSessionStatus(
  sessionId: string,
  status: 'idle' | 'running' | 'error',
  turnEvents?: SessionEvent[],
) {
  const session = await platform.sessions.updateStatus(sessionId, status)
  if (session && turnEvents) {
    turnEvents.push({
      type: 'session.status_updated',
      sessionId,
      status,
      updatedAt: session.updatedAt,
    })
  }

  return session
}

async function failPlatformSessionPreflight(
  res: ServerResponse,
  sessionId: string,
  statusCode: number,
  message: string,
) {
  const errorEvent: SessionEvent = {
    type: 'session.error',
    sessionId,
    message,
    createdAt: new Date().toISOString(),
  }
  await appendEvent(sessionId, errorEvent)
  await updatePlatformSessionStatus(sessionId, 'error')
  sendJson(res, statusCode, { error: message })
}

async function handlePostPlatformSessionMessage(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
) {
  const body = postSessionMessageRequestSchema.parse(await readJson(req))
  const session = await platform.sessions.get(sessionId)
  if (!session) {
    sendJson(res, 404, { error: 'Session not found' })
    return
  }

  if (session.kind !== 'agent') {
    sendJson(res, 400, { error: 'Session does not accept direct messages' })
    return
  }

  const agent = await platform.agents.get(session.agentId)
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' })
    return
  }

  const runtimeConfig = await resolveAgentRuntimeConfig(agent)
  const missingMcpServers = getMissingIds(agent.mcpServers ?? [], runtimeConfig.mcpServers)
  if (missingMcpServers.length) {
    await failPlatformSessionPreflight(
      res,
      sessionId,
      400,
      `MCP server not found: ${missingMcpServers.join(', ')}`,
    )
    return
  }

  const missingAgentTools = getMissingIds(agent.agentTools ?? [], runtimeConfig.agentTools)
  if (missingAgentTools.length) {
    await failPlatformSessionPreflight(
      res,
      sessionId,
      400,
      `Agent tool not found: ${missingAgentTools.join(', ')}`,
    )
    return
  }

  const resolvedMcpServers = runtimeConfig.mcpServers as McpServerConfig[]
  const resolvedAgentTools = runtimeConfig.agentTools as AgentConfig[]
  const disabledMcpServers = getDisabledMcpServers(resolvedMcpServers)
  if (disabledMcpServers.length) {
    await failPlatformSessionPreflight(
      res,
      sessionId,
      400,
      `MCP server is disabled: ${disabledMcpServers.map((server) => server.name).join(', ')}`,
    )
    return
  }

  const modelProviderError = ensureModelProviderUsable(
    agent,
    runtimeConfig.modelProvider,
    agent.tools.length + resolvedMcpServers.length + resolvedAgentTools.length,
  )
  if (modelProviderError) {
    await failPlatformSessionPreflight(res, sessionId, 400, modelProviderError)
    return
  }

  if (session.status === 'running' || platformSessionRuns.has(sessionId)) {
    sendJson(res, 409, { error: 'Session is running' })
    return
  }

  const turnEvents: SessionEvent[] = []
  let answer = ''

  const run = (async () => {
    const userEvent: SessionEvent = {
      type: 'user.message',
      sessionId,
      text: body.message,
      createdAt: new Date().toISOString(),
    }

    const previousEvents = await platform.events.list(sessionId)
    turnEvents.push(userEvent)
    await appendEvent(sessionId, userEvent)
    const runningSession = await updatePlatformSessionStatus(sessionId, 'running', turnEvents)
    const events = await platform.events.list(sessionId)
    const defaultSkills = await skillRegistry.resolve(agent.skills)
    const triggeredSkills = await skillRegistry.resolveTriggered(body.message)
    const systemPrompt = composePlatformPrompt({
      agent,
      defaultSkills,
      triggeredSkills,
    })
    const modelContext = deriveModelContext(previousEvents)

    try {
      for await (const event of runtime.runMessage({
        agent,
        modelProvider: runtimeConfig.modelProvider,
        mcpServers: resolvedMcpServers,
        agentTools: resolvedAgentTools,
        session: runningSession ?? session,
        message: body.message,
        events,
        systemPrompt,
        modelContext,
      })) {
        turnEvents.push(event)
        if (event.type === 'agent.text_delta') {
          answer += event.text
        }
        await appendEvent(sessionId, event)
      }

      await updatePlatformSessionStatus(sessionId, 'idle', turnEvents)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorEvent: SessionEvent = {
        type: 'session.error',
        sessionId,
        message,
        createdAt: new Date().toISOString(),
      }

      turnEvents.push(errorEvent)
      await appendEvent(sessionId, errorEvent)
      await updatePlatformSessionStatus(sessionId, 'error', turnEvents)
      throw error
    }
  })()

  platformSessionRuns.set(sessionId, run)

  try {
    await run
  } finally {
    platformSessionRuns.delete(sessionId)
  }

  sendJson(res, 200, {
    sessionId,
    events: turnEvents,
    answer,
  })
}

async function handleListPlatformSessionEvents(res: ServerResponse, sessionId: string) {
  const session = await platform.sessions.get(sessionId)
  if (!session) {
    sendJson(res, 404, { error: 'Session not found' })
    return
  }

  sendJson(res, 200, await platform.events.list(sessionId))
}

async function handleStreamPlatformSessionEvents(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
) {
  const session = await platform.sessions.get(sessionId)
  if (!session) {
    sendJson(res, 404, { error: 'Session not found' })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  })

  const existingEvents = await platform.events.list(sessionId)
  const keepalive = setInterval(() => {
    sendSseComment(res, 'keepalive')
  }, 15_000)

  const unsubscribe = eventStreamHub.subscribe(sessionId, {
    write(event) {
      sendSse(res, 'session_event', event)
    },
    close() {
      res.end()
    },
  })

  for (const event of existingEvents) {
    sendSse(res, 'session_event', event)
  }

  sendSse(res, 'ready', { sessionId })

  req.on('close', () => {
    clearInterval(keepalive)
    unsubscribe()
  })
}

async function handlePlatformRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'GET' && pathname === '/v1/platform/status') {
    sendJson(res, 200, getPlatformStatus())
    return true
  }

  if (await handlePlatformModelProviders(req, res, pathname)) {
    return true
  }

  if (await handlePlatformMcpServers(req, res, pathname)) {
    return true
  }

  if (await handlePlatformRegistries(req, res, pathname)) {
    return true
  }

  if (await handlePlatformAgents(req, res, pathname)) {
    return true
  }

  if (await handleWorkflowTemplates(req, res, pathname)) {
    return true
  }

  if (await handlePlatformWorkflows(req, res, pathname)) {
    return true
  }

  if (await handlePlatformSessions(req, res, pathname)) {
    return true
  }

  if (await handlePlatformMultiAgent(req, res, pathname)) {
    return true
  }

  return false
}

function getPlatformStatus() {
  return {
    persistence: platform.mode,
    dataDir: platform.dataDir,
    database: platform.databasePath,
    sandbox: {
      type: 'local-workspace',
      workspaceRoot: sandbox.workspaceRoot,
    },
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (req.method === 'OPTIONS') {
      sendJson(res, 204, null)
      return
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        sessions: sessions.size,
        platform: getPlatformStatus(),
      })
      return
    }

    if (url.pathname.startsWith('/v1/')) {
      if (await handlePlatformRequest(req, res, url.pathname)) {
        return
      }

      sendJson(res, 404, { error: 'Not Found' })
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, url.pathname)
      return
    }

    if (req.method === 'POST' && url.pathname === '/chat') {
      await handleChat(req, res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/chat/stream') {
      await handleChatStream(req, res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/sessions') {
      await handleCreateSession(req, res)
      return
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/sessions/')) {
      const sessionId = decodeURIComponent(url.pathname.slice('/sessions/'.length))
      handleDeleteSession(sessionId, res)
      return
    }

    sendJson(res, 404, {
      error: 'Not Found',
      routes: [
        'GET /',
        'GET /health',
        'POST /chat',
        'POST /chat/stream',
        'POST /sessions',
        'DELETE /sessions/:id',
        'POST /v1/agents',
        'GET /v1/agents',
        'GET /v1/agents/:id',
        'PATCH /v1/agents/:id',
        'DELETE /v1/agents/:id',
        'POST /v1/sessions',
        'GET /v1/sessions',
        'GET /v1/sessions/:id',
        'DELETE /v1/sessions/:id',
        'POST /v1/sessions/:id/messages',
        'GET /v1/sessions/:id/events',
        'GET /v1/sessions/:id/events/stream',
      ],
    })
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      sendJson(res, 400, { error: 'Invalid request body' })
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    sendJson(res, 500, { error: message })
  }
}

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

createServer(handleRequest).listen(port, host, () => {
  console.log(`Agent HTTP server listening on http://${host}:${port}`)
  console.log(
    'Routes: GET /, GET /health, POST /chat, POST /chat/stream, POST /sessions, DELETE /sessions/:id, /v1/agents, /v1/sessions, /v1/model-providers, /v1/mcp-servers, /v1/workflows, /v1/multi-agent/*',
  )
})
