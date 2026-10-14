/**
 * 模型调用适配层。
 *
 * 这一层是**唯一**与 DSH LLM 服务耦合的地方，做了两件事：
 * 1. 把「一次人格调用」收敛成一个函数，方便安装后按实际 API 微调而不用改决策逻辑；
 * 2. 对不确定之处全部做**运行时探测 + 优雅降级**（消息工厂、chunk 字段名、路由来源），
 *    避免加载期就因某个字段名不符而整包失败。
 *
 * 已知契约（来自对 app.asar 内官方插件的实测）：
 *   ctx.llm.stream(options) -> AsyncIterable，chunk 序列以 finish 终止；
 *   options 至少含 { provider, model, messages, system, maxTokens, signal }；
 *   usage chunk 形如 { inputTokens, outputTokens, totalTokens }。
 *
 * ⚠️ 安装后需要实测确认的点（本文件已把它们集中在一处）：
 *   - messages 是否必须由 @deepseek-ai/dsh-llm 的工厂函数构造（见 resolveUserMessage）；
 *   - 是否接受额外字段 temperature（由 config.passTemperature 控制，默认关闭）；
 *   - sessionId 是否必填（工具路径可从 exec 拿到会话；HTTP 路径没有会话，见 vote.js）。
 */

import { buildSystemPrompt, buildUserContent } from './personas.js'
import { resolveContractPrompt, resolvePersonaPrompt } from './persona-files.js'
import { stubOpinion, streamText } from './stub.js'

let userMessageFactoryPromise

/** 取 dsh-llm 的消息工厂（`createUserMessage`，已核实存在于导出表中）；取不到就回落为普通对象。 */
async function resolveUserMessage() {
  if (!userMessageFactoryPromise) {
    userMessageFactoryPromise = (async () => {
      try {
        const mod = await import('@deepseek-ai/dsh-llm')
        return typeof mod?.createUserMessage === 'function' ? mod.createUserMessage : null
      } catch {
        return null
      }
    })()
  }
  const factory = await userMessageFactoryPromise
  return (text) => {
    const content = [{ type: 'text', text }]
    if (factory) {
      try {
        return factory({ content, source: { kind: 'dsh-plugin-magi' } })
      } catch {
        // 落到普通对象
      }
    }
    return { role: 'user', content }
  }
}

/**
 * 解析本次调用使用的 provider / model：显式配置优先，否则读运行时的默认模型服务。
 *
 * `agentDefaultModel` 已写进 `inject`，所以 `ctx.agentDefaultModel` 正常可用；
 * 但仍保留 `ctx.get` 兜底与 try/catch —— cordis 里访问未注入的服务是会抛错的。
 * 解析不到时调用方会直接给出可读错误（否则运行时只会抛 NO_ADAPTER 把原因埋掉）。
 */
export function resolveRoute(ctx, config) {
  if (config.provider && config.model) return { provider: config.provider, model: config.model, source: 'config' }

  const candidates = []
  try {
    if (ctx?.agentDefaultModel) candidates.push(ctx.agentDefaultModel)
  } catch {
    // 未注入：跳过
  }
  try {
    const viaGet = ctx?.get?.('agentDefaultModel')
    if (viaGet) candidates.push(viaGet)
  } catch {
    // ctx.get 不可用就跳过
  }

  for (const service of candidates) {
    try {
      const selection = service?.currentSelection?.()
      if (selection?.provider && selection?.model) {
        return { provider: selection.provider, model: selection.model, source: 'session-default' }
      }
    } catch {
      // 试下一个候选
    }
  }
  return { source: 'unresolved' }
}

/** 从 chunk 里取增量正文。判别字段是 `type`（实测），reasoning / tool-call 一律不计入。 */
function chunkText(chunk) {
  if (!chunk || typeof chunk !== 'object') return ''
  if (chunk.type !== 'text-delta') return ''
  return typeof chunk.text === 'string' ? chunk.text : ''
}

/** 兜底：只给完整块（block-end）而不给增量的适配器，用块正文。 */
function chunkBlockText(chunk) {
  if (chunk?.type !== 'block-end') return ''
  return chunk.block?.type === 'text' && typeof chunk.block.text === 'string' ? chunk.block.text : ''
}

