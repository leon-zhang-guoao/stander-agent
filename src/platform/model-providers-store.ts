import type {
  CreateModelProviderInput,
  ModelProviderConfig,
  UpdateModelProviderInput,
} from './types'

export interface ModelProviderStore {
  create(input: CreateModelProviderInput): Promise<ModelProviderConfig>
  list(): Promise<ModelProviderConfig[]>
  get(id: string): Promise<ModelProviderConfig | undefined>
  update(id: string, patch: UpdateModelProviderInput): Promise<ModelProviderConfig | undefined>
  delete(id: string): Promise<boolean>
}
