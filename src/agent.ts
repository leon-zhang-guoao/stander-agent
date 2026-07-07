import { Agent, SlidingWindowConversationManager, tool } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'
import type { AgentStreamEvent, ContentBlock } from '@strands-agents/sdk'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { loadConfig } from './config'
import { listSkills, readSkill } from './skills'

function resolveWorkspacePath(filePath: string) {
  const workspaceRoot = process.cwd()
  const resolvedPath = path.resolve(workspaceRoot, filePath)

  if (resolvedPath !== workspaceRoot && !resolvedPath.startsWith(workspaceRoot + path.sep)) {
    throw new Error('文件路径必须位于当前项目目录内')
  }

  return resolvedPath
}

export const fileReader = tool({
  name: 'read_file',
  description: '读取指定路径的文件内容',
  inputSchema: z.object({
    path: z.string().describe('文件路径'),
  }),
  callback: async ({ path }) => {
    try {
      const content = await fs.readFile(path, 'utf-8')
      return content.length > 8000
        ? content.slice(0, 8000) + '\n... [内容已截断]'
        : content
    } catch (err: any) {
      return `读取文件失败: ${err.message}`
    }
  },
})

export const fileWriter = tool({
  name: 'write_file',
  description: '写入文本文件；会自动创建父目录，默认不覆盖已有文件',
  inputSchema: z.object({
    path: z.string().describe('项目目录内的文件路径'),
    content: z.string().describe('要写入文件的文本内容'),
    overwrite: z.boolean().default(false).describe('是否覆盖已存在的文件'),
  }),
  callback: async ({ path: filePath, content, overwrite }) => {
    try {
      const resolvedPath = resolveWorkspacePath(filePath)

      if (!overwrite) {
        try {
          await fs.access(resolvedPath)
          return '写入失败: 文件已存在，如需覆盖请设置 overwrite=true'
        } catch {
          // File does not exist; proceed.
        }
      }

      await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
      await fs.writeFile(resolvedPath, content, 'utf-8')

      return `写入成功: ${path.relative(process.cwd(), resolvedPath)}`
    } catch (err: any) {
      return `写入文件失败: ${err.message}`
    }
  },
})

export const shellTool = tool({
  name: 'run_shell',
  description: '执行 shell 命令',
  inputSchema: z.object({
    command: z.string().describe('shell 命令'),
  }),
  callback: async ({ command }) => {
    try {
      const result = execSync(command, {
        encoding: 'utf-8',
        timeout: 10000,
        cwd: process.cwd(),
      })
      return result.length > 5000 ? result.slice(0, 5000) + '\n...' : result
    } catch (err: any) {
      return `命令执行失败: ${err.message}`
    }
  },
})

export const httpTool = tool({
  name: 'http_request',
  description: '发起 HTTP 请求',
  inputSchema: z.object({
    url: z.string().describe('请求 URL'),
    method: z.enum(['GET', 'POST']).default('GET'),
    body: z.string().optional(),
  }),
  callback: async ({ url, method, body }) => {
    try {
      const res = await fetch(url, {
        method,
        body: body || undefined,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
      })
      const text = await res.text()
      return text.slice(0, 5000)
    } catch (err: any) {
      return `请求失败: ${err.message}`
    }
  },
})

export const calculator = tool({
  name: 'calculator',
  description: '执行数学计算',
  inputSchema: z.object({
    expression: z.string().describe('数学表达式'),
  }),
  callback: async ({ expression }) => {
    try {
      const result = Function('"use strict"; return (' + expression + ')')()
      return String(result)
    } catch {
      return '计算错误'
    }
  },
})

export const skillLister = tool({
  name: 'list_skills',
  description: '列出当前项目可用的 skills',
  inputSchema: z.object({}),
  callback: async () => {
    const skills = await listSkills()
    return JSON.stringify(skills, null, 2)
  },
})

export const skillReader = tool({
  name: 'read_skill',
  description: '读取指定 skill 的 SKILL.md 内容',
  inputSchema: z.object({
    name: z.string().describe('skill 名称，例如 code-review'),
  }),
  callback: async ({ name }) => {
    try {
      return await readSkill(name)
    } catch (err: any) {
      return `读取 skill 失败: ${err.message}`
    }
  },
})

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
    tools: [
      fileReader,
      fileWriter,
      shellTool,
      httpTool,
      calculator,
      skillLister,
      skillReader,
    ],
    conversationManager,
  })
}

export const defaultTools = [
  fileReader,
  fileWriter,
  shellTool,
  httpTool,
  calculator,
  skillLister,
  skillReader,
]

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
