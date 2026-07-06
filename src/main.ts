import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createAgent, getTextDelta, getToolUseName, isToolResultEvent } from './agent'

// ==========================================
// 主程序
// ==========================================

async function main() {
  const agent = createAgent()

  const rl = readline.createInterface({ input, output })
  console.log('🤖 Agent 已启动（支持工具 + 流式输出）。输入 exit 退出。\n')
  console.log('⚠️  TypeScript SDK 暂不支持跨进程持久化，重启后记忆会重置\n')

  while (true) {
    let message: string
    try {
      message = await rl.question('你: ')
    } catch (error: any) {
      if (error?.code === 'ERR_USE_AFTER_CLOSE') break
      throw error
    }

    if (message.trim().toLowerCase() === 'exit') break

    process.stdout.write('Agent: ')
    
    try {
      const stream = await agent.stream(message)
      for await (const event of stream) {
        const text = getTextDelta(event)
        const toolName = getToolUseName(event)

        if (text) {
          process.stdout.write(text)
        } else if (toolName) {
          process.stdout.write(`\n[🔧 调用工具: ${toolName}]\n`)
        } else if (isToolResultEvent(event)) {
          process.stdout.write(`[✅ 工具完成]\n`)
        }
      }
      console.log('\n')
    } catch (error) {
      console.error('\n[❌ 错误]:', error)
    }
  }

  rl.close()
  console.log('\n👋 再见！')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
