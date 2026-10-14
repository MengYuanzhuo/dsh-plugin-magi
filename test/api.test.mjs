/**
 * 路由级单测：用假的 req/res 直接驱动 lib/api.js 的处理器。
 * 覆盖默认 limit、越界夹紧、404、405、跨站拒绝等边界。
 * 运行：node test/api.test.mjs
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { createApi, API_PATHS } from '../lib/api.js'
import { normalizeConfig } from '../lib/config.js'

/** 假响应对象：记录 status / headers / body。 */
function makeRes() {
  const res = {
    status: undefined,
    headers: undefined,
    body: '',
    ended: false,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    write(chunk) {
      this.body += chunk
    },
    end(chunk) {
      if (chunk !== undefined) this.body += chunk
      this.ended = true
    },
  }
  return res
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function makeApi(overrides = {}) {
  const calls = { read: [], summary: [], get: [], voted: [] }
  const ledger = {
    async read(limit) {
      calls.read.push(limit)
      return [{ key: 'magi-0001-aaaaaa', verdict: 'APPROVE' }]
    },
    async summary(limit) {
      calls.summary.push(limit)
      return [{ key: 'magi-0001-aaaaaa' }]
    },
    async get(key) {
      calls.get.push(key)
      return key === 'magi-0001-aaaaaa' ? { key, verdict: 'APPROVE' } : undefined
    },
    ...overrides.ledger,
  }
  const runner = {
    async startVote(request) {
      calls.voted.push(request)
      return {
        job: {
          key: 'magi-0002-bbbbbb',
          id: 'MAGI-DECISION No.0002',
          question: request.question,
          context: request.context,
          criticality: 'critical',
          criticalitySource: 'keyword',
          matchedKeywords: ['删除'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      }
    },
    ...overrides.runner,
  }
  const bus = { recent: () => [], subscribe: () => () => {}, publish: () => {}, ...overrides.bus }
  const { config } = normalizeConfig({ llmMode: 'stub', ...overrides.config })
  return { api: createApi({ runner, ledger, bus, config, logger: { warn() {} } }), calls, config }
}

/** 把请求体塞进一个可被 `for await` 消费的异步可迭代对象。 */
function makeReq({ method = 'GET', url = '/', body, headers = {} } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(body, 'utf8')]
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

test('history：不带 limit 时用默认 20（而不是 1）', async () => {
  const { api, calls } = makeApi()
  const res = makeRes()
  api.history(makeReq({ url: API_PATHS.history }), res)
  await tick()
  assert.equal(res.status, 200)
  assert.deepEqual(calls.read, [20])
  assert.deepEqual(calls.summary, [20])
  assert.ok(JSON.parse(res.body).items.length === 1)
})

test('history：limit 越界被夹紧、非法值回落默认', async () => {
  const { api, calls } = makeApi()
  for (const [query, expected] of [['?limit=500', 100], ['?limit=0', 1], ['?limit=abc', 20], ['?limit=3.6', 4]]) {
    const res = makeRes()
    api.history(makeReq({ url: `${API_PATHS.history}${query}` }), res)
    await tick()
    assert.equal(calls.read.at(-1), expected, `${query} → ${expected}`)
  }
})

test('history：非 GET 返回 405', async () => {
  const { api } = makeApi()
  const res = makeRes()
  api.history(makeReq({ method: 'POST', url: API_PATHS.history }), res)
  await tick()
  assert.equal(res.status, 405)
})

test('result：命中返回 200，未命中返回 404', async () => {
  const { api, calls } = makeApi()
  const hit = makeRes()
  api.result(makeReq({ url: `${API_PATHS.result}?id=magi-0001-aaaaaa` }), hit)
  await tick()
  assert.equal(hit.status, 200)
  assert.equal(JSON.parse(hit.body).key, 'magi-0001-aaaaaa')

  const miss = makeRes()
  api.result(makeReq({ url: `${API_PATHS.result}?id=nope` }), miss)
  await tick()
  assert.equal(miss.status, 404)
  assert.deepEqual(calls.get, ['magi-0001-aaaaaa', 'nope'])
})

test('vote：POST 返回 202 与表决元信息', async () => {
  const { api, calls } = makeApi()
  const res = makeRes()
  const body = JSON.stringify({ question: '要不要删除旧表' })
  api.vote(makeReq({ method: 'POST', url: API_PATHS.vote, body, headers: { host: '127.0.0.1:8790' } }), res)
  await tick()
  assert.equal(res.status, 202)
  const payload = JSON.parse(res.body)
  assert.equal(payload.id, 'magi-0002-bbbbbb')
  assert.equal(payload.displayId, 'MAGI-DECISION No.0002')
  assert.equal(payload.criticality, 'critical')
  assert.deepEqual(calls.voted, [{ question: '要不要删除旧表' }])
})

test('vote：跨站 POST 被拒绝，非 POST 返回 405', async () => {
  const { api, calls } = makeApi()
  const crossSite = makeRes()
  api.vote(makeReq({
    method: 'POST',
    url: API_PATHS.vote,
    body: JSON.stringify({ question: 'x' }),
    headers: { host: '127.0.0.1:8790', origin: 'https://evil.example' },
  }), crossSite)
  await tick()
  assert.equal(crossSite.status, 403)
  assert.deepEqual(calls.voted, [], '跨站请求不应触发表决')

  const wrongMethod = makeRes()
  api.vote(makeReq({ method: 'GET', url: API_PATHS.vote }), wrongMethod)
  await tick()
  assert.equal(wrongMethod.status, 405)
})

test('vote：同源带 Origin 的 POST 放行', async () => {
  const { api } = makeApi()
  const res = makeRes()
  api.vote(makeReq({
    method: 'POST',
    url: API_PATHS.vote,
    body: JSON.stringify({ question: 'x' }),
    headers: { host: '127.0.0.1:8790', origin: 'http://127.0.0.1:8790' },
  }), res)
  await tick()
  assert.equal(res.status, 202)
})

test('vote：非法 JSON 请求体返回 500 且带错误信息', async () => {
  const { api } = makeApi()
  const res = makeRes()
  api.vote(makeReq({ method: 'POST', url: API_PATHS.vote, body: '{oops' }), res)
  await tick()
  assert.equal(res.status, 500)
  assert.match(JSON.parse(res.body).error, /JSON/)
})

test('config：返回公开配置且不带敏感词表', async () => {
  const { api } = makeApi()
  const res = makeRes()
  api.config(makeReq({ url: API_PATHS.config }), res)
  await tick()
  assert.equal(res.status, 200)
  const { config } = JSON.parse(res.body)
  assert.equal(config.useWeights, false)
  assert.equal(config.tieBreak, undefined, 'tieBreak 已取消（不存在平票）')
  assert.equal(config.criticalKeywords, undefined)
})
