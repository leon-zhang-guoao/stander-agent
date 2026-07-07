import { Agent, SlidingWindowConversationManager } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import {
  defaultTools,
  getTextDelta,
  getToolUseName,
  isToolResultEvent,
} from '../agent'
import { withTriggeredSkills } from '../skills'
import type { AgentRuntime, RunMessageInput } from './runtime'
import type { AgentConfig, SessionEvent } from './types'

type RuntimeSessionState = {
  agent: Agent
  agentUpdatedAt: string
}

function nowIso() {
  return new Date().toISOString()
}

function createStrandsAgent(config: AgentConfig) {
  const conversationManager = new SlidingWindowConversationManager({
    windowSize: 40,
    shouldTruncateResults: true,
  })

  return new Agent({
    model: new OpenAIModel({
      api: 'chat',
      modelId: config.modelId,
      apiKey: process.env.OPENAI_API_KEY ?? 'dummy-key',
      clientConfig: {
        baseURL: config.baseURL,
      },
    }),
    systemPrompt: config.systemPrompt,
    tools: defaultTools,
    conversationManager,
    printer: false,
  })
}

export class StrandsRuntime implements AgentRuntime {
  private sessions = new Map<string, RuntimeSessionState>()

  deleteSession(sessionId: string) {
    this.sessions.delete(sessionId)
  }

  private getSessionAgent(agentConfig: AgentConfig, sessionId: string) {
    const existing = this.sessions.get(sessionId)
    if (existing?.agentUpdatedAt === agentConfig.updatedAt) {
      return existing.agent
    }

    const agent = createStrandsAgent(agentConfig)
    this.sessions.set(sessionId, {
      agent,
      agentUpdatedAt: agentConfig.updatedAt,
    })

    return agent
  }

  async *runMessage(input: RunMessageInput): AsyncIterable<SessionEvent> {
    const agent = this.getSessionAgent(input.agent, input.session.id)
    const message = await withTriggeredSkills(input.message)
    const stream = agent.stream(message, { cancelSignal: input.signal })
    let answer = ''

    for await (const event of stream) {
      const text = getTextDelta(event)
      const toolName = getToolUseName(event)

      if (text) {
        answer += text
        yield {
          type: 'agent.text_delta',
          sessionId: input.session.id,
          text,
          createdAt: nowIso(),
        }
      } else if (toolName) {
        yield {
          type: 'agent.tool_use',
          sessionId: input.session.id,
          name: toolName,
          createdAt: nowIso(),
        }
      } else if (isToolResultEvent(event)) {
        yield {
          type: 'agent.tool_result',
          sessionId: input.session.id,
          createdAt: nowIso(),
        }
      }
    }

    if (answer) {
      yield {
        type: 'agent.message',
        sessionId: input.session.id,
        text: answer,
        createdAt: nowIso(),
      }
    }
  }
}