/** 取出 chunk 里的 usage（运行时的统一字段名）。 */
function chunkUsage(chunk) {
  const usage = chunk?.usage
  if (!usage || typeof usage !== 'object') return undefined
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  }
}

/**
 * 终止 chunk 是否代表失败。实测形态：`{ type: 'finish', reason: { kind: 'stop'|'error'|'aborted'|'max-tokens'|'tool-calls', failure? } }`。
 */
function terminalFailure(chunk) {
  if (!chunk || chunk.type !== 'finish') return null
  const kind = chunk.reason?.kind
  if (kind === 'error' || kind === 'aborted') {
    const failure = chunk.reason?.failure
    const message = typeof failure === 'string' ? failure : failure?.message
    return new Error(message ? `${kind}: ${message}` : String(kind))
  }
  if (kind === 'max-tokens') return new Error('输出达到 maxTokens 上限，JSON 可能被截断')
  if (kind === 'tool-calls') return new Error('模型意外发起了工具调用')
  return null
}

/** 从模型输出里抠出第一个平衡的 JSON 对象。 */
export function extractJsonObject(text) {
  if (typeof text !== 'string') return null
  let body = text.trim()
  body = body.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = body.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < body.length; i += 1) {
    const char = body[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

const asStringList = (value, cap) => (Array.isArray(value)
  ? value
      .filter((item) => typeof item === 'string' && item.trim() !== '')
      .slice(0, cap)
      .map((item) => item.trim().slice(0, 80))
  : [])

/** 模型可能用来「弃权」的写法 —— 本系统不允许弃权，一律折算成选边。 */
const ABSTAIN_WORDS = new Set(['abstain', 'hold', 'reserve', 'defer', 'neutral', '弃权', '棄權', '保留', '中立'])

/**
 * 把模型的 stance 归一到 approve / reject / abstain / ''（无法识别）。
 * 契约要求字面 approve|reject；这里额外认几种最常见的同义写法，避免因措辞白白重试。
 */
function normalizeStance(value) {
  if (typeof value !== 'string') return ''
  const stance = value.trim().toLowerCase()
  if (stance === 'approve' || stance === 'yes' || stance === '同意' || stance === '承認') return 'approve'
  if (stance === 'reject' || stance === 'no' || stance === '反对' || stance === '拒否') return 'reject'
  if (ABSTAIN_WORDS.has(stance)) return 'abstain'
  return ''
}

/**
 * 兜底：模型两次都坚持弃权时，按规则折算为**拒否**。
 * 理由文本原样保留并加注，让读结果的人知道这一票是怎么来的。
 */
export function coerceAbstention(raw, persona) {
  if (!raw || typeof raw !== 'object') return null
  if (normalizeStance(raw.stance) !== 'abstain') return null
  const reason = typeof raw.reason === 'string' && raw.reason.trim() !== ''
    ? raw.reason.trim().slice(0, 500)
    : '单元拒绝选边'
  return {
    unit: persona.unit,
    stance: 'reject',
    confidence: 0.5,
    reason: `${reason}（本单元未按规则选边，已按保守默认记为拒否）`,
    key_factors: asStringList(raw.key_factors, 3),
    risks: asStringList(raw.risks, 3),
    caveats: typeof raw.caveats === 'string' ? raw.caveats.trim().slice(0, 200) : '',
    coercedFromAbstention: true,
  }
}

/**
 * 校验并归一化一个单元的意见。
 * @returns {{ opinion: object | null, problems: string[] }}
 */
export function normalizeOpinion(raw, persona) {
  const problems = []
  if (!raw || typeof raw !== 'object') return { opinion: null, problems: ['返回值不是 JSON 对象'] }

  const stance = normalizeStance(raw.stance)
  if (stance === '') {
    problems.push(`stance 必须字面是 approve 或 reject（本系统没有弃权），收到 ${JSON.stringify(raw.stance)}`)
  } else if (stance === 'abstain') {
    problems.push('不允许弃权：必须选边，approve 或 reject')
  }

  let confidence = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence)
  if (!Number.isFinite(confidence)) {
    problems.push('confidence 不是数字')
    confidence = 0.5
  }
  confidence = Math.min(1, Math.max(0, Math.round(confidence * 100) / 100))

  const reason = typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 500) : ''
  if (reason === '') problems.push('reason 为空')

  if (problems.length > 0) return { opinion: null, problems }

  return {
    opinion: {
      unit: persona.unit,
      stance,
      confidence,
      reason,
      key_factors: asStringList(raw.key_factors, 3),
      risks: asStringList(raw.risks, 3),
      caveats: typeof raw.caveats === 'string' ? raw.caveats.trim().slice(0, 200) : '',
    },
    problems: [],
  }
}

