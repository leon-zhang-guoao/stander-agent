import type { Tool } from '@strands-agents/sdk'
import { builtinToolEntries } from '../tools'

export type ToolSummary = {
  name: string
  description: string
}

export interface ToolRegistry {
  list(): ToolSummary[]
  get(name: string): Tool | undefined
  resolve(names: string[]): Tool[]
  unknown(names: string[]): string[]
}

export function createBuiltinToolRegistry(): ToolRegistry {
  const tools = new Map(builtinToolEntries.map((entry) => [entry.name, entry]))

  return {
    list() {
      return builtinToolEntries.map(({ name, description }) => ({ name, description }))
    },

    get(name) {
      return tools.get(name)?.tool
    },

    resolve(names) {
      return names.map((name) => tools.get(name)?.tool).filter((tool): tool is Tool => Boolean(tool))
    },

    unknown(names) {
      return names.filter((name) => !tools.has(name))
    },
  }
}
