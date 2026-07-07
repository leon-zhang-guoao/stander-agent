export type AgentConfig = {
  id: string
  name: string
  modelProviderId?: string
  modelId: string
  baseURL: string
  systemPrompt: string
  tools: string[]
  skills: string[]
  mcpServers?: string[]
  agentTools?: string[]
  createdAt: string
  updatedAt: string
}

export type CreateAgentConfigInput = {
  name: string
  modelProviderId?: string
  modelId: string
  baseURL: string
  systemPrompt: string
  tools: string[]
  skills: string[]
  mcpServers?: string[]
  agentTools?: string[]
}

export type UpdateAgentConfigInput = Partial<CreateAgentConfigInput>

export type ModelProviderType =
  | 'openai-compatible'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'openrouter'
  | 'custom'

export type ModelProviderCapabilities = {
  streaming: boolean
  toolCalling: boolean
  vision: boolean
  jsonMode: boolean
  reasoning: boolean
}

export type ModelProviderConfig = {
  id: string
  name: string
  type: ModelProviderType
  baseURL: string
  apiKey?: string
  apiKeyRef?: string
  defaultModelId?: string
  availableModels?: string[]
  capabilities: ModelProviderCapabilities
  enabled: boolean
  hasApiKey?: boolean
  createdAt: string
  updatedAt: string
}

export type CreateModelProviderInput = {
  name: string
  type: ModelProviderType
  baseURL: string
  apiKey?: string
  apiKeyRef?: string
  defaultModelId?: string
  availableModels?: string[]
  capabilities: ModelProviderCapabilities
  enabled?: boolean
}

export type UpdateModelProviderInput = Partial<CreateModelProviderInput>

export type McpServerTransport = 'stdio' | 'streamable-http'

export type McpServerConfig = {
  id: string
  name: string
  transport: McpServerTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type CreateMcpServerInput = {
  name: string
  transport: McpServerTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
}

export type UpdateMcpServerInput = Partial<CreateMcpServerInput>

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
  | { type: 'user.message'; sessionId: string; text: string; createdAt: string }
  | { type: 'agent.text_delta'; sessionId: string; text: string; createdAt: string }
  | { type: 'agent.message'; sessionId: string; text: string; createdAt: string }
  | { type: 'agent.tool_use'; sessionId: string; name: string; createdAt: string }
  | { type: 'agent.tool_result'; sessionId: string; name?: string; createdAt: string }
