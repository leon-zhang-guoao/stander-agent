import type { SessionEvent } from './types'

type Subscriber = {
  write(event: SessionEvent): void
  close(): void
}

export class EventStreamHub {
  private subscribers = new Map<string, Set<Subscriber>>()

  subscribe(sessionId: string, subscriber: Subscriber) {
    const sessionSubscribers = this.subscribers.get(sessionId) ?? new Set<Subscriber>()
    sessionSubscribers.add(subscriber)
    this.subscribers.set(sessionId, sessionSubscribers)

    return () => {
      sessionSubscribers.delete(subscriber)
      if (!sessionSubscribers.size) {
        this.subscribers.delete(sessionId)
      }
    }
  }

  publish(sessionId: string, event: SessionEvent) {
    for (const subscriber of this.subscribers.get(sessionId) ?? []) {
      subscriber.write(event)
    }
  }

  closeSession(sessionId: string) {
    const sessionSubscribers = this.subscribers.get(sessionId)
    if (!sessionSubscribers) {
      return
    }

    for (const subscriber of sessionSubscribers) {
      subscriber.close()
    }

    this.subscribers.delete(sessionId)
  }
}
