/**
 * 离线单测：不联网、不调用模型、不依赖 DSH 运行时。
 * 运行：node test/magi.test.mjs
 *
 * 注意本轮的规则变更：三台单元**只能选边**（approve / reject），
 * 因此没有弃权、没有平票，判决只有 承認 / 拒否 / 否決 三种。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { normalizeConfig, DEFAULT_CONFIG } from '../lib/config.js'
import { resolveCriticality } from '../lib/criticality.js'
import { tallyOpinions, VERDICT_LABEL } from '../lib/tally.js'
import { extractJsonObject, normalizeOpinion, coerceAbstention, resolveRoute } from '../lib/llm-bridge.js'
import { Ledger } from '../lib/ledger.js'
import { createBus } from '../lib/bus.js'
import { createVoteRunner } from '../lib/vote.js'
import { buildSystemPrompt, buildUserContent, PERSONAS } from '../lib/personas.js'
import { stubOpinion } from '../lib/stub.js'

const opinion = (unit, stance, confidence = 0.8) => ({ unit, stance, confidence, reason: 'r' })
const approve = (p) => opinion(p.unit, 'approve')
const reject = (p) => opinion(p.unit, 'reject')

/**
 * 假 LLM：**照抄 DSH 运行时的真实 chunk 形态** —— 判别字段是 `type`，`finish.reason` 是对象
 * `{ kind }`，思维链走 `reasoning-delta`（必须被忽略），正文分片走 `text-delta`。
 * 可指定哪些单元失败、以及各单元投什么。
 */
