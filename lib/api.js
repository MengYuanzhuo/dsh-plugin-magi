/**
 * `/magi/api/*` 的路由实现（与框架无关）。
 *
 * 抽出来的原因：DSH 里由 `index.js` 把它们挂到 `ctx.webServer`，
 * 离线开发服务器 `tools/magi-dev-server.mjs` 用同一份实现挂在纯 node:http 上，
 * 于是「面板看到的协议」和「真正跑起来的协议」不可能漂移。
 */

import { isCrossSite, readJsonBody, sendError, sendJson, sendText, startSse, writeSse } from './http.js'
import { publicConfig } from './config.js'
import { describePersonaSet, savePersonaText } from './persona-files.js'
import { errorMessage } from './errors.js'

const PATH = Object.freeze({
  vote: '/magi/api/vote',
  events: '/magi/api/events',
  history: '/magi/api/history',
  result: '/magi/api/result',
  config: '/magi/api/config',
  personas: '/magi/api/personas',
  persona: '/magi/api/persona',
  debug: '/magi/api/debug',
})

export const API_PATHS = PATH

/**
 * @param {{ runner: any, ledger: any, bus: any, config: any, logger?: any, ctx?: any }} deps
 * @returns {Record<keyof typeof PATH, (req: any, res: any) => void>}
 */
