import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AgentRuntime } from '../platform/runtime'
import type { AgentConfig, SessionMeta } from '../platform/types'
import type { RuntimeCreateSessionRequest, RuntimePromptRequest } from './types'

const MAX_REQUEST_BODY_BYTES = 1024 * 1024

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

class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
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
  let totalBytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      throw new RequestBodyError('Request body too large', 400)
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) {
    return {} as T
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) {
    return {} as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new RequestBodyError('Invalid JSON body', 400)
  }
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidCreateSessionRequest(body: unknown): body is RuntimeCreateSessionRequest {
  if (!isObjectRecord(body)) {
    return false
  }
  return (
    (body.cwd === undefined || typeof body.cwd === 'string') &&
    (body.modelId === undefined || typeof body.modelId === 'string')
  )
}

function getPromptText(body: unknown) {
  if (!isObjectRecord(body) || typeof body.text !== 'string' || body.text.trim().length === 0) {
    return undefined
  }
  return body.text
}

function writeNdjsonHeader(res: ServerResponse) {
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
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
        const body = await readJson<unknown>(req)
        if (!isValidCreateSessionRequest(body)) {
          sendJson(res, 400, { error: 'Invalid session request' })
          return
        }
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

        if (session.abortController) {
          sendJson(res, 409, { error: 'Prompt already running' })
          return
        }

        const body = await readJson<RuntimePromptRequest>(req)
        const promptText = getPromptText(body)
        if (!promptText) {
          sendJson(res, 400, { error: 'Prompt text is required' })
          return
        }

        const abortController = new AbortController()
        session.abortController = abortController
        let completed = false
        let streamingStarted = false
        const abortCurrentPrompt = () => {
          if (!completed) {
            abortController.abort()
          }
        }
        req.on('close', abortCurrentPrompt)
        res.on('close', abortCurrentPrompt)

        try {
          const runtimeEvents = options.runtime.runMessage({
            agent: createRuntimeAgent(session.modelId),
            session: toSessionMeta(session),
            message: promptText,
            events: [],
            signal: abortController.signal,
          })
          for await (const event of runtimeEvents) {
            if (!streamingStarted) {
              writeNdjsonHeader(res)
              streamingStarted = true
            }
            res.write(`${JSON.stringify(event)}\n`)
          }
        } catch (error) {
          if (!streamingStarted && !res.headersSent) {
            sendJson(res, 500, { error: errorMessage(error) })
            return
          }
          if (!res.writableEnded) {
            if (!streamingStarted) {
              writeNdjsonHeader(res)
              streamingStarted = true
            }
            res.write(
              `${JSON.stringify({
                type: 'session.error',
                sessionId: session.id,
                message: errorMessage(error),
                createdAt: nowIso(),
              })}\n`,
            )
          }
        } finally {
          completed = true
          req.off('close', abortCurrentPrompt)
          res.off('close', abortCurrentPrompt)
          if (session.abortController === abortController) {
            session.abortController = undefined
          }
          if (!res.writableEnded) {
            res.end()
          }
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
      if (error instanceof RequestBodyError) {
        sendJson(res, error.status, { error: error.message })
        return
      }
      sendJson(res, 500, { error: errorMessage(error) })
    }
  })

  server.listen(options.port ?? 8787, options.host ?? '0.0.0.0')
  return server
}
