import type { AgentStore } from './agents-store'
import type { EventLog } from './event-log'
import type { McpServerStore } from './mcp-servers-store'
import type { ModelProviderStore } from './model-providers-store'
import type { SecretStore } from './secret-store'
import type { SessionStore } from './sessions-store'
import type { WorkflowStore } from './workflows-store'

export interface Persistence {
  mode: 'memory' | 'sqlite'
  dataDir?: string
  databasePath?: string
  agents: AgentStore
  modelProviders: ModelProviderStore
  mcpServers: McpServerStore
  sessions: SessionStore
  events: EventLog
  secrets: SecretStore
  workflows: WorkflowStore
}
