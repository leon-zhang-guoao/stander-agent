import { Agent, SlidingWindowConversationManager } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import type { AgentStreamEvent, ContentBlock } from '@strands-agents/sdk'
import { loadConfig } from './config'
import { defaultTools } from './tools'

export function createAgent() {
  const config = loadConfig()
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
    systemPrompt:
      '你是一个 helpful assistant，请用中文回答。可以使用工具帮助用户。' +
      '当用户使用 $skill-name 语法时，表示显式触发该 skill；若需要，也可以使用 list_skills/read_skill 查找并读取可用 skill。',
    tools: defaultTools,
    conversationManager,
  })
}

export function getText(content: ContentBlock[]) {
  return content
    .filter((block) => block.type === 'textBlock')
    .map((block) => block.text)
    .join('')
}

export function getTextDelta(event: AgentStreamEvent) {
  if (
    event.type === 'modelStreamUpdateEvent' &&
    event.event.type === 'modelContentBlockDeltaEvent' &&
    event.event.delta.type === 'textDelta'
  ) {
    return event.event.delta.text
  }

  return ''
}

export function getToolUseName(event: AgentStreamEvent) {
  if (
    event.type === 'contentBlockEvent' &&
    event.contentBlock.type === 'toolUseBlock'
  ) {
    return event.contentBlock.name
  }

  return undefined
}

export function isToolResultEvent(event: AgentStreamEvent) {
  return event.type === 'toolResultEvent'
}
