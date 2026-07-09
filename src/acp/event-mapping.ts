import type { SessionEvent } from '../platform/types'

export type AcpSessionUpdate =
  | {
      sessionUpdate: 'agent_message_chunk'
      content: { type: 'text'; text: string }
    }
  | {
      sessionUpdate: 'agent_message'
      content: { type: 'text'; text: string }
    }
  | {
      sessionUpdate: 'tool_call_update'
      toolCallId: string
      title: string
      rawInput?: unknown
      rawOutput?: unknown
      status: 'pending' | 'completed' | 'failed'
      kind: 'tool'
    }

export function mapSessionEventToAcpUpdate(event: SessionEvent): AcpSessionUpdate | null {
  switch (event.type) {
    case 'agent.text_delta':
      return {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: event.text },
      }

    case 'agent.tool_use':
      return {
        sessionUpdate: 'tool_call_update',
        toolCallId: event.toolUseId ?? `${event.name}-${event.createdAt}`,
        title: event.name,
        rawInput: event.input,
        status: 'pending',
        kind: 'tool',
      }

    case 'agent.tool_result': {
      const title = event.name ?? 'tool'
      const failed = event.error !== undefined

      return {
        sessionUpdate: 'tool_call_update',
        toolCallId: event.toolUseId ?? `${title}-${event.createdAt}`,
        title,
        rawOutput: failed ? { error: event.error } : event.result,
        status: failed ? 'failed' : 'completed',
        kind: 'tool',
      }
    }

    case 'session.error':
      return {
        sessionUpdate: 'agent_message',
        content: { type: 'text', text: event.message },
      }

    default:
      return null
  }
}

export function createAcpSessionUpdateNotification(sessionId: string, update: AcpSessionUpdate) {
  return {
    jsonrpc: '2.0' as const,
    method: 'session/update',
    params: { sessionId, update },
  }
}
