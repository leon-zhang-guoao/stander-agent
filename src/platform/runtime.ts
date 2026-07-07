import type {
  AgentConfig,
  McpServerConfig,
  ModelProviderConfig,
  SessionEvent,
  SessionMeta,
} from './types'

export type RunMessageInput = {
  agent: AgentConfig
  modelProvider?: ModelProviderConfig
  mcpServers?: McpServerConfig[]
  agentTools?: AgentConfig[]
  session: SessionMeta
  message: string
  events: SessionEvent[]
  signal?: AbortSignal
}

export interface AgentRuntime {
  runMessage(input: RunMessageInput): AsyncIterable<SessionEvent>
  deleteSession?(sessionId: string): void
}
