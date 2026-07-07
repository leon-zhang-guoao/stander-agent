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
