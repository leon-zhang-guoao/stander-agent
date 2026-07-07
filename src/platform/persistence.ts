import type { AgentStore } from './agents-store'
import type { EventLog } from './event-log'
import type { McpServerStore } from './mcp-servers-store'
import type { ModelProviderStore } from './model-providers-store'
import type { SessionStore } from './sessions-store'

export interface Persistence {
  agents: AgentStore
  modelProviders: ModelProviderStore
  mcpServers: McpServerStore
  sessions: SessionStore
  events: EventLog
}
