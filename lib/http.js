/**
 * HTTP / SSE 工具函数。只依赖 node:http 的请求响应对象，无 DSH 依赖。
 */

import { errorMessage } from './errors.js'

const MAX_BODY_BYTES = 1_000_000

/** @param {import('node:http').ServerResponse} res */
export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

export function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' })
  res.end(text)
}

/**
 * 读取并解析 JSON 请求体。
 * @param {import('node:http').IncomingMessage} req
 */
export async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

/**
 * 跨站保护：只在浏览器带了 Origin 且其 host 与 Host 头不一致时拒绝。
 * 同源请求（无论是否带 Origin）一律放行，避免误伤 DSH 自己的页面。
 * @param {import('node:http').IncomingMessage} req
 */
export function isCrossSite(req) {
  const origin = req.headers?.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return false
  const host = req.headers?.host
  if (typeof host !== 'string' || host === '') return false
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

/** 建立 SSE 通道并发送首帧注释。 */
export function startSse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': magi connected\n\n')
}

/** 推一帧 SSE 数据。 */
export function writeSse(res, frame) {
  res.write(`data: ${JSON.stringify(frame)}\n\n`)
}

/** 统一的未预期错误响应。 */
export function sendError(res, error) {
  sendJson(res, 500, { error: errorMessage(error) })
}
