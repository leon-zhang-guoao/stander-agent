import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AgentRuntime } from '../platform/runtime'
import type { AgentConfig, SessionMeta } from '../platform/types'
import type { RuntimeCreateSessionRequest, RuntimePromptRequest } from './types'

type RuntimeServiceSession = {
  id: string
  cwd: string
  modelId: string
  createdAt: string
  abortController?: AbortController
}

export type StanderRuntimeServiceOptions = {
  runtime: AgentRuntime
  token: string
  modelId: string
  host?: string
  port?: number
}

function nowIso() {
  return new Date().toISOString()
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) {
    res.end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) {
    return {} as T
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) {
    return {} as T
  }
  return JSON.parse(text) as T
}

function isAuthorized(req: IncomingMessage, token: string) {
  return req.headers.authorization === `Bearer ${token}`
}

function createRuntimeAgent(modelId: string): AgentConfig {
  const timestamp = nowIso()
  return {
    id: 'stander-runtime-agent',
    name: 'Stander Runtime Agent',
    modelId,
    baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    systemPrompt: process.env.STANDER_SYSTEM_PROMPT ?? 'You are Stander Agent.',
    tools: [],
    skills: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function toSessionMeta(session: RuntimeServiceSession): SessionMeta {
  return {
    id: session.id,
    agentId: 'stander-runtime-agent',
    kind: 'agent',
    status: 'running',
    createdAt: session.createdAt,
    updatedAt: nowIso(),
  }
}

function sessionIdFromMatch(match: RegExpMatchArray) {
  return decodeURIComponent(match[1] ?? '')
}

export function startStanderRuntimeService(options: StanderRuntimeServiceOptions): Server {
  const sessions = new Map<string, RuntimeServiceSession>()
  const token = options.token

  const server = createServer(async (req, res) => {
    try {
      if (!isAuthorized(req, token)) {
        sendJson(res, 401, { error: 'Unauthorized' })
        return
      }

      const url = new URL(req.url ?? '/', 'http://localhost')

      if (req.method === 'POST' && url.pathname === '/v1/runtime/sessions') {
        const body = await readJson<RuntimeCreateSessionRequest>(req)
        const session: RuntimeServiceSession = {
          id: `stander-runtime-${randomUUID()}`,
          cwd: body.cwd ?? process.cwd(),
          modelId: body.modelId ?? options.modelId,
          createdAt: nowIso(),
        }
        sessions.set(session.id, session)
        sendJson(res, 200, { sessionId: session.id })
        return
      }

      const promptMatch = url.pathname.match(/^\/v1\/runtime\/sessions\/([^/]+)\/prompt$/)
      if (req.method === 'POST' && promptMatch) {
        const session = sessions.get(sessionIdFromMatch(promptMatch))
        if (!session) {
          sendJson(res, 404, { error: 'Session not found' })
          return
        }

        const body = await readJson<RuntimePromptRequest>(req)
        if (!body.text || typeof body.text !== 'string') {
          sendJson(res, 400, { error: 'Prompt text is required' })
          return
        }

        const abortController = new AbortController()
        session.abortController = abortController
        res.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })

        try {
          const runtimeEvents = options.runtime.runMessage({
            agent: createRuntimeAgent(session.modelId),
            session: toSessionMeta(session),
            message: body.text,
            events: [],
            signal: abortController.signal,
          })
          for await (const event of runtimeEvents) {
            res.write(`${JSON.stringify(event)}\n`)
          }
        } finally {
          session.abortController = undefined
          res.end()
        }
        return
      }

      const cancelMatch = url.pathname.match(/^\/v1\/runtime\/sessions\/([^/]+)\/cancel$/)
      if (req.method === 'POST' && cancelMatch) {
        const session = sessions.get(sessionIdFromMatch(cancelMatch))
        if (!session) {
          sendJson(res, 404, { error: 'Session not found' })
          return
        }
        session.abortController?.abort()
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  server.listen(options.port ?? 8787, options.host ?? '0.0.0.0')
  return server
}
