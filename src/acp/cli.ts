#!/usr/bin/env node
import { AcpStdioServer } from './stdio-server'
import { createRuntimeClientConfig, StanderRuntimeClient } from './stander-runtime-client'

async function main() {
  const runtimeClient = new StanderRuntimeClient(createRuntimeClientConfig())
  const server = new AcpStdioServer({ runtimeClient })
  server.listen()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