/**
 * 组装一条**可诊断**的失败说明：只说「不是 JSON」在真实运行时里帮不上忙，
 * 所以这里把「收到了多少字符、出现过哪些 chunk 类型、流本身是否报错」都带上，
 * 并附上原始输出的开头一段 —— 这条信息会一路进到工具结果与结果 notes 里。
 */
function describeFailure({ problems, accumulated, chunkKinds, streamError, route, reasoningPreview }) {
  const kinds = chunkKinds.size === 0
    ? '（一个 chunk 都没收到）'
    : [...chunkKinds.entries()].map(([kind, count]) => `${kind}×${count}`).join(', ')
  const preview = accumulated.trim() === ''
    ? '（正文为空）'
    : JSON.stringify(accumulated.trim().slice(0, 200))
  const reason = problems.length > 0 ? problems.join('; ') : '模型没有返回可解析的 JSON'
  return [
    reason,
    `收到正文 ${accumulated.length} 字符；chunk：${kinds}`,
    `正文开头：${preview}`,
    // 正文为空时，思维链往往是唯一线索（例如推理吃光了 token 预算）
    accumulated.trim() === '' && reasoningPreview.trim() !== ''
      ? `思维链开头：${JSON.stringify(reasoningPreview.trim().slice(0, 160))}`
      : null,
    streamError ? `流错误：${errorMessage(streamError)}` : null,
    `路由：${route?.provider ?? '?'} / ${route?.model ?? '?'}（${route?.source ?? '?'}）`,
  ].filter(Boolean).join(' | ')
}

const errorMessage = (error) => (error instanceof Error ? error.message : String(error))

/**
 * 调用单个单元。返回 `{ opinion, raw, latencyMs, tokens, route }`；
 * 失败时抛出错误，由上层按保守默认记为拒否。
 *
 * @param {{
 *   ctx: any, config: any, persona: any,
 *   request: { question: string, context?: string, criticality: 'normal'|'critical' },
 *   signal?: AbortSignal, onDelta?: (text: string) => void,
 *   sessionId?: string, logger?: any,
 * }} params
 */
