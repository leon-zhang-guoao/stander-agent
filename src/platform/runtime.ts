import type {
  AgentConfig,
  McpServerConfig,
  ModelProviderConfig,
  SessionEvent,
  SessionMeta,
} from './types'
import type { ModelContext } from './context-projection'

export type RunMessageInput = {
  agent: AgentConfig
  modelProvider?: ModelProviderConfig
  mcpServers?: McpServerConfig[]
  agentTools?: AgentConfig[]
  session: SessionMeta
  message: string
  events: SessionEvent[]
  systemPrompt?: string
  modelContext?: ModelContext
  signal?: AbortSignal
}

export interface AgentRuntime {
  runMessage(input: RunMessageInput): AsyncIterable<SessionEvent>
  deleteSession?(sessionId: string): void
}
