import { Agent, tool, FileSessionManager } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import type { ContentBlock } from '@strands-agents/sdk'
import { z } from 'zod'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import fs from 'node:fs/promises'
import { execSync } from 'node:child_process'

// ==========================================
// 1. 定义 Tools（Agent 的核心能力）
// ==========================================

/** 读取本地文件内容 */
const fileReader = tool({
  name: 'read_file',
  description: '读取指定路径的文件内容，支持代码、文档、日志等文本文件',
  inputSchema: z.object({
    path: z.string().describe('文件的绝对路径或相对路径'),
  }),
  callback: async ({ path }) => {
    try {
      const content = await fs.readFile(path, 'utf-8')
      // 限制返回长度，避免撑爆上下文
      return content.length > 8000 
        ? content.slice(0, 8000) + '\n... [内容已截断]' 
        : content
    } catch (err: any) {
      return `读取文件失败: ${err.message}`
    }
  },
})

/** 执行 Shell 命令 */
const shellTool = tool({
  name: 'run_shell',
  description: '执行 shell 命令并返回输出，用于获取系统信息、操作文件等',
  inputSchema: z.object({
    command: z.string().describe('要执行的 shell 命令'),
  }),
  callback: async ({ command }) => {
    try {
      const result = execSync(command, { 
        encoding: 'utf-8', 
        timeout: 10000,
        cwd: process.cwd() 
      })
      return result.length > 5000 ? result.slice(0, 5000) + '\n...' : result
    } catch (err: any) {
      return `命令执行失败: ${err.message}`
    }
  },
})

/** 发起 HTTP 请求 */
const httpTool = tool({
  name: 'http_request',
  description: '发起 HTTP 请求获取网络数据或调用外部 API',
  inputSchema: z.object({
    url: z.string().describe('请求 URL'),
    method: z.enum(['GET', 'POST']).default('GET').describe('HTTP 方法'),
    body: z.string().optional().describe('POST 请求体（JSON 字符串）'),
  }),
  callback: async ({ url, method, body }) => {
    try {
      const res = await fetch(url, { 
        method, 
        body: body || undefined,
        headers: body ? { 'Content-Type': 'application/json' } : undefined
      })
      const text = await res.text()
      return text.slice(0, 5000)
    } catch (err: any) {
      return `请求失败: ${err.message}`
    }
  },
})

/** 数学计算器 */
const calculator = tool({
  name: 'calculator',
  description: '执行数学计算，支持加减乘除、括号等表达式',
  inputSchema: z.object({
    expression: z.string().describe('数学表达式，例如 "2 + 2 * 5" 或 "(10 - 3) / 7"'),
  }),
  callback: async ({ expression }) => {
    try {
      // 生产环境建议改用 mathjs 等安全库替代 eval
      const result = Function('"use strict"; return (' + expression + ')')()
      return String(result)
    } catch {
      return '计算错误：请检查表达式格式是否正确'
    }
  },
})

// ==========================================
// 辅助函数
// ==========================================

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
    (error as any).code === 'ERR_USE_AFTER_CLOSE'
  )
}

// ==========================================
// 主程序
// ==========================================

async function main() {
  // 2. 创建 SessionManager（实现有记忆的对话）
  const sessionManager = new FileSessionManager({
    sessionId: `session-${Date.now()}`,
    storageDir: './sessions',
  })

  // 创建 Agent：注入模型 + 工具 + 会话管理器
  const agent = new Agent({
    model: new OpenAIModel({
      api: 'chat',
      modelId: 'azure-gpt-o4-mini',
      apiKey: process.env.OPENAI_API_KEY ?? 'dummy-key',
      clientConfig: {
        baseURL: 'http://fxxx',
      },
    }),
    systemPrompt: 
      '你是一个 helpful assistant，请用中文回答用户问题。' +
      '当用户需要分析文件、执行命令、获取网络数据或进行数学计算时，请主动使用对应的工具。',
    tools: [fileReader, shellTool, httpTool, calculator], // 注入工具
    sessionManager,                                        // 注入记忆
  })

  const rl = readline.createInterface({ input, output })

  console.log('🤖 Agent 已启动（支持工具调用 + 记忆 + 流式输出）。输入 exit 退出。\n')

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

    // 3. 使用 stream 替代 invoke（实时流式输出）
    process.stdout.write('Agent: ')
    
    try {
      const stream = await agent.stream(message)
      
      for await (const event of stream) {
        switch (event.type) {
          case 'textBlock':
            // 实时输出文本（打字机效果）
            process.stdout.write(event.text)
            break
            
          case 'toolUseBlock':
            // 工具开始调用
            process.stdout.write(`\n[🔧 调用工具: ${event.name}]\n`)
            break
            
          case 'toolResultBlock':
            // 工具执行完成
            process.stdout.write(`[✅ 工具执行完成]\n`)
            break
            
          case 'reasoningBlock':
            // 推理过程（如果模型支持）
            if (event.reasoningText) {
              process.stdout.write(`\n[💭 ${event.reasoningText}]\n`)
            }
            break
        }
      }
      
      console.log('\n') // 流结束换行
    } catch (error) {
      console.error('\n[❌ 错误]:', error)
    }
  }

  rl.close()
  console.log('\n👋 会话已保存至 ./sessions，再见！')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})