export async function callUnit(params) {
  const { ctx, config, persona, request, signal, onDelta, sessionId, logger } = params
  const startedAt = Date.now()
  const makeUserMessage = await resolveUserMessage()
  const route = resolveRoute(ctx, config)

  // 没有 provider/model 时不要盲调运行时：它会抛 NO_ADAPTER，把真正的原因埋掉
  if (config.llmMode !== 'stub' && (!route.provider || !route.model)) {
    throw new Error(
      '无法确定 provider/model：请在 profile 的 cordis.patch.yml 里给 magi 行显式配置 provider 与 model，' +
      '或确认 agentDefaultModel 服务可用（agent-default-model 行已启用）',
    )
  }

  // 人格正文与公共契约：优先外部文件，其次内置默认（每票都记哈希，便于追溯何时被改）
  const resolved = await resolvePersonaPrompt(config.personasDir, persona, { logger })
  const contract = await resolveContractPrompt(config.personasDir, { logger })
  const personaUsed = {
    unit: persona.unit,
    source: resolved.source,
    sha256: resolved.sha256,
    ...(resolved.path ? { path: resolved.path } : {}),
    chars: resolved.prompt.length,
    contractSource: contract.source,
    contractSha256: contract.sha256,
  }

  const system = buildSystemPrompt(
    { ...persona, prompt: resolved.prompt },
    { criticality: request.criticality },
    { contract: contract.prompt },
  )
  const userText = buildUserContent(request)

  let accumulated = ''
  let blockFallback = ''
  let reasoningPreview = ''
  let lastError = null
  let lastParsed = null
  let tokens
  let streamError = null
  const chunkKinds = new Map()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    accumulated = ''
    blockFallback = ''
    reasoningPreview = ''
    lastError = null

    if (config.llmMode === 'stub') {
      const stub = stubOpinion(persona, request)
      const text = JSON.stringify(stub)
      for await (const chunk of streamText(text, { signal, delayMs: config.stubDelayMs })) {
        accumulated += chunk
        onDelta?.(chunk)
      }
      const parsed = extractJsonObject(accumulated)
      lastParsed = parsed
      const { opinion, problems } = normalizeOpinion(parsed, persona)
      if (opinion) {
        return { opinion, raw: accumulated, latencyMs: Date.now() - startedAt, tokens, route: { ...route, source: 'stub' }, personaUsed }
      }
      lastError = new Error(`stub 输出不合契约：${problems.join('; ')}`)
      break
    }

    const truncated = /maxTokens|max-tokens|截断/.test(lastError?.message ?? '')
    const messages = [makeUserMessage(attempt === 0
      ? userText
      : `${userText}\n\n【上一次的输出不合契约】${lastError?.message ?? '格式错误'}\n` +
        '请只返回一个合法 JSON 对象，且 stance 必须是 approve 或 reject —— 本系统没有弃权、没有保留。' +
        (truncated ? '\n上一次因为推理过长被截断：这次请把推演压到最短，直接给出结论与简短理由。' : ''))]

    const options = {
      system,
      messages,
      maxTokens: config.maxTokens,
      signal,
      purpose: 'magi-vote',
      ...(route.provider ? { provider: route.provider } : {}),
      ...(route.model ? { model: route.model } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(config.passTemperature && typeof config.temperature?.[persona.temperatureKey] === 'number'
        ? { temperature: config.temperature[persona.temperatureKey] }
        : {}),
    }

    try {
      if (typeof ctx?.llm?.stream !== 'function') throw new Error('ctx.llm.stream 不可用')
      const stream = ctx.llm.stream(options)
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new Error('ctx.llm.stream 未返回 AsyncIterable')
      }
      for await (const chunk of stream) {
        if (signal?.aborted) throw new Error('aborted')
        const kind = typeof chunk?.type === 'string'
          ? chunk.type
          : (typeof chunk?.kind === 'string'
            ? chunk.kind
            : (chunk === null || chunk === undefined ? String(chunk) : (typeof chunk === 'object' ? Object.keys(chunk).join('+') : typeof chunk)))
        chunkKinds.set(kind, (chunkKinds.get(kind) ?? 0) + 1)
        // 记一小段思维链：正文为空时它是唯一能解释「为什么没答案」的线索
        if (kind === 'reasoning-delta' && reasoningPreview.length < 200 && typeof chunk.text === 'string') {
          reasoningPreview += chunk.text
        }
        const usage = chunkUsage(chunk)
        if (usage) tokens = usage
        const failure = terminalFailure(chunk)
        if (failure && chunk?.type === 'finish') {
          if (accumulated.trim() === '' && blockFallback.trim() === '') throw failure
          lastError = failure
          break
        }
        const text = chunkText(chunk)
        if (text) {
          accumulated += text
          onDelta?.(text)
        }
        // 兜底：只给完整块、不给增量的适配器
        const blockText = chunkBlockText(chunk)
        if (blockText) blockFallback += blockText
      }
    } catch (error) {
      streamError = error
      if (signal?.aborted) throw error
    }

    // 优先用增量拼出来的正文；一个增量都没收到时才用完整块兜底
    const body = accumulated.trim() === '' ? blockFallback : accumulated
    const parsed = extractJsonObject(body)
    lastParsed = parsed
    const { opinion, problems } = normalizeOpinion(parsed, persona)
    if (opinion) {
      if (body !== accumulated) accumulated = body
      return { opinion, raw: accumulated, latencyMs: Date.now() - startedAt, tokens, route, personaUsed }
    }
    lastError = new Error(describeFailure({ problems, accumulated: body, chunkKinds, streamError, route, reasoningPreview }))
    logger?.warn?.(`[magi] ${persona.unit} 第 ${attempt + 1} 次输出不合契约：${lastError.message}`)
  }

  // 两次都坚持弃权时，按规则折算为拒否，而不是把这一票丢掉
  const coerced = coerceAbstention(lastParsed, persona)
  if (coerced) {
    logger?.warn?.(`[magi] ${persona.unit} 两次都未按规则选边，已按保守默认记为拒否`)
    return { opinion: coerced, raw: accumulated, latencyMs: Date.now() - startedAt, tokens, route, coerced: true, personaUsed }
  }

  throw lastError ?? new Error('调用失败')
}