function makeFakeLlm({ failUnits = [], stanceFor, includeReasoning = true, payloadFor } = {}) {
  const callCounts = new Map()
  return {
    llm: {
      stream(options) {
        const system = String(options?.system ?? '')
        const unit = PERSONAS.find((persona) => system.includes(persona.unit))?.unit ?? 'UNKNOWN'
        if (failUnits.includes(unit)) throw new Error(`模拟失败：${unit}`)
        const callIndex = callCounts.get(unit) ?? 0
        callCounts.set(unit, callIndex + 1)
        const custom = typeof payloadFor === 'function' ? payloadFor(unit, callIndex) : null
        const stance = typeof stanceFor === 'function' ? stanceFor(unit) : 'approve'
        const payload = JSON.stringify(custom ?? {
          stance,
          confidence: 0.7,
          reason: `${unit} 的理由`,
          key_factors: ['因素'],
          risks: [],
          caveats: '',
        })
        const half = Math.ceil(payload.length / 2)
        return (async function* () {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          if (includeReasoning) {
            yield { type: 'reasoning-delta', index: 1, text: '（内心活动，不该出现在正文里）' }
          }
          yield { type: 'text-delta', index: 0, text: payload.slice(0, half) }
          yield { type: 'text-delta', index: 0, text: payload.slice(half) }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: payload } }
          yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    },
  }
}

/* ------------------------- 判决只有三种，且没有弃权 ------------------------- */

test('判决集合里没有「保留 / HOLD」', () => {
  assert.deepEqual(Object.keys(VERDICT_LABEL).sort(), ['APPROVE', 'REJECT', 'VETO'])
  assert.equal(VERDICT_LABEL.HOLD, undefined)
})

/* ------------------------------- 计票：normal ------------------------------- */

test('normal 档：2 票赞成即通过', () => {
  const result = tallyOpinions([approve(PERSONAS[0]), approve(PERSONAS[1]), reject(PERSONAS[2])], { criticality: 'normal' })
  assert.equal(result.verdict, 'APPROVE')
  assert.deepEqual(result.counts, { approve: 2, reject: 1 })
  assert.equal(result.unanimity, false)
})

test('normal 档：2 票反对即拒否（非 VETO）', () => {
  const result = tallyOpinions([reject(PERSONAS[0]), approve(PERSONAS[1]), reject(PERSONAS[2])], { criticality: 'normal' })
  assert.equal(result.verdict, 'REJECT')
})

test('normal 档：三票齐否决记 VETO（全票一致也算 unanimity）', () => {
  const result = tallyOpinions(PERSONAS.map(reject), { criticality: 'normal' })
  assert.equal(result.verdict, 'VETO')
  assert.equal(result.unanimity, true, '三票完全一致（含全票否决）都应标记 unanimity')
})

test('normal 档：三票一致赞成标记 unanimity', () => {
  const result = tallyOpinions(PERSONAS.map(approve), { criticality: 'normal' })
  assert.equal(result.verdict, 'APPROVE')
  assert.equal(result.unanimity, true)
})

test('critical 档：全票否决同样是一致', () => {
  const result = tallyOpinions(PERSONAS.map(reject), { criticality: 'critical' })
  assert.equal(result.verdict, 'VETO')
  assert.equal(result.unanimity, true)
  assert.equal(result.counts.reject, 3)
})

test('normal 档：3 票必然形成多数，不存在悬置结果', () => {
  for (let mask = 0; mask < 8; mask += 1) {
    const opinions = PERSONAS.map((persona, index) => ((mask >> index) & 1 ? approve(persona) : reject(persona)))
    const result = tallyOpinions(opinions, { criticality: 'normal' })
    assert.ok(['APPROVE', 'REJECT', 'VETO'].includes(result.verdict), `mask=${mask} 应得到确定判决`)
  }
})

test('normal 档：加权模式可以压倒票数', () => {
  const weighted = tallyOpinions([approve(PERSONAS[0]), reject(PERSONAS[1]), reject(PERSONAS[2])], {
    criticality: 'normal', useWeights: true, weights: { melchior: 5, balthasar: 1, casper: 1 },
  })
  assert.equal(weighted.verdict, 'APPROVE')
})

test('normal 档：加权票数相等按保守默认判拒否（不留悬置）', () => {
  const tied = tallyOpinions([approve(PERSONAS[0]), reject(PERSONAS[1]), reject(PERSONAS[2])], {
    criticality: 'normal', useWeights: true, weights: { melchior: 2, balthasar: 1, casper: 1 },
  })
  assert.equal(tied.verdict, 'REJECT')
  assert.ok(tied.notes.some((note) => note.includes('保守默认')))
})

/* ------------------------------ 计票：critical ------------------------------ */

test('critical 档：2:1 多数赞成也必须否决', () => {
  const result = tallyOpinions([approve(PERSONAS[0]), approve(PERSONAS[1]), reject(PERSONAS[2])], { criticality: 'critical' })
  assert.equal(result.verdict, 'VETO')
})

test('critical 档：3:0 一致才承認', () => {
  const result = tallyOpinions(PERSONAS.map(approve), { criticality: 'critical' })
  assert.equal(result.verdict, 'APPROVE')
  assert.equal(result.unanimity, true)
})

test('critical 档：1:2 否决', () => {
  const result = tallyOpinions([approve(PERSONAS[0]), reject(PERSONAS[1]), reject(PERSONAS[2])], { criticality: 'critical' })
  assert.equal(result.verdict, 'VETO')
})

/* -------------------------------- 档位判定 --------------------------------- */

test('criticality：显式指定优先于敏感词', () => {
  const config = normalizeConfig({}).config
  assert.equal(resolveCriticality({ question: '删除生产库', criticality: 'normal' }, config).source, 'explicit')
  assert.equal(resolveCriticality({ question: '随便问问', criticality: 'critical' }, config).criticality, 'critical')
})

test('criticality：命中敏感词自动升级并回传命中词', () => {
  const config = normalizeConfig({}).config
  const decision = resolveCriticality({ question: '把这份数据上传到公网' }, config)
  assert.equal(decision.criticality, 'critical')
  assert.equal(decision.source, 'keyword')
  assert.ok(decision.matchedKeywords.includes('上传'))
})

test('criticality：普通议题保持 normal', () => {
  const config = normalizeConfig({}).config
  const decision = resolveCriticality({ question: '这两个变量名哪个更清楚' }, config)
  assert.equal(decision.criticality, 'normal')
  assert.equal(decision.source, 'default')
})

/* -------------------------------- 配置归一化 -------------------------------- */

test('config：非法值回落并记录 warnings（tieBreak 已取消）', () => {
  const { config, warnings } = normalizeConfig({
    tieBreak: 'escalate',
    timeoutMs: -5,
    ui: 'not-an-object',
    criticalKeywords: 'nope',
  })
  assert.equal(config.tieBreak, undefined, 'tieBreak 已从配置中移除')
  assert.equal(config.timeoutMs, DEFAULT_CONFIG.timeoutMs)
  assert.deepEqual(config.ui, { ...DEFAULT_CONFIG.ui })
  assert.deepEqual(config.criticalKeywords, [...DEFAULT_CONFIG.criticalKeywords])
  assert.ok(warnings.length >= 3)
})

test('config：只给 provider 不给 model 时忽略 provider', () => {
  const { config, warnings } = normalizeConfig({ provider: 'deepseek-account' })
  assert.equal(config.provider, '')
  assert.ok(warnings.some((w) => w.includes('model')))
})

test('config：abilities 默认启用，越界值回落并告警', () => {
  const defaults = normalizeConfig({}).config
  assert.equal(defaults.abilities.enabled, true)
  assert.equal(defaults.abilities.maxToolCallsPerUnit, 2)

  const { config, warnings } = normalizeConfig({
    abilities: {
      enabled: true,
      maxToolCallsPerUnit: 99,
      scriptTimeoutMs: 1,
      maxOutputChars: 10,
      labDir: ' my-lab ',
    },
  })
  assert.equal(config.abilities.maxToolCallsPerUnit, DEFAULT_CONFIG.abilities.maxToolCallsPerUnit)
  assert.equal(config.abilities.scriptTimeoutMs, DEFAULT_CONFIG.abilities.scriptTimeoutMs)
  assert.equal(config.abilities.maxOutputChars, DEFAULT_CONFIG.abilities.maxOutputChars)
  assert.equal(config.abilities.labDir, 'my-lab')
  assert.ok(warnings.some((w) => w.includes('abilities.maxToolCallsPerUnit')))
})

/* ------------------------------ 模型输出解析 ------------------------------- */

test('extractJsonObject：容忍代码围栏与前后文字', () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(extractJsonObject('好的：{"a":{"b":"}"}} 完毕'), { a: { b: '}' } })
  assert.equal(extractJsonObject('没有 JSON'), null)
  assert.equal(extractJsonObject('{"a":'), null)
})

