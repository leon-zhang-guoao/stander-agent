import http from 'node:http'
import https from 'node:https'
import type { ModelProviderConfig } from './types'

export function allowsSelfSignedCertificates(provider?: Pick<ModelProviderConfig, 'tls'>) {
  return provider?.tls?.allowSelfSignedCertificates === true
}

export function createProviderFetch(provider?: Pick<ModelProviderConfig, 'tls'>): typeof fetch | undefined {
  if (!allowsSelfSignedCertificates(provider)) {
    return undefined
  }

  return async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const url = input instanceof URL
      ? input
      : new URL(request?.url ?? input.toString())
    const headers = new Headers(request?.headers)
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    }
    const body = init?.body
    const method = init?.method ?? request?.method ?? (body ? 'POST' : 'GET')

    return new Promise<Response>((resolve, reject) => {
      const transport = url.protocol === 'http:' ? http : https
      const request = transport.request(
        url,
        {
          method,
          headers: Object.fromEntries(headers.entries()),
          rejectUnauthorized: url.protocol === 'https:' ? false : undefined,
        },
        (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
          response.on('end', () => {
            resolve(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode ?? 0,
                statusText: response.statusMessage,
                headers: response.headers as HeadersInit,
              }),
            )
          })
        },
      )

      request.on('error', reject)
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          request.destroy(new Error('The operation was aborted'))
        }, { once: true })
      }
      if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
        request.write(body)
      }
      request.end()
    })
  }
}
