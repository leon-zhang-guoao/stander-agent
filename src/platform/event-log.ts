import type { SessionEvent } from './types'

export interface EventLog {
  append(sessionId: string, event: SessionEvent): Promise<void>
  list(sessionId: string): Promise<SessionEvent[]>
}