test('normalizeOpinion：契约校验', () => {
  const persona = PERSONAS[0]
  const ok = normalizeOpinion({
    stance: 'APPROVE',
    confidence: 1.4,
    reason: '  证据充分  ',
    key_factors: ['a', 'b', 'c', 'd'],
    risks: [],
    caveats: 'x',
  }, persona)
  assert.equal(ok.problems.length, 0)
  assert.equal(ok.opinion.stance, 'approve')
  assert.equal(ok.opinion.confidence, 1)
  assert.equal(ok.opinion.reason, '证据充分')
  assert.equal(ok.opinion.key_factors.length, 3)

  const bad = normalizeOpinion({ stance: 'maybe', confidence: 'high', reason: '' }, persona)
  assert.equal(bad.opinion, null)
  assert.equal(bad.problems.length, 3)
})

test('normalizeOpinion：弃权被明确拒绝', () => {
  const persona = PERSONAS[2]
  for (const value of ['abstain', 'ABSTAIN', 'hold', '保留', '弃权', '中立']) {
    const result = normalizeOpinion({ stance: value, confidence: 0.5, reason: '我不想选' }, persona)
    assert.equal(result.opinion, null, `${value} 不应被接受`)
    assert.ok(result.problems.some((p) => p.includes('弃权')), `${value} 应报「不允许弃权」`)
  }
})

test('coerceAbstention：两次都弃权时折算为拒否（保留原话）', () => {
  const persona = PERSONAS[1]
  const coerced = coerceAbstention({ stance: 'abstain', reason: '这事与我无关' }, persona)
  assert.equal(coerced.stance, 'reject')
  assert.equal(coerced.coercedFromAbstention, true)
  assert.ok(coerced.reason.includes('这事与我无关'))
  assert.ok(coerced.reason.includes('拒否'))
  assert.equal(coerceAbstention({ stance: 'approve' }, persona), null)
})

/* ------------------------------- 模型路由解析 ------------------------------- */

