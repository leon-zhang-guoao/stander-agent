#!/usr/bin/env node

async function main() {
  const command = process.argv[2]

  if (command === 'acp') {
    await import('./acp/cli.js')
    return
  }

  if (command === 'runtime') {
    await import('./runtime-service/cli.js')
    return
  }

  console.error('Usage: stander-agent <acp|runtime>')
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
