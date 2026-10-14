/**
 * 离线开发服务器：在没有安装插件的情况下，用同一份 lib/api.js 起一个真的 HTTP + SSE 服务。
 *
 * 用途：
 * - 验证路由与 SSE 协议（真发请求、真收事件流）；
 * - 给 preview/index.html 一个真实后端（面板可以不用假数据就能跑）；
 * - 桩模型（llmMode: stub）下完全不联网、不调用任何模型。
 *
 * 用法：
 *   node tools/magi-dev-server.mjs [--port 8790] [--ledger .magi-dev] [--critical-keywords 删除,密钥]
 *
 * ⚠️ 这里**不会**加载 DSH 的 LLM 服务（脱离运行时没有 ctx.llm），所以只有桩模型可用；
 * 真实模型调用只能在安装后的 DSH 里验证。
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createApi, API_PATHS } from '../lib/api.js'
import { normalizeConfig } from '../lib/config.js'
import { Ledger } from '../lib/ledger.js'
import { createBus } from '../lib/bus.js'
import { createVoteRunner } from '../lib/vote.js'

const packageDir = resolve(fileURLToPath(new URL('..', import.meta.url)))

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const port = Number(readArg('port', '8790'))
const ledgerDir = resolve(packageDir, readArg('ledger', '.magi-dev'))
const keywords = readArg('critical-keywords', '')
const delayMs = Number(readArg('delay', '18'))

const { config, warnings } = normalizeConfig({
  llmMode: 'stub',
  stubDelayMs: Number.isFinite(delayMs) ? delayMs : 18,
  ledgerDir,
  ...(keywords ? { criticalKeywords: keywords.split(',').map((item) => item.trim()).filter(Boolean) } : {}),
})

const logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
}

for (const warning of warnings) logger.warn(`[magi-dev] 配置提示：${warning}`)

const ledger = new Ledger({ dir: config.ledgerDir, historyLimit: config.historyLimit })
const bus = createBus()
const runner = createVoteRunner({ ctx: {}, config, ledger, bus, logger })
const api = createApi({ runner, ledger, bus, config, logger })

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

/** 静态资源：优先 preview/，其次包根（这样 /lib/client.js 也能取到）。 */
async function serveStatic(res, urlPath) {
  const trimmed = urlPath.replace(/^\/+/, '')
  // 目录式 URL（`/`、`/preview/`）落到预览首页
  const rel = trimmed === '' ? 'preview/index.html' : (trimmed.endsWith('/') ? `${trimmed}index.html` : trimmed)
  const candidates = [join(packageDir, rel), join(packageDir, 'preview', rel)]
  for (const candidate of candidates) {
    const target = normalize(candidate)
    if (!target.startsWith(packageDir)) continue
    try {
      const body = await readFile(target)
      res.writeHead(200, {
        'content-type': MIME[extname(target)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      })
      res.end(body)
      return true
    } catch {
      // 试下一个候选
    }
  }
  return false
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
  const path = url.pathname

  for (const [key, apiPath] of Object.entries(API_PATHS)) {
    if (path === apiPath) {
      api[key](req, res)
      return
    }
  }

  void (async () => {
    if (await serveStatic(res, path)) return
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  })()
})

server.listen(port, '127.0.0.1', () => {
  logger.info(`[magi-dev] MAGI 离线开发服务器： http://127.0.0.1:${port}/`)
  logger.info(`[magi-dev] 面板预览：            http://127.0.0.1:${port}/preview/`)
  logger.info(`[magi-dev] 账本目录：            ${config.ledgerDir}`)
  logger.info('[magi-dev] 模型：stub（离线桩，不调用任何模型）')
})

const shutdown = () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 500).unref?.()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