test('resolveRoute：显式配置优先于默认模型服务', () => {
  const { config } = normalizeConfig({ provider: 'p1', model: 'm1' })
  const ctx = { agentDefaultModel: { currentSelection: () => ({ provider: 'p2', model: 'm2' }) } }
  assert.deepEqual(resolveRoute(ctx, config), { provider: 'p1', model: 'm1', source: 'config' })
})

test('resolveRoute：未注入服务时「属性访问抛错」也不致命（cordis 真实行为）', () => {
  // cordis 的 ctx 是代理：访问未注入的服务会抛 cannot get property ... without inject
  const guarded = new Proxy({}, {
    get(_target, property) {
      if (property === 'get' || property === 'reflect' || property === 'llm' || property === 'then') return undefined
      throw new Error(`cannot get property "${String(property)}" without inject`)
    },
  })
  const { config } = normalizeConfig({})
  let route
  assert.doesNotThrow(() => { route = resolveRoute(guarded, config) })
  assert.equal(route.source, 'unresolved')
})

test('resolveRoute：未注入时可经 ctx.get 取到路由', () => {
  const ctx = {
    get: (name) => (name === 'agentDefaultModel'
      ? { currentSelection: () => ({ provider: 'from-get', model: 'm-get' }) }
      : undefined),
  }
  assert.deepEqual(resolveRoute(ctx, normalizeConfig({}).config), {
    provider: 'from-get',
    model: 'm-get',
    source: 'session-default',
  })
})

/* ---------------------------------- 账本 ---------------------------------- */