export function createApi({ runner, ledger, bus, config, logger, ctx }) {
  const requestUrl = (req) => new URL(req.url ?? '/', 'http://127.0.0.1')

  const claim = (handler) => (req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((error) => {
        logger?.warn?.(`[magi] 路由出错：${errorMessage(error)}`)
        try {
          sendError(res, error)
        } catch {
          // 响应头已经发出去了，忽略
        }
      })
  }

  const vote = claim(async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: '只接受 POST' })
    if (isCrossSite(req)) return sendJson(res, 403, { error: '跨站请求被拒绝' })
    const body = await readJsonBody(req)
    const { job } = await runner.startVote(body, {})
    return sendJson(res, 202, {
      id: job.key,
      displayId: job.id,
      question: job.question,
      context: job.context,
      criticality: job.criticality,
      criticalitySource: job.criticalitySource,
      matchedKeywords: job.matchedKeywords,
      startedAt: job.createdAt,
    })
  })

  const events = claim(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, '只接受 GET')
    startSse(res)
    for (const frame of bus.recent().slice(-200)) writeSse(res, frame)
    const unsubscribe = bus.subscribe((frame) => {
      try {
        writeSse(res, frame)
      } catch {
        // 断开时由 close 事件清理
      }
    })
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        // 忽略
      }
    }, 25_000)
    keepAlive.unref?.()
    res.on('close', () => {
      clearInterval(keepAlive)
      unsubscribe()
    })
  })

  const history = claim(async (req, res) => {
    // 手动清空历史：只接受同源 DELETE。清空后编号继续递增（见 lib/ledger.js clear）。
    if (req.method === 'DELETE') {
      if (isCrossSite(req)) return sendJson(res, 403, { error: '跨站请求被拒绝' })
      if (typeof ledger.clear !== 'function') return sendJson(res, 501, { error: '当前账本不支持清空' })
      const result = await ledger.clear()
      return sendJson(res, 200, { cleared: true, ...result })
    }
    if (req.method !== 'GET') return sendJson(res, 405, { error: '只接受 GET 或 DELETE' })
    const param = requestUrl(req).searchParams.get('limit')
    const parsed = param === null || param === '' ? Number.NaN : Number(param)
    const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.round(parsed))) : 20
    return sendJson(res, 200, {
      items: await ledger.read(limit),
      summary: await ledger.summary(limit),
    })
  })

  const result = claim(async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: '只接受 GET' })
    const key = requestUrl(req).searchParams.get('id') ?? ''
    const record = await ledger.get(key)
    if (!record) return sendJson(res, 404, { error: `未找到表决 ${key}` })
    return sendJson(res, 200, record)
  })

  /**
   * 只读诊断：从**应用内部**回答「客户端半为什么没被 Web GUI 收录」。
   * 探测全部包在 try/catch 里 —— 诊断本身绝不能把插件搞挂。
   */
  const debug = claim(async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: '只接受 GET' })
    const checks = []
    const record = (label, fn) => {
      try {
        checks.push({ label, value: fn() })
      } catch (error) {
        checks.push({ label, error: errorMessage(error) })
      }
    }
    const get = (name) => {
      try {
        return ctx?.get?.(name)
      } catch (error) {
        return { __error: errorMessage(error) }
      }
    }

    const loader = get('loader')
    record('loader 服务可用', () => loader !== undefined && loader !== null)
    record('loader 里 name 含 magi 的行', () => {
      const entries = typeof loader?.entries === 'function' ? loader.entries() : []
      return entries
        .filter((entry) => String(entry?.options?.name ?? '').toLowerCase().includes('magi'))
        .map((entry) => ({
          id: entry?.id,
          name: entry?.options?.name,
          disabled: entry?.disabled === true,
          hasFiber: entry?.fiber !== undefined && entry?.fiber !== null,
        }))
    })

    const clientModules = get('clientModules')
    record('clientModules 服务可用', () => clientModules !== undefined && clientModules !== null)
    record('clientModules 原型方法', () => (clientModules
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(clientModules))
      : null))
    record('模块图 entries 的 id', () => {
      const graph = typeof clientModules?.graph === 'function' ? clientModules.graph() : undefined
      return (graph?.entries ?? []).map((entry) => entry?.id)
    })
    // pkgMeta 是关键：值为 null 表示「解析失败并被缓存」，那正是被静默跳过的证据
    record('pkgMeta 里与 magi 相关的条目', () => {
      const meta = clientModules?.pkgMeta
      if (!(meta instanceof Map)) return `pkgMeta 不是 Map（${typeof meta}）`
      const out = {}
      for (const [key, value] of meta.entries()) {
        if (String(key).toLowerCase().includes('magi')) out[String(key)] = value === null ? 'null（解析失败，已缓存）' : 'ok'
      }
      return out
    })
    record('sources 里与 magi 相关的条目', () => {
      const sources = clientModules?.sources
      if (!(sources instanceof Map)) return `sources 不是 Map（${typeof sources}）`
      const out = []
      for (const [key, value] of sources.entries()) {
        if (String(value?.loaderName ?? key).toLowerCase().includes('magi')) {
          out.push({ key: String(key), loaderName: value?.loaderName, packageName: value?.packageName, baseUrl: value?.baseUrl })
        }
      }
      return out
    })
    record('table（已收录的包）', () => {
      const table = clientModules?.table
      if (!(table instanceof Map)) return `table 不是 Map（${typeof table}）`
      return [...table.keys()]
    })
    record('artifactBaseline(dsh-plugin-magi)', () => {
      const fn = clientModules?.artifactBaseline
      return typeof fn === 'function' ? (fn.call(clientModules, 'dsh-plugin-magi') ?? null) : '方法不存在'
    })

    return sendJson(res, 200, { checks })
  })

  const configHandler = claim(async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: '只接受 GET' })
    return sendJson(res, 200, { config: publicConfig(config) })
  })

  /** 当前三台生效的人格：来源（内置/外部文件）、哈希与正文。 */
  const personas = claim(async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: '只接受 GET' })
    return sendJson(res, 200, await describePersonaSet(config, { logger }))
  })

  /**
   * 手动保存单台单元的人格正文。
   * 只写 `<personasDir>/<melchior|balthasar|casper>.md` —— 单元名之外的路径一律拒绝。
   */
  const persona = claim(async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: '只接受 POST' })
    if (isCrossSite(req)) return sendJson(res, 403, { error: '跨站请求被拒绝' })
    if (typeof config.personasDir !== 'string' || config.personasDir.trim() === '') {
      return sendJson(res, 400, { error: '未配置 personasDir，无法保存人格文件' })
    }
    const body = await readJsonBody(req)
    const unit = typeof body?.unit === 'string' ? body.unit : ''
    const text = typeof body?.text === 'string' ? body.text : ''
    try {
      const saved = await savePersonaText(config.personasDir, unit, text)
      return sendJson(res, 200, { saved: true, ...saved })
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500
      return sendJson(res, status, { error: errorMessage(error) })
    }
  })

  return { vote, events, history, result, config: configHandler, personas, persona, debug }
}
