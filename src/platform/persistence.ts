import type { AgentStore } from './agents-store'
import type { EventLog } from './event-log'
import type { ModelProviderStore } from './model-providers-store'
import type { SessionStore } from './sessions-store'

export interface Persistence {
  agents: AgentStore
  modelProviders: ModelProviderStore
  sessions: SessionStore
  events: EventLog
}
