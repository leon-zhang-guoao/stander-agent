export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: unknown
}

export type JsonRpcSuccess = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result: unknown
}

export type JsonRpcFailure = {
  jsonrpc: '2.0'
  id: JsonRpcId
  error: {
    code: number
    message: string
    data?: unknown
  }
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcSuccess | JsonRpcFailure

export const JSON_RPC_PARSE_ERROR = -32700
export const JSON_RPC_INVALID_REQUEST = -32600
export const JSON_RPC_METHOD_NOT_FOUND = -32601
export const JSON_RPC_INVALID_PARAMS = -32602
export const JSON_RPC_INTERNAL_ERROR = -32603

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || typeof value === 'number' || value === null
}

export function parseJsonRpcLine(line: string): JsonRpcRequest | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (!isObject(parsed)) {
    return null
  }

  if (parsed.jsonrpc !== '2.0' || typeof parsed.method !== 'string' || !parsed.method.length) {
    return null
  }

  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    method: parsed.method,
  }

  if ('id' in parsed) {
    if (!isValidJsonRpcId(parsed.id)) {
      return null
    }

    request.id = parsed.id
  }

  if ('params' in parsed) {
    request.params = parsed.params
  }

  return request
}

export function createJsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return {
    jsonrpc: '2.0',
    id,
    result,
  }
}

export function createJsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  const error: JsonRpcFailure['error'] = { code, message }

  if (data !== undefined) {
    error.data = data
  }

  return {
    jsonrpc: '2.0',
    id,
    error,
  }
}

export function serializeJsonRpc(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`
}
