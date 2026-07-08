import type { SessionEvent } from './types'

export type ModelContextMessage = {
  role: 'user' | 'assistant'
  text: string
}

export type ModelContext = {
  messages: ModelContextMessage[]
}

function compactedSummaryText(summary: string) {
  return `<conversation-summary>\n${summary}\n</conversation-summary>`
}

export function deriveModelContext(events: SessionEvent[]): ModelContext {
  let lastCompactionIndex = -1
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === 'agent.thread_context_compacted') {
      lastCompactionIndex = index
      break
    }
  }
  const messages: ModelContextMessage[] = []

  if (lastCompactionIndex >= 0) {
    const compactionEvent = events[lastCompactionIndex]
    if (compactionEvent?.type === 'agent.thread_context_compacted') {
      messages.push({
        role: 'assistant',
        text: compactedSummaryText(compactionEvent.summary),
      })
    }
  }

  const startIndex = lastCompactionIndex >= 0 ? lastCompactionIndex + 1 : 0
  for (const event of events.slice(startIndex)) {
    if (event.type === 'user.message') {
      messages.push({ role: 'user', text: event.text })
    } else if (event.type === 'agent.message') {
      messages.push({ role: 'assistant', text: event.text })
    }
  }

  return { messages }
}
