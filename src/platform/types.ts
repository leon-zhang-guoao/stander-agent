export type AgentConfig = {
  id: string
  name: string
  modelId: string
  baseURL: string
  systemPrompt: string
  tools: string[]
  skills: string[]
  mcpServers?: string[]
  createdAt: string
  updatedAt: string
}

export type CreateAgentConfigInput = {
  name: string
  modelId: string
  baseURL: string
  systemPrompt: string
  tools: string[]
  skills: string[]
  mcpServers?: string[]
}

export type UpdateAgentConfigInput = Partial<CreateAgentConfigInput>

export type SessionStatus = 'idle' | 'running' | 'error'

export type SessionMeta = {
  id: string
  agentId: string
  status: SessionStatus
  createdAt: string
  updatedAt: string
}

export type SessionEvent =
  | { type: 'session.created'; sessionId: string; agentId: string; createdAt: string }
  | { type: 'session.deleted'; sessionId: string; deletedAt: string }
  | {
      type: 'session.status_updated'
      sessionId: string
      status: SessionStatus
      updatedAt: string
    }
  | { type: 'session.error'; sessionId: string; message: string; createdAt: string }