test('账本：编号自增、追加、读取、按 key 查询', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'magi-ledger-'))
  try {
    const ledger = new Ledger({ dir })
    assert.equal(await ledger.nextSeq(), 1)
    assert.equal(await ledger.nextSeq(), 2)
    await ledger.append({ key: 'magi-0001-aaaaaa', id: 'MAGI-DECISION No.0001', createdAt: '2026-01-01T00:00:00Z', verdict: 'APPROVE', criticality: 'normal', question: 'q1' })
    await ledger.append({ key: 'magi-0002-bbbbbb', id: 'MAGI-DECISION No.0002', createdAt: '2026-01-01T00:01:00Z', verdict: 'VETO', criticality: 'critical', question: 'q2' })

    const recent = await ledger.read(10)
    assert.equal(recent.length, 2)
    assert.equal(recent[0].key, 'magi-0002-bbbbbb', '最新的记录排在最前')

    const found = await ledger.get('magi-0001-aaaaaa')
    assert.equal(found.verdict, 'APPROVE')
    assert.equal(await ledger.get('magi-9999-zzzzzz'), undefined)

    const summary = await ledger.summary(1)
    assert.equal(summary.length, 1)
    assert.equal(summary[0].key, 'magi-0002-bbbbbb')

    const reopened = new Ledger({ dir })
    assert.equal(await reopened.nextSeq(), 3)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('账本：损坏行不影响读取', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'magi-ledger-bad-'))
  try {
    const ledger = new Ledger({ dir })
    await ledger.init()
    await appendFile(ledger.ledgerPath, '{ 这不是 JSON\n', 'utf8')
    await ledger.append({ key: 'magi-0001-aaaaaa', id: 'x', createdAt: 'now', verdict: 'REJECT', criticality: 'normal', question: 'q' })
    const items = await ledger.read(10)
    assert.equal(items.length, 1)
    assert.equal(items[0].key, 'magi-0001-aaaaaa')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('账本：手动清空记录与索引，但不回收已发出的编号', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'magi-ledger-clear-'))
  try {
    const ledger = new Ledger({ dir })
    assert.equal(await ledger.nextSeq(), 1)
    assert.equal(await ledger.nextSeq(), 2)
    await ledger.append({ key: 'magi-0001-aaaaaa', id: 'MAGI-DECISION No.0001', seq: 1, createdAt: '2026-01-01T00:00:00Z', verdict: 'APPROVE', criticality: 'normal', tally: { approve: 3, reject: 0 }, question: 'q1' })
    await ledger.append({ key: 'magi-0002-bbbbbb', id: 'MAGI-DECISION No.0002', seq: 2, createdAt: '2026-01-01T00:01:00Z', verdict: 'VETO', criticality: 'critical', tally: { approve: 1, reject: 2 }, question: 'q2' })

    const cleared = await ledger.clear()
    assert.deepEqual(cleared, { removed: 2, lastSeq: 2 })
    assert.deepEqual(await ledger.read(10), [])
    assert.deepEqual(await ledger.summary(10), [])

    // 再清一次：0 条，不报错
    assert.deepEqual(await ledger.clear(), { removed: 0, lastSeq: 2 })

    // 编号继续递增，不回到 0001
    assert.equal(await ledger.nextSeq(), 3)
    await ledger.append({ key: 'magi-0003-cccccc', id: 'MAGI-DECISION No.0003', seq: 3, createdAt: '2026-01-01T00:02:00Z', verdict: 'REJECT', criticality: 'normal', tally: { approve: 1, reject: 2 }, question: 'q3' })
    const after = await ledger.read(10)
    assert.equal(after.length, 1)
    assert.equal(after[0].key, 'magi-0003-cccccc')
    // 索引摘要同步补上 seq 与票数
    const summary = await ledger.summary(10)
    assert.equal(summary[0].seq, 3)
    assert.deepEqual(summary[0].tally, { approve: 1, reject: 2 })

    const reopened = new Ledger({ dir })
    assert.equal(await reopened.nextSeq(), 4)
    assert.equal((await reopened.summary(10)).length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

/* ---------------------------------- 总线 ---------------------------------- */

test('总线：订阅、退订与历史保留', () => {
  const bus = createBus({ historySize: 3 })
  const seen = []
  const off = bus.subscribe((frame) => seen.push(frame.type))
  bus.publish({ type: 'a' })
  bus.publish({ type: 'b' })
  off()
  bus.publish({ type: 'c' })
  assert.deepEqual(seen, ['a', 'b'])
  assert.deepEqual(bus.recent().map((f) => f.type), ['a', 'b', 'c'])
  bus.publish({ type: 'd' })
  assert.deepEqual(bus.recent().map((f) => f.type), ['b', 'c', 'd'], '历史按容量裁剪')
})

test('总线：新一次表决开始时清空回放缓冲', () => {
  const bus = createBus()
  bus.publish({ type: 'verdict', id: 'old' })
  bus.publish({ type: 'unit', id: 'old' })
  bus.publish({ type: 'vote', id: 'new' })
  bus.publish({ type: 'unit', id: 'new' })
  assert.deepEqual(bus.recent().map((f) => f.type), ['vote', 'unit'], '只保留当前这一次表决的帧')
  assert.ok(bus.recent().every((f) => f.id === 'new'))
})

/* -------------------------------- 人格提示词 -------------------------------- */

test('人格：critical 档会写入「需三票一致」的要求', () => {
  const normal = buildSystemPrompt(PERSONAS[0], { criticality: 'normal' })
  const critical = buildSystemPrompt(PERSONAS[0], { criticality: 'critical' })
  assert.ok(!normal.includes('一致同意'))
  assert.ok(critical.includes('一致同意'))
  assert.ok(normal.includes('JSON'), '始终附带输出契约')
})

test('人格：输出契约里只有 approve / reject，并明确没有弃权', () => {
  for (const persona of PERSONAS) {
    const prompt = buildSystemPrompt(persona, { criticality: 'normal' })
    assert.ok(prompt.includes('"stance": "approve" | "reject"'), `${persona.unit} 的契约应是二选一`)
    assert.ok(prompt.includes('没有弃权'), `${persona.unit} 的契约应写明没有弃权`)
    assert.ok(!prompt.includes('abstain'), `${persona.unit} 的契约不应再出现 abstain`)
  }
})

test('人格：用户消息带上计票规则', () => {
  const text = buildUserContent({ question: '要不要删库', criticality: 'critical' })
  assert.ok(text.includes('要不要删库'))
  assert.ok(text.includes('三票一致'))
})

test('桩模型：同输入同输出，且只投赞成或反对', () => {
  const request = { question: '要不要把服务迁到新集群', criticality: 'normal' }
  const first = stubOpinion(PERSONAS[0], request)
  const second = stubOpinion(PERSONAS[0], request)
  assert.deepEqual(first, second, '确定性：同输入同输出')
  for (const persona of PERSONAS) {
    assert.ok(['approve', 'reject'].includes(stubOpinion(persona, request).stance))
    assert.ok(['approve', 'reject'].includes(stubOpinion(persona, { ...request, criticality: 'critical' }).stance))
  }
})

/* ------------------------------ 端到端（桩模型） ----------------------------- */

async function runStubVote(request, configOverrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'magi-vote-'))
  const { config } = normalizeConfig({ llmMode: 'stub', stubDelayMs: 0, ledgerDir: dir, ...configOverrides })
  const ledger = new Ledger({ dir, historyLimit: config.historyLimit })
  const bus = createBus()
  const frames = []
  bus.subscribe((frame) => frames.push(frame))
  const runner = createVoteRunner({ ctx: {}, config, ledger, bus, logger: { warn() {}, info() {} } })
  const result = await runner.runVote(request)
  return { result, frames, dir, ledger }
}

