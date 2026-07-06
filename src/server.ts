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

const sessions = new Map<string, SessionState>()
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
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function sendSse(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
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

  const answer = await runExclusive(session, async () => {
    let text = ''
    const tools: string[] = []
    const stream = await session.agent.stream(body.message)

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

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  })

  await runExclusive(session, async () => {
    sendSse(res, 'session', { sessionId })
    const stream = await session.agent.stream(body.message)

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
    'Routes: GET /, GET /health, POST /chat, POST /chat/stream, POST /sessions, DELETE /sessions/:id',
  )
})
