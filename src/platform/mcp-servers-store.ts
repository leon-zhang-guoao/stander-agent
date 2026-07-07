import type {
  CreateMcpServerInput,
  McpServerConfig,
  UpdateMcpServerInput,
} from './types'

export interface McpServerStore {
  create(input: CreateMcpServerInput): Promise<McpServerConfig>
  list(): Promise<McpServerConfig[]>
  get(id: string): Promise<McpServerConfig | undefined>
  update(id: string, patch: UpdateMcpServerInput): Promise<McpServerConfig | undefined>
  delete(id: string): Promise<boolean>
}
