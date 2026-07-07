import { z } from 'zod'

export const createAgentRequestSchema = z.object({
  name: z.string().min(1),
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
