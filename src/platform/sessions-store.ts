import type { SessionMeta, SessionStatus } from './types'

export interface SessionStore {
  create(input: { agentId: string }): Promise<SessionMeta>
  list(): Promise<SessionMeta[]>
  get(id: string): Promise<SessionMeta | undefined>
  updateStatus(id: string, status: SessionStatus): Promise<SessionMeta | undefined>
  delete(id: string): Promise<boolean>
}
