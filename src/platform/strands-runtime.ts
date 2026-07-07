import { Agent, SlidingWindowConversationManager } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import {
  getTextDelta,
  getToolUseName,
  isToolResultEvent,
} from '../agent'
import type { SkillRegistry } from './skill-registry'
import type { AgentRuntime, RunMessageInput } from './runtime'
import type { AgentConfig, ModelProviderConfig, SessionEvent } from './types'
import type { ToolRegistry } from './tool-registry'

type RuntimeSessionState = {
  agent: Agent
  cacheKey: string
}

function nowIso() {
  return new Date().toISOString()
}

function getProviderBaseURL(config: AgentConfig, provider?: ModelProviderConfig) {
  return provider?.baseURL ?? config.baseURL
}

function getProviderApiKey(provider?: ModelProviderConfig) {
  return provider?.apiKey ?? process.env.OPENAI_API_KEY ?? 'dummy-key'
}

function getRuntimeCacheKey(config: AgentConfig, provider?: ModelProviderConfig) {
  return [
    config.updatedAt,
    provider?.id ?? '',
    provider?.updatedAt ?? '',
    provider?.apiKey ? 'provider-key' : '',
    config.tools.join(','),
    config.skills.join(','),
  ].join('|')
}

function renderSkillContext(skills: { name: string; content: string }[]) {
  if (!skills.length) {
    return ''
  }

  return skills
    .map(
      (skill) => `## Skill: ${skill.name}

${skill.content}`,
    )
    .join('\n\n---\n\n')
}

async function createStrandsAgent(
  config: AgentConfig,
  provider: ModelProviderConfig | undefined,
  toolRegistry: ToolRegistry,
  skillRegistry: SkillRegistry,
) {
  const conversationManager = new SlidingWindowConversationManager({
    windowSize: 40,
    shouldTruncateResults: true,
  })
  const assignedSkills = await skillRegistry.resolve(config.skills)
  const skillContext = renderSkillContext(assignedSkills)
  const systemPrompt = skillContext
    ? `${config.systemPrompt}

以下是这个 agent 默认启用的 skills，请持续遵循这些 skill 的说明。

${skillContext}`
    : config.systemPrompt

  return new Agent({
    model: new OpenAIModel({
      api: 'chat',
      modelId: config.modelId,
      apiKey: getProviderApiKey(provider),
      clientConfig: {
        baseURL: getProviderBaseURL(config, provider),
      },
    }),
    systemPrompt,
    tools: toolRegistry.resolve(config.tools),
    conversationManager,
    printer: false,
  })
}

export class StrandsRuntime implements AgentRuntime {
  private sessions = new Map<string, RuntimeSessionState>()

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
  ) {}

  deleteSession(sessionId: string) {
    this.sessions.delete(sessionId)
  }

  private async getSessionAgent(
    agentConfig: AgentConfig,
    provider: ModelProviderConfig | undefined,
    sessionId: string,
  ) {
    const cacheKey = getRuntimeCacheKey(agentConfig, provider)
    const existing = this.sessions.get(sessionId)
    if (existing?.cacheKey === cacheKey) {
      return existing.agent
    }

    const agent = await createStrandsAgent(
      agentConfig,
      provider,
      this.toolRegistry,
      this.skillRegistry,
    )
    this.sessions.set(sessionId, {
      agent,
      cacheKey,
    })

    return agent
  }

  async *runMessage(input: RunMessageInput): AsyncIterable<SessionEvent> {
    const agent = await this.getSessionAgent(input.agent, input.modelProvider, input.session.id)
    const triggeredSkills = await this.skillRegistry.resolveTriggered(input.message)
    const triggeredContext = renderSkillContext(triggeredSkills)
    const message = triggeredContext
      ? `以下是本轮用户显式触发的 skill，请优先遵循这些 skill 的说明完成任务。

${triggeredContext}

---

用户原始消息:
${input.message}`
      : input.message
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