test('端到端（桩）：一次 normal 表决产出完整结果并落账', async () => {
  const { result, frames, dir, ledger } = await runStubVote({ question: '这个函数要不要拆成两个' })
  try {
    assert.equal(result.criticality, 'normal')
    assert.match(result.id, /^MAGI-DECISION No\.0001$/)
    assert.equal(result.opinions.length, 3)
    assert.ok(['APPROVE', 'REJECT', 'VETO'].includes(result.verdict))
    assert.equal(result.tieBreakUsed, undefined, '不再有平票处理')
    assert.ok(result.opinions.every((o) => ['approve', 'reject'].includes(o.stance)))

    // 生效人格的来源与哈希要随结果落账（未配置 personasDir 时应全是内置默认）
    assert.equal(result.personaSources.length, 3)
    assert.ok(result.personaSources.every((entry) => entry.source === 'builtin'))
    assert.ok(result.personaSources.every((entry) => typeof entry.sha256 === 'string' && entry.sha256.length === 12))
    assert.ok(result.personaSources.every((entry) => entry.chars > 100))

    const kinds = frames.map((frame) => frame.type)
    assert.equal(kinds[0], 'vote')
    assert.ok(kinds.includes('unit-delta'), '应有逐字增量帧')
    assert.equal(kinds.filter((k) => k === 'unit-done').length, 3)
    assert.equal(kinds.at(-1), 'verdict')
    assert.equal(frames[0].tieBreak, undefined)

    const stored = await ledger.read(1)
    assert.equal(stored[0].key, result.key)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（桩）：敏感议题自动升级为 critical 并写入 notes', async () => {
  const { result, frames, dir } = await runStubVote({ question: '要不要删除生产库里的旧表' })
  try {
    assert.equal(result.criticality, 'critical')
    assert.equal(result.criticalitySource, 'keyword')
    assert.ok(result.notes.some((note) => note.includes('敏感词')))
    // critical 档下只有 3:0 才可能是 APPROVE
    if (result.tally.approve === 3) assert.equal(result.verdict, 'APPROVE')
    else assert.equal(result.verdict, 'VETO')
    const voteFrame = frames[0]
    assert.equal(voteFrame.criticality, 'critical')
    assert.equal(voteFrame.criticality, 'critical')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

/* ---------------------- 端到端（假 LLM）：失败与弃权处理 ---------------------- */

async function runFakeVote(ctx, request, configOverrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'magi-fake-'))
  const { config } = normalizeConfig({ llmMode: 'live', ledgerDir: dir, timeoutMs: 5000, ...configOverrides })
  const ledger = new Ledger({ dir })
  const bus = createBus()
  // 默认给一个可用的模型路由；想测「路由缺失」的用例把它显式置空即可
  const routed = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'test-provider', model: 'test-model' }) },
    ...ctx,
  }
  const runner = createVoteRunner({ ctx: routed, config, ledger, bus, logger: { warn() {}, info() {} } })
  return { run: () => runner.runVote(request), dir }
}

