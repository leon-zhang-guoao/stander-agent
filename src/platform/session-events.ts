import { randomUUID } from 'node:crypto'
import type { SessionEvent } from './types'

export function createSessionEvent(event: SessionEvent) {
  event.eventId ??= randomUUID()
  return event
}

