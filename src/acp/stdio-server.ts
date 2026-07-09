import readline from 'node:readline'
import { stdin, stdout } from 'node:process'
import { createAcpSessionUpdateNotification, mapSessionEventToAcpUpdate } from './event-mapping'
import {
  createJsonRpcError,
  createJsonRpcResult,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  parseJsonRpcLine,
  serializeJsonRpc,
  type JsonRpcRequest,
} from './json-rpc'
import type { StanderRuntimeClient } from './stander-runtime-client'

type RuntimeClientLike = Pick<StanderRuntimeClient, 'createSession' | 'prompt' | 'cancel'>

export type AcpStdioServerOptions = {
  runtimeClient: RuntimeClientLike
  write?: (message: string) => void
  cwd?: string
}

function extractPromptText(params: unknown): string {
  const prompt = (params as { prompt?: Array<{ type?: string; text?: string }> } | null)?.prompt
  if (!Array.isArray(prompt)) return ''
  return prompt
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

function getSessionId(params: unknown): string {
  return String((params as { sessionId?: string } | null)?.sessionId ?? '')
}

export class AcpStdioServer {
  private readonly runtimeClient: RuntimeClientLike
  private readonly writeMessage: (message: string) => void
  private readonly cwd: string

  constructor(options: AcpStdioServerOptions) {
    this.runtimeClient = options.runtimeClient
    this.writeMessage = options.write ?? ((message) => stdout.write(message))
    this.cwd = options.cwd ?? process.cwd()
  }

  async handleMessage(message: JsonRpcRequest): Promise<void> {
    if (message.id === undefined) {
      return
    }

    try {
      switch (message.method) {
        case 'initialize':
          this.send(createJsonRpcResult(message.id, {
            protocolVersion: 1,
            agentCapabilities: {
              loadSession: false,
              promptCapabilities: { image: false, embeddedContext: false },
            },
            authMethods: [],
          }))
          return
        case 'session/new': {
          const cwd = String((message.params as { cwd?: string } | null)?.cwd ?? this.cwd)
          const session = await this.runtimeClient.createSession({ cwd })
          this.send(createJsonRpcResult(message.id, { sessionId: session.sessionId }))
          return
        }
        case 'session/prompt': {
          const sessionId = getSessionId(message.params)
          const text = extractPromptText(message.params)
          if (!sessionId || !text) {
            this.send(createJsonRpcError(message.id, JSON_RPC_INVALID_PARAMS, 'sessionId and text prompt are required'))
            return
          }
          for await (const event of this.runtimeClient.prompt(sessionId, text)) {
            const update = mapSessionEventToAcpUpdate(event)
            if (update) {
              this.send(createAcpSessionUpdateNotification(sessionId, update))
            }
          }
          this.send(createJsonRpcResult(message.id, {}))
          return
        }
        case 'session/cancel': {
          const sessionId = getSessionId(message.params)
          if (!sessionId) {
            this.send(createJsonRpcError(message.id, JSON_RPC_INVALID_PARAMS, 'sessionId is required'))
            return
          }
          await this.runtimeClient.cancel(sessionId)
          this.send(createJsonRpcResult(message.id, { stopReason: 'cancelled' }))
          return
        }
        default:
          this.send(createJsonRpcError(message.id, JSON_RPC_METHOD_NOT_FOUND, `Unsupported ACP method: ${message.method}`))
      }
    } catch (error) {
      this.send(createJsonRpcError(
        message.id,
        JSON_RPC_INTERNAL_ERROR,
        error instanceof Error ? error.message : String(error),
      ))
    }
  }

  listen(input = stdin): void {
    const rl = readline.createInterface({ input })
    rl.on('line', (line) => {
      const message = parseJsonRpcLine(line)
      if (!message) return
      void this.handleMessage(message)
    })
  }

  private send(message: unknown): void {
    this.writeMessage(serializeJsonRpc(message as never))
  }
}
