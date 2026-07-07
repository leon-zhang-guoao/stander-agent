import type { AgentConfig, SessionEvent, SessionMeta } from './types'

export type RunMessageInput = {
  agent: AgentConfig
  session: SessionMeta
  message: string
  events: SessionEvent[]
  signal?: AbortSignal
}

export interface AgentRuntime {
  runMessage(input: RunMessageInput): AsyncIterable<SessionEvent>
  deleteSession?(sessionId: string): void
}
