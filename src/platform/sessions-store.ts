import type { CreateSessionInput, SessionMeta, SessionStatus } from './types'

export interface SessionStore {
  create(input: CreateSessionInput): Promise<SessionMeta>
  list(): Promise<SessionMeta[]>
  get(id: string): Promise<SessionMeta | undefined>
  updateStatus(id: string, status: SessionStatus): Promise<SessionMeta | undefined>
  delete(id: string): Promise<boolean>
}
