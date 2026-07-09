#!/usr/bin/env node
import { createPlatformPersistence } from '../platform/persistence-factory'
import { createFileSkillRegistry } from '../platform/skill-registry'
import { StrandsRuntime } from '../platform/strands-runtime'
import { createBuiltinToolRegistry } from '../platform/tool-registry'
import { startStanderRuntimeService } from './server'

const token = process.env.STANDER_RUNTIME_TOKEN
if (!token) {
  console.error('STANDER_RUNTIME_TOKEN is required')
  process.exit(1)
}

const modelId = process.env.STANDER_MODEL || 'azure-gpt-o4-mini'
const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || 8787)

const runtime = new StrandsRuntime(
  createBuiltinToolRegistry(),
  createFileSkillRegistry(),
  createPlatformPersistence(),
)

startStanderRuntimeService({
  runtime,
  token,
  modelId,
  host,
  port,
})

console.log(`Stander runtime service listening on http://${host}:${port}`)
