import type { AgentConfig, CreateAgentConfigInput, UpdateAgentConfigInput } from './types'

export interface AgentStore {
  create(input: CreateAgentConfigInput): Promise<AgentConfig>
  list(): Promise<AgentConfig[]>
  get(id: string): Promise<AgentConfig | undefined>
  update(id: string, patch: UpdateAgentConfigInput): Promise<AgentConfig | undefined>
  delete(id: string): Promise<boolean>
}
