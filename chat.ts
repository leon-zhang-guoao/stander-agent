import { Agent } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import type { AgentResult, ContentBlock } from '@strands-agents/sdk'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

function getText(content: ContentBlock[]) {
  return content
    .filter((block) => block.type === 'textBlock')
    .map((block) => block.text)
    .join('')
}

function isReadlineClosedError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_USE_AFTER_CLOSE'
  )
}

async function main() {
  const agent = new Agent({
    model: new OpenAIModel({
      api: 'chat',
      modelId: 'azure-gpt-o4-mini',
      apiKey: process.env.OPENAI_API_KEY ?? 'dummy-key',
      clientConfig: {
        baseURL: 'http://fca-vm-uat-nifi-edge3.synnex.org:4000/v1',
      },
    }),
    systemPrompt: '你是一个 helpful assistant，请用中文回答用户问题。',
  })

  const rl = readline.createInterface({ input, output })

  console.log('Agent 已启动。输入 exit 退出。\n')

  while (true) {
    let message: string

    try {
      message = await rl.question('你: ')
    } catch (error) {
      if (isReadlineClosedError(error)) {
        break
      }

      throw error
    }

    if (message.trim().toLowerCase() === 'exit') {
      break
    }

    const result: AgentResult = await agent.invoke(message)
    console.log('\nAgent:', getText(result.lastMessage.content), '\n')
  }

  rl.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
