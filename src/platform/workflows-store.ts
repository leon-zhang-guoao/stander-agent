import type { CreateWorkflowInput, UpdateWorkflowInput, WorkflowDefinition } from './types'

export interface WorkflowStore {
  create(input: CreateWorkflowInput): Promise<WorkflowDefinition>
  list(): Promise<WorkflowDefinition[]>
  get(id: string): Promise<WorkflowDefinition | undefined>
  update(id: string, patch: UpdateWorkflowInput): Promise<WorkflowDefinition | undefined>
  delete(id: string): Promise<boolean>
}
