import type { SessionEvent } from '../platform/types'

export type RuntimeCreateSessionRequest = {
  cwd?: string
  modelId?: string
}

export type RuntimeCreateSessionResponse = {
  sessionId: string
}

export type RuntimePromptRequest = {
  text: string
}

export type RuntimeErrorResponse = {
  error: string
}

export type RuntimePromptEvent = SessionEvent
