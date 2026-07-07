import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  createAgent,
  getTextDelta,
  getToolUseName,
  isToolResultEvent,
} from './agent'
import { EventStreamHub } from './platform/event-stream-hub'
import { createInMemoryPersistence } from './platform/in-memory-persistence'
import {
  createAgentRequestSchema,
  createPlatformSessionRequestSchema,
  patchAgentRequestSchema,
  postSessionMessageRequestSchema,
} from './platform/schemas'
import { StrandsRuntime } from './platform/strands-runtime'
import type { SessionEvent } from './platform/types'
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

const sessions = new Map<string, SessionState>()
const eventStreamHub = new EventStreamHub()
const platform = createInMemoryPersistence({
  onEvent: (sessionId, event) => eventStreamHub.publish(sessionId, event),
})
const runtime = new StrandsRuntime()
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

async function handlePlatformAgents(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'POST' && pathname === '/v1/agents') {
    const body = createAgentRequestSchema.parse(await readJson(req))
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

function createSessionEvent(event: SessionEvent) {
  return event
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

  const agent = await platform.agents.get(session.agentId)
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' })
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

    turnEvents.push(userEvent)
    await appendEvent(sessionId, userEvent)
    const runningSession = await updatePlatformSessionStatus(sessionId, 'running', turnEvents)

    try {
      for await (const event of runtime.runMessage({
        agent,
        session: runningSession ?? session,
        message: body.message,
        events: await platform.events.list(sessionId),
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
  if (await handlePlatformAgents(req, res, pathname)) {
    return true
  }

  if (await handlePlatformSessions(req, res, pathname)) {
    return true
  }

  return false
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
    'Routes: GET /, GET /health, POST /chat, POST /chat/stream, POST /sessions, DELETE /sessions/:id, /v1/agents, /v1/sessions',
  )
})
