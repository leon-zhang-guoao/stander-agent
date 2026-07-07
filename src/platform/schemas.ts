import { z } from 'zod'

export const createAgentRequestSchema = z.object({
  name: z.string().min(1),
  modelProviderId: z.string().min(1).optional(),
  modelId: z.string().min(1),
  baseURL: z.string().min(1),
  systemPrompt: z.string(),
  tools: z.array(z.string()),
  skills: z.array(z.string()),
  mcpServers: z.array(z.string()).optional(),
  agentTools: z.array(z.string()).optional(),
})

export const patchAgentRequestSchema = createAgentRequestSchema.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: 'Patch body must contain at least one field' },
)

export const createPlatformSessionRequestSchema = z.object({
  agentId: z.string().min(1),
})

export const postSessionMessageRequestSchema = z.object({
  message: z.string().min(1),
})

const modelProviderCapabilitiesSchema = z.object({
  streaming: z.boolean(),
  toolCalling: z.boolean(),
  vision: z.boolean(),
  jsonMode: z.boolean(),
  reasoning: z.boolean(),
})

export const createModelProviderRequestSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    'openai-compatible',
    'openai',
    'anthropic',
    'ollama',
    'openrouter',
    'custom',
  ]),
  baseURL: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  apiKeyRef: z.string().min(1).optional(),
  defaultModelId: z.string().min(1).optional(),
  availableModels: z.array(z.string().min(1)).optional(),
  capabilities: modelProviderCapabilitiesSchema,
  enabled: z.boolean().optional(),
})

export const patchModelProviderRequestSchema =
  createModelProviderRequestSchema.partial().refine(
    (patch) => Object.keys(patch).length > 0,
    { message: 'Patch body must contain at least one field' },
  )

const stringRecordSchema = z.record(z.string(), z.string())

const mcpServerBaseSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(['stdio', 'streamable-http']),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: stringRecordSchema.optional(),
  cwd: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  headers: stringRecordSchema.optional(),
  enabled: z.boolean().optional(),
})

export const createMcpServerRequestSchema = mcpServerBaseSchema
  .refine((input) => input.transport !== 'stdio' || Boolean(input.command), {
    message: 'stdio MCP servers require command',
  })
  .refine((input) => input.transport !== 'streamable-http' || Boolean(input.url), {
    message: 'streamable-http MCP servers require url',
  })

export const patchMcpServerRequestSchema = mcpServerBaseSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Patch body must contain at least one field',
  })
  .refine((patch) => patch.transport !== 'stdio' || patch.command !== undefined, {
    message: 'stdio MCP servers require command',
  })
  .refine((patch) => patch.transport !== 'streamable-http' || patch.url !== undefined, {
    message: 'streamable-http MCP servers require url',
  })

export const graphRunRequestSchema = z.object({
  input: z.string().min(1),
  nodeAgentIds: z.array(z.string().min(1)).min(1),
  edges: z.array(z.tuple([z.string().min(1), z.string().min(1)])).min(1),
})

export const swarmRunRequestSchema = z.object({
  input: z.string().min(1),
  nodeAgentIds: z.array(z.string().min(1)).min(1),
  startAgentId: z.string().min(1),
  maxSteps: z.number().int().positive().optional(),
})
