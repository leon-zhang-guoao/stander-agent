import { McpClient, type Tool } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig } from './types'

export type McpToolSummary = {
  name: string
  description: string
}

export function createMcpClient(config: McpServerConfig) {
  if (config.transport === 'stdio') {
    if (!config.command) {
      throw new Error('stdio MCP server requires command')
    }

    return new McpClient({
      transport: new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: config.env,
        cwd: config.cwd,
      }),
    })
  }

  if (!config.url) {
    throw new Error('streamable-http MCP server requires url')
  }

  return new McpClient({
    transport: new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: config.headers ? { headers: config.headers } : undefined,
    }),
  })
}

export function summarizeMcpTools(tools: Tool[]): McpToolSummary[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
  }))
}

export async function listMcpTools(config: McpServerConfig) {
  const client = createMcpClient(config)
  try {
    const tools = await client.listTools()
    return summarizeMcpTools(tools)
  } finally {
    await client.disconnect().catch(() => undefined)
  }
}
