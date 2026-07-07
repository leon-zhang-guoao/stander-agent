import type { AgentStore } from './agents-store'
import type { EventLog } from './event-log'
import type { SessionStore } from './sessions-store'

export interface Persistence {
  agents: AgentStore
  sessions: SessionStore
  events: EventLog
}