test('端到端（假 LLM）：单台失败按保守默认记拒否，判决仍然确定', async () => {
  const { run, dir } = await runFakeVote(makeFakeLlm({ failUnits: ['MELCHIOR-1'] }), { question: '要不要调整默认超时' })
  try {
    const result = await run()
    const failed = result.opinions.find((o) => o.unit === 'MELCHIOR-1')
    assert.equal(failed.stance, 'reject')
    assert.equal(failed.degraded, true)
    assert.ok(failed.reason.includes('拒否'))
    assert.ok(result.notes.some((note) => note.includes('MELCHIOR-1')))
    assert.equal(result.verdict, 'APPROVE', '另外两票赞成 → 多数决通过')
    assert.equal(result.tally.reject, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（假 LLM）：三台全失败则报错，不伪造判决', async () => {
  const { run, dir } = await runFakeVote(makeFakeLlm({ failUnits: ['MELCHIOR-1', 'BALTHASAR-2', 'CASPER-3'] }), { question: '这会不会崩' })
  try {
    await assert.rejects(() => run(), /全部调用失败/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（假 LLM）：模型坚持弃权时折算为拒否，而不是丢票', async () => {
  const { run, dir } = await runFakeVote(makeFakeLlm({ stanceFor: () => 'abstain' }), { question: '要不要改这段注释' })
  try {
    const result = await run()
    assert.equal(result.verdict, 'VETO', '三票都折算成拒否 → 三票齐否决')
    assert.equal(result.tally.reject, 3)
    assert.equal(result.tally.approve, 0)
    assert.ok(result.opinions.every((o) => o.coercedFromAbstention === true))
    assert.ok(result.opinions.every((o) => o.error === undefined), '这不是调用失败，而是按规则折算')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（假 LLM）：CASPER-3 可以先做欲望读数，再给出最终意见', async () => {
  const ctx = makeFakeLlm({
    stanceFor: (unit) => (unit === 'CASPER-3' ? 'reject' : 'approve'),
    payloadFor: (unit, callIndex) => {
      if (unit !== 'CASPER-3' || callIndex > 0) return null
      return {
        action: 'tool',
        tool: 'desire_map',
        note: '两个选项都想要，我先看清自己在要什么',
        args: {
          question: '要不要现在定下来',
          options: [
            { id: 'A', label: '现在答应', fit: 'partial', violatesRefusal: false, price: '一次难看的对话' },
            { id: 'B', label: '继续等', fit: 'high', violatesRefusal: false, price: '关系可能冷下来' },
          ],
          want: '不再被当成可以随时推迟的人',
          wantBehindWant: '我的时间也算数',
          price: '一次难看的对话，但不替别人通宵',
          refusals: ['不接受事后被说成是我自己同意的'],
          owner: 'mine',
          visibility: 'yes',
          affect: '想到答应胃是紧的，想到拒绝反而松一口气',
          regret: { tenMinutes: '会有点怕', tenMonths: '会觉得自己清醒', tenYears: '会记得没有把自己卖便宜' },
          forcedChoice: 'B',
        },
      }
    },
  })
  const { run, dir } = await runFakeVote(ctx, { question: '要不要现在定下来' }, {
    abilities: { enabled: true, maxToolCallsPerUnit: 2 },
  })
  try {
    const result = await run()
    const casper = result.opinions.find((opinion) => opinion.unit === 'CASPER-3')
    assert.equal(casper.tool_calls.length, 1)
    assert.equal(casper.tool_calls[0].tool, 'desire_map')
    assert.equal(casper.tool_calls[0].status, 'ok')
    assert.equal(casper.tool_calls[0].note, '两个选项都想要，我先看清自己在要什么')
    assert.equal(casper.tool_calls[0].readout.want, '不再被当成可以随时推迟的人')
    assert.equal(casper.tool_calls[0].readout.forcedChoice, 'B')
    assert.ok(!casper.reason.includes('"action"'), '工具请求不应留在最终理由里')
    assert.equal(casper.reason, 'CASPER-3 的理由')
    assert.ok(result.notes.some((note) => note.includes('子功能')), 'notes 应记录子功能调用')
    assert.equal(result.tally.reject, 1)
    assert.equal(result.verdict, 'APPROVE')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（假 LLM）：MELCHIOR-1 可以跑 JavaScript 再给出意见', async () => {
  const previous = process.env.MAGI_NODE
  process.env.MAGI_NODE = process.execPath
  const ctx = makeFakeLlm({
    payloadFor: (unit, callIndex) => {
      if (unit !== 'MELCHIOR-1' || callIndex > 0) return null
      return { action: 'tool', tool: 'run_script', args: { engine: 'javascript', code: 'console.log(6 * 7)' } }
    },
  })
  const { run, dir } = await runFakeVote(ctx, { question: '这个数算得对吗' }, {
    abilities: { enabled: true, maxToolCallsPerUnit: 1, scriptTimeoutMs: 5000 },
  })
  try {
    const result = await run()
    const melchior = result.opinions.find((opinion) => opinion.unit === 'MELCHIOR-1')
    assert.equal(melchior.tool_calls.length, 1)
    assert.equal(melchior.tool_calls[0].tool, 'run_script')
    assert.equal(melchior.tool_calls[0].engine, 'javascript')
    assert.equal(melchior.tool_calls[0].status, 'ok')
    assert.match(melchior.tool_calls[0].outputPreview, /42/)
    assert.equal(melchior.reason, 'MELCHIOR-1 的理由')
  } finally {
    if (previous === undefined) delete process.env.MAGI_NODE
    else process.env.MAGI_NODE = previous
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（假 LLM）：abilities.enabled=false 时工具请求按格式错误降级', async () => {
  const ctx = makeFakeLlm({
    payloadFor: (unit) => (unit === 'CASPER-3'
      ? { action: 'tool', tool: 'desire_map', args: {} }
      : null),
  })
  const { run, dir } = await runFakeVote(ctx, { question: '要不要现在定下来' }, {
    abilities: { enabled: false },
  })
  try {
    const result = await run()
    const casper = result.opinions.find((opinion) => opinion.unit === 'CASPER-3')
    assert.equal(casper.degraded, true)
    assert.equal(casper.tool_calls.length, 0)
    assert.match(casper.reason, /拒否/)
    assert.equal(result.verdict, 'APPROVE', '另外两票赞成仍按多数决通过')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（真实 chunk 形态）：text-delta 累积、reasoning 被忽略、block-end 不重复计入', async () => {
  const { run, dir } = await runFakeVote(
    makeFakeLlm({ stanceFor: (unit) => (unit === 'CASPER-3' ? 'reject' : 'approve') }),
    { question: '要不要给这个模块补一层缓存' },
  )
  try {
    const result = await run()
    assert.equal(result.opinions.length, 3)
    assert.ok(result.opinions.every((o) => o.error === undefined), '不该有任何单元失败')
    for (const opinion of result.opinions) {
      assert.ok(opinion.reason.includes('的理由'), `${opinion.unit} 的正文应来自 text-delta`)
    }
    assert.ok(
      result.opinions.every((o) => !o.reason.includes('内心活动')),
      'reasoning-delta 不得混进正文',
    )
    assert.equal(result.verdict, 'APPROVE', 'MELCHIOR/BALTHASAR 赞成、CASPER 反对 → 多数决通过')
    assert.equal(result.tally.approve, 2)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（真实 chunk 形态）：流以 reason.kind=error 结束时如实报出错误', async () => {
  const ctx = {
    llm: {
      stream() {
        return (async function* () {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: '凭据无效' } } }
        })()
      },
    },
  }
  const { run, dir } = await runFakeVote(ctx, { question: '这会不会失败' })
  try {
    await assert.rejects(() => run(), (error) => {
      assert.match(error.message, /AUTH|凭据无效/)
      return true
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（真实 chunk 形态）：provider 解析不到时给出可读错误，而不是 NO_ADAPTER', async () => {
  const { run, dir } = await runFakeVote(
    { llm: { stream() { throw new Error('不该被调用') } }, agentDefaultModel: null },
    { question: 'x' },
  )
  try {
    await assert.rejects(() => run(), /无法确定 provider\/model/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端（桩）：空议题直接报错', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'magi-empty-'))
  try {
    const { config } = normalizeConfig({ llmMode: 'stub', ledgerDir: dir })
    const runner = createVoteRunner({
      ctx: {},
      config,
      ledger: new Ledger({ dir }),
      bus: createBus(),
      logger: { warn() {}, info() {} },
    })
    await assert.rejects(() => runner.runVote({ question: '   ' }), /question 不能为空/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
