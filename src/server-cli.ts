#!/usr/bin/env node
import { startStanderServer } from './server'

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || 8787)

startStanderServer({
  host,
  port,
  runtimeToken: process.env.STANDER_RUNTIME_TOKEN,
  runtimeModelId: process.env.STANDER_MODEL || 'azure-gpt-o4-mini',
})
