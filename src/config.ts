import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const appConfigSchema = z.object({
  modelId: z.string().min(1),
  baseURL: z.string().min(1),
})

export type AppConfig = z.infer<typeof appConfigSchema>

export function loadConfig(): AppConfig {
  const configPath = process.env.AGENT_CONFIG_PATH ?? path.join(process.cwd(), 'config.json')

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `配置文件不存在: ${configPath}. 请复制 config.example.json 为 config.json 并填写 modelId/baseURL。`,
    )
  }

  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  return appConfigSchema.parse(rawConfig)
}
