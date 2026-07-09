import type { SessionEvent } from '../platform/types'

export type RuntimeClientConfig = {
  baseUrl: string
  token: string
  modelId: string
  agentId?: string
  sessionSource?: string
}

export function createRuntimeClientConfig(env: NodeJS.ProcessEnv = process.env): RuntimeClientConfig {
  const baseUrl = env.STANDER_RUNTIME_URL?.replace(/\/+$/, '')
  if (!baseUrl) {
    throw new Error('STANDER_RUNTIME_URL is required')
  }

  const token = env.STANDER_RUNTIME_TOKEN
  if (!token) {
    throw new Error('STANDER_RUNTIME_TOKEN is required')
  }

  return {
    baseUrl,
    token,
    modelId: env.STANDER_MODEL || 'azure-gpt-o4-mini',
    agentId: env.STANDER_AGENT_ID,
    sessionSource: env.STANDER_SESSION_SOURCE,
  }
}

export function parseRuntimeEventLine(line: string): SessionEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  return JSON.parse(trimmed) as SessionEvent
}

export class StanderRuntimeClient {
  constructor(private readonly config: RuntimeClientConfig) {}

  async createSession(input: { cwd?: string }): Promise<{ sessionId: string }> {
    const response = await fetch(`${this.config.baseUrl}/v1/runtime/sessions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        cwd: input.cwd,
        modelId: this.config.modelId,
        agentId: this.config.agentId,
        source: this.config.sessionSource,
      }),
    })
    return this.readJsonResponse<{ sessionId: string }>(response)
  }

  async *prompt(sessionId: string, text: string, signal?: AbortSignal): AsyncIterable<SessionEvent> {
    const response = await fetch(
      `${this.config.baseUrl}/v1/runtime/sessions/${encodeURIComponent(sessionId)}/prompt`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ text }),
        signal,
      },
    )
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Runtime prompt failed (${response.status}): ${body}`)
    }
    if (!response.body) {
      throw new Error('Runtime prompt response did not include a body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        const event = parseRuntimeEventLine(line)
        if (event) yield event
        newlineIndex = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    const trailing = parseRuntimeEventLine(buffer)
    if (trailing) yield trailing
  }

  async cancel(sessionId: string): Promise<void> {
    const response = await fetch(
      `${this.config.baseUrl}/v1/runtime/sessions/${encodeURIComponent(sessionId)}/cancel`,
      {
        method: 'POST',
        headers: this.headers(),
      },
    )
    if (!response.ok && response.status !== 404) {
      const body = await response.text()
      throw new Error(`Runtime cancel failed (${response.status}): ${body}`)
    }
  }

  private headers() {
    return {
      authorization: `Bearer ${this.config.token}`,
      'content-type': 'application/json',
    }
  }

  private async readJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Runtime request failed (${response.status}): ${body}`)
    }
    return response.json() as Promise<T>
  }
}
