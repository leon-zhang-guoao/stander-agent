import { Agent, AgentResult, SlidingWindowConversationManager, tool, type Tool } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import { z } from 'zod'
import {
  getTextDelta,
  getToolUseName,
  isToolResultEvent,
} from '../agent'
import { createMcpClient } from './mcp-runtime'
import type { Persistence } from './persistence'
import type { SkillRegistry } from './skill-registry'
import type { AgentRuntime, RunMessageInput } from './runtime'
import type { AgentConfig, McpServerConfig, ModelProviderConfig, SessionEvent } from './types'
import type { ToolRegistry } from './tool-registry'

type RuntimeSessionState = {
  agent: Agent
  cacheKey: string
  mcpClients: ReturnType<typeof createMcpClient>[]
}

function nowIso() {
  return new Date().toISOString()
}

function getProviderBaseURL(config: AgentConfig, provider?: ModelProviderConfig) {
  return provider?.baseURL ?? config.baseURL
}

function getProviderApiKey(provider?: ModelProviderConfig) {
  if (provider?.apiKey) {
    return provider.apiKey
  }
  if (provider?.apiKeyRef) {
    return process.env[provider.apiKeyRef] ?? process.env.OPENAI_API_KEY ?? ''
  }
  return process.env.OPENAI_API_KEY ?? ''
}

function getRuntimeCacheKey(
  config: AgentConfig,
  provider: ModelProviderConfig | undefined,
  mcpServers: McpServerConfig[],
  agentTools: AgentConfig[],
) {
  return [
    config.updatedAt,
    provider?.id ?? '',
    provider?.updatedAt ?? '',
    provider?.apiKey ? 'provider-key' : '',
    config.tools.join(','),
    config.skills.join(','),
    mcpServers.map((server) => `${server.id}:${server.updatedAt}`).join(','),
    agentTools.map((agent) => `${agent.id}:${agent.updatedAt}`).join(','),
  ].join('|')
}

function extractResultText(result: AgentResult) {
  return result.lastMessage.content
    .map((block) => (block.type === 'textBlock' ? block.text : ''))
    .join('')
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
  mcpServers: McpServerConfig[],
  agentTools: AgentConfig[],
  toolRegistry: ToolRegistry,
  skillRegistry: SkillRegistry,
  persistence: Persistence,
  allowAgentTools = true,
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

  const mcpClients = mcpServers.map(createMcpClient)
  try {
    await Promise.all(mcpClients.map((client) => client.listTools()))
  } catch (error) {
    await disconnectMcpClients(mcpClients)
    throw error
  }
  const childAgentTools = allowAgentTools
    ? createAgentTools(agentTools, toolRegistry, skillRegistry, persistence)
    : []

  const agent = new Agent({
    model: new OpenAIModel({
      api: 'chat',
      modelId: config.modelId,
      apiKey: getProviderApiKey(provider) || 'missing-api-key',
      clientConfig: {
        baseURL: getProviderBaseURL(config, provider),
      },
    }),
    systemPrompt,
    tools: [...toolRegistry.resolve(config.tools), ...mcpClients, ...childAgentTools],
    conversationManager,
    printer: false,
  })

  return { agent, mcpClients }
}

function createAgentTools(
  agentTools: AgentConfig[],
  toolRegistry: ToolRegistry,
  skillRegistry: SkillRegistry,
  persistence: Persistence,
): Tool[] {
  return agentTools.map((childAgent) =>
    tool({
      name: `call_agent_${childAgent.id.replace(/-/g, '')}`,
      description: `Call child agent "${childAgent.name}".`,
      inputSchema: z.object({
        query: z.string().min(1).describe('Message to send to the child agent'),
      }),
      callback: async ({ query }) => {
        const provider = childAgent.modelProviderId
          ? await persistence.modelProviders.getWithSecret(childAgent.modelProviderId)
          : undefined
        const childMcpServers = await resolveEnabledMcpServers(childAgent, persistence)
        const { agent, mcpClients } = await createStrandsAgent(
          childAgent,
          provider,
          childMcpServers,
          [],
          toolRegistry,
          skillRegistry,
          persistence,
          false,
        )
        try {
          const result = await agent.invoke(query)
          return extractResultText(result)
        } finally {
          await disconnectMcpClients(mcpClients)
        }
      },
    }),
  )
}

async function resolveEnabledMcpServers(agent: AgentConfig, persistence: Persistence) {
  const servers = await Promise.all((agent.mcpServers ?? []).map((id) => persistence.mcpServers.get(id)))
  return servers.filter(
    (server): server is McpServerConfig => Boolean(server && server.enabled),
  )
}

async function disconnectMcpClients(clients: ReturnType<typeof createMcpClient>[]) {
  await Promise.all(clients.map((client) => client.disconnect().catch(() => undefined)))
}

export class StrandsRuntime implements AgentRuntime {
  private sessions = new Map<string, RuntimeSessionState>()

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
    private readonly persistence: Persistence,
  ) {}

  deleteSession(sessionId: string) {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      void disconnectMcpClients(existing.mcpClients)
    }
    this.sessions.delete(sessionId)
  }

  private async getSessionAgent(
    agentConfig: AgentConfig,
    provider: ModelProviderConfig | undefined,
    mcpServers: McpServerConfig[],
    agentTools: AgentConfig[],
    sessionId: string,
  ) {
    const cacheKey = getRuntimeCacheKey(agentConfig, provider, mcpServers, agentTools)
    const existing = this.sessions.get(sessionId)
    if (existing?.cacheKey === cacheKey) {
      return existing.agent
    }

    if (existing) {
      await disconnectMcpClients(existing.mcpClients)
    }

    const { agent, mcpClients } = await createStrandsAgent(
      agentConfig,
      provider,
      mcpServers,
      agentTools,
      this.toolRegistry,
      this.skillRegistry,
      this.persistence,
    )
    this.sessions.set(sessionId, {
      agent,
      cacheKey,
      mcpClients,
    })

    return agent
  }

  async *runMessage(input: RunMessageInput): AsyncIterable<SessionEvent> {
    const agent = await this.getSessionAgent(
      input.agent,
      input.modelProvider,
      input.mcpServers ?? [],
      input.agentTools ?? [],
      input.session.id,
    )
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
