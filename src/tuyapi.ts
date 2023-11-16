/* eslint-disable immutable/no-mutation */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable immutable/no-this */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
import crypto from 'crypto'
import https from 'https'
import type { NodeAPI, NodeDef, NodeMessage, Node as NodeRed } from 'node-red'
import { type Method, methods } from './utils'

interface TuyapiConfig {
  clientId: unknown
  secret: unknown
  server: unknown
  path: unknown
  method: unknown
  headers: unknown
}

type Primitive = string | number | boolean
type Body = { [key in string]: Primitive | Array<Primitive> | Body }
const isSerializable = (value: unknown): value is Primitive | Body => {
  if (typeof value === 'object') {
    return value !== null && Object.values(value).every(isSerializable)
  } else {
    return (
      typeof value !== 'string' ||
      typeof value !== 'number' ||
      typeof value !== 'boolean'
    )
  }
}
const isBody = (body: unknown): body is Body => {
  return (
    typeof body === 'object' &&
    body !== null &&
    Object.keys(body).every(isSerializable)
  )
}

type Server = string
const isServer = (server: unknown): server is Server => {
  return typeof server === 'string' && !!server
}

const isHeaders = (headers: unknown): headers is Record<string, string> => {
  return (
    typeof headers === 'object' &&
    headers !== null &&
    Object.values(headers).every((value) => typeof value === 'string')
  )
}

type TuyaData =
  | {
      success: false
      code: number
      msg: string
    }
  | {
      success: true
      result: Record<string, unknown>
    }
const isTuyaData = (data: unknown): data is TuyaData => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    typeof data.success === 'boolean' &&
    ((data.success === false &&
      'code' in data &&
      typeof data.code === 'number' &&
      'msg' in data &&
      typeof data.msg === 'string') ||
      (data.success === true &&
        'result' in data &&
        typeof data.result === 'object' &&
        data.result !== null))
  )
}

export default function (RED: NodeAPI): void {
  function tuyapi(this: NodeRed, def: NodeDef & Partial<TuyapiConfig>) {
    RED.nodes.createNode(this, def)

    this.on('input', (msg) => {
      const clientId = 'clientId' in msg ? msg.clientId : def.clientId
      if (typeof clientId !== 'string' || !clientId) {
        return this.error('"clientId" must be a non-empty string', msg)
      }

      const secret = 'secret' in msg ? msg.secret : def.secret
      if (typeof secret !== 'string' || !secret) {
        return this.error('"secret" must be a non-empty string', msg)
      }

      const server = 'server' in msg ? msg.server : def.server
      if (!isServer(server)) {
        return this.error('"server" must be a valid domain name', msg)
      }

      const path = 'path' in msg ? msg.path : def.path
      if (typeof path !== 'string' || !path) {
        return this.error('"path" must be a non-empty string', msg)
      }

      const method = 'method' in msg ? msg.method : def.method
      if (typeof method !== 'string' || !methods.includes(method as Method)) {
        return this.error(
          `"method" must be one of "${methods.join(', ')}"`,
          msg,
        )
      }

      let requestHeaders: unknown = null
      try {
        if ('headers' in msg) {
          requestHeaders = msg.headers
        } else if (def.headers) {
          if (typeof def.headers !== 'string') {
            return this.error('"headers" definition must be a string', msg)
          }
          requestHeaders = JSON.parse(def.headers)
        }
      } catch (error) {
        return this.error('failed to JSON parse "headers" definition', msg)
      }
      if (requestHeaders !== null && !isHeaders(requestHeaders)) {
        return this.error('"headers" must a string record property', msg)
      }

      const hasBody = msg.payload !== ''
      if (hasBody && !isBody(msg.payload)) {
        return this.error(
          '"body" must be a non-nullable serializable object',
          msg,
        )
      }
      const body = hasBody ? JSON.stringify(msg.payload) : ''

      const timestamp = Date.now()
      const accessToken =
        requestHeaders !== null && 'access_token' in requestHeaders
          ? requestHeaders.access_token
          : ''
      const contentHash = crypto.createHash('sha256').update(body).digest('hex')
      const optionalHeaders = ''
      const sign = crypto
        .createHmac('sha256', secret)
        .update(
          clientId +
            accessToken +
            timestamp.toString() +
            [method, contentHash, optionalHeaders, path].join('\n'),
        )
        .digest('hex')
        .toUpperCase()
      const headers = {
        ...requestHeaders,
        client_id: clientId,
        t: timestamp.toString(),
        sign_method: 'HMAC-SHA256',
        sign,
      }

      const request = https.request(
        { method, host: server, path, headers },
        (response) => {
          let chunks = ''

          response.on('data', (chunk) => {
            chunks += chunk
          })

          response.on('close', () => {
            if (response.statusCode === 200) {
              try {
                const data = JSON.parse(chunks)

                if (isTuyaData(data)) {
                  if (data.success) {
                    return this.send({ ...msg, payload: data.result })
                  } else {
                    const error = {
                      code: data.code,
                      message: data.msg,
                    }
                    return this.error(error.message, {
                      ...msg,
                      errorObject: error,
                    } as NodeMessage)
                  }
                } else {
                  this.send({ ...msg, payload: data })
                }
              } catch (error) {
                const err = {
                  message: 'Failed to parse chunks as JSON',
                  chunks,
                }
                return this.error(err.message, {
                  ...msg,
                  errorObject: err,
                } as NodeMessage)
              }
            } else {
              const error = {
                code: response.statusCode,
                message: response.statusMessage,
              }
              return this.error(error.message, {
                ...msg,
                errorObject: error,
              } as NodeMessage)
            }
          })
        },
      )
      request.on('error', (error) => {
        return this.error(error.message, {
          ...msg,
          errorObject: error,
        } as NodeMessage)
      })

      request.write(body)
      request.end()
    })
  }

  RED.nodes.registerType('tuyapi', tuyapi)
}
