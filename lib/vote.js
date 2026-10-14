/**
 * 表决编排：把一次「待决事项」跑成一份完整结果。
 *
 * 流程：档位判定 → 分配决策编号 → 三路**并发且互不可见**的人格调用
 *      → 两档计票 → 广播判决 → 落账。
 *
 * 单个单元失败/超时**不会**让整次表决失败：该单元按保守默认记为**拒否**并附错误摘要，
 * 其余单元照常计票，结果 notes 里会写明降级。三台全失败则整次表决直接报错（不造判决）。
 */

import { randomUUID } from 'node:crypto'
import { PERSONAS } from './personas.js'
import { callUnit } from './llm-bridge.js'
import { resolveCriticality } from './criticality.js'
import { tallyOpinions, VERDICT_LABEL } from './tally.js'

const errorMessage = (error) => (error instanceof Error ? error.message : String(error))

export function createVoteRunner({ ctx, config, ledger, bus, logger }) {
  /** 各单元上一次生效人格的哈希：用于在人格文件被改动时留下可追溯的记录。 */
  const lastPersonaHashes = new Map()

  /**
   * 校验请求、分配编号、广播开场帧。
   * @param {{ question?: string, context?: string, criticality?: string, label?: string }} request
   */
  async function createJob(request) {
    const question = typeof request?.question === 'string' ? request.question.trim() : ''
    if (question === '') throw new Error('question 不能为空')

    const context = typeof request?.context === 'string' && request.context.trim() !== ''
      ? request.context.trim()
      : undefined
    const decision = resolveCriticality({ question, context, criticality: request?.criticality }, config)

    const seq = await ledger.nextSeq()
    const key = `magi-${String(seq).padStart(4, '0')}-${randomUUID().slice(0, 6)}`
    const displayId = `MAGI-DECISION No.${String(seq).padStart(4, '0')}`
    const startedAt = new Date().toISOString()

    const job = {
      key,
      id: displayId,
      seq,
      createdAt: startedAt,
      question,
      context,
      label: typeof request?.label === 'string' && request.label.trim() !== '' ? request.label.trim() : undefined,
      criticality: decision.criticality,
      criticalitySource: decision.source,
      matchedKeywords: decision.matchedKeywords,
    }

    bus.publish({
      type: 'vote',
      id: key,
      displayId,
      question,
      context,
      criticality: job.criticality,
      criticalitySource: job.criticalitySource,
      matchedKeywords: job.matchedKeywords,
      startedAt,
    })

    return job
  }

  /** 跑完三个单元并产出结果。 */
  async function execute(job, options = {}) {
    const startedMs = Date.now()
    /** 本次表决各单元实际生效的人格来源（unit → { source, sha256, chars, path }）。 */
    const personaUsage = new Map()

    const runUnit = async (persona) => {
      bus.publish({ type: 'unit', id: job.key, unit: persona.unit, state: 'analyzing' })

      const controller = new AbortController()
      let timedOut = false
      const onOuterAbort = () => controller.abort()
      if (options.signal?.aborted) controller.abort()
      else options.signal?.addEventListener?.('abort', onOuterAbort, { once: true })
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, config.timeoutMs)
      timer.unref?.()

      try {
        const { opinion, latencyMs, tokens, route, personaUsed } = await callUnit({
          ctx,
          config,
          persona,
          request: { question: job.question, context: job.context, criticality: job.criticality },
          signal: controller.signal,
          sessionId: options.sessionId,
          logger,
          onDelta: (text) => bus.publish({ type: 'unit-delta', id: job.key, unit: persona.unit, text }),
        })
        if (personaUsed) personaUsage.set(persona.unit, personaUsed)

        const finished = {
          ...opinion,
          model: route?.model,
          provider: route?.provider,
          latencyMs,
          tokens,
        }
        bus.publish({ type: 'unit', id: job.key, unit: persona.unit, state: 'output' })
        bus.publish({ type: 'unit-done', id: job.key, unit: persona.unit, opinion: finished })
        return finished
      } catch (error) {
        const message = timedOut ? `超过 ${config.timeoutMs}ms 未返回` : errorMessage(error)
        const degraded = {
          unit: persona.unit,
          stance: 'reject',
          confidence: 0,
          reason: `单元调用失败，按保守默认记为拒否：${message}`,
          key_factors: [],
          risks: [],
          caveats: '',
          error: message,
          degraded: true,
          latencyMs: Date.now() - startedMs,
        }
        bus.publish({ type: 'unit', id: job.key, unit: persona.unit, state: 'error' })
        bus.publish({ type: 'unit-done', id: job.key, unit: persona.unit, opinion: degraded })
        logger?.warn?.(`[magi] ${persona.unit} 降级：${message}`)
        return degraded
      } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener?.('abort', onOuterAbort)
      }
    }

    const opinions = await Promise.all(PERSONAS.map((persona) => runUnit(persona)))

    // 三台全失败时**不造判决**：这不是「否決」，而是这次表决没有结果，如实报错。
    const failed = opinions.filter((opinion) => opinion.error)
    if (failed.length === PERSONAS.length) {
      throw new Error(`三台单元全部调用失败，本次表决没有结果：${failed.map((o) => `${o.unit}(${o.error})`).join('；')}`)
    }

    const tally = tallyOpinions(opinions, {
      criticality: job.criticality,
      useWeights: config.useWeights,
      weights: config.weights,
    })

    const notes = [...tally.notes]
    if (failed.length > 0) {
      notes.push(`以下单元调用失败并按保守默认记为拒否：${failed.map((o) => o.unit).join(', ')}`)
    }
    if (job.criticalitySource === 'keyword') {
      notes.push(`议题命中敏感词（${job.matchedKeywords.join(', ')}），已按 critical 档表决：需三票一致`)
    }

    // 生效人格的来源与哈希：谁在什么时候改了哪台的人格，都能从账本追溯
    const personaSources = PERSONAS.map((persona) => personaUsage.get(persona.unit) ?? {
      unit: persona.unit,
      source: 'unresolved',
    })
    const changedPersonas = []
    for (const source of personaSources) {
      const hash = typeof source.sha256 === 'string' ? source.sha256 : ''
      const previous = lastPersonaHashes.get(source.unit)
      if (hash !== '' && previous !== undefined && previous !== hash) {
        changedPersonas.push(`${source.unit} ${previous.slice(0, 8)}→${hash.slice(0, 8)}（来源 ${source.source}）`)
      }
      if (hash !== '') lastPersonaHashes.set(source.unit, hash)
    }
    if (changedPersonas.length > 0) {
      notes.push(`人格文件已变更：${changedPersonas.join('；')}`)
    }

    const result = {
      ...job,
      opinions,
      tally: tally.counts,
      verdict: tally.verdict,
      verdictLabel: VERDICT_LABEL[tally.verdict],
      unanimity: tally.unanimity,
      confidenceAvg: tally.confidenceAvg,
      personaSources: personaSources.map((source) => ({
        unit: source.unit,
        source: source.source,
        sha256: typeof source.sha256 === 'string' ? source.sha256.slice(0, 12) : undefined,
        chars: source.chars,
        contract: source.contractSource === undefined
          ? undefined
          : { source: source.contractSource, sha256: String(source.contractSha256 ?? '').slice(0, 12) },
      })),
      elapsedMs: Date.now() - startedMs,
      notes,
    }

    bus.publish({ type: 'verdict', id: job.key, displayId: job.id, result })
    try {
      await ledger.append(result)
    } catch (error) {
      logger?.warn?.(`[magi] 账本写入失败：${errorMessage(error)}`)
      result.notes.push(`账本写入失败：${errorMessage(error)}`)
    }
    logger?.info?.(
      `[magi] ${job.id} [${result.criticality}] ${result.verdict} ` +
      `(${result.tally.approve}:${result.tally.reject}) ${result.elapsedMs}ms`,
    )
    return result
  }

  return {
    /** 等结果（工具路径）。 */
    async runVote(request, options = {}) {
      const job = await createJob(request)
      return execute(job, options)
    },
    /**
     * 立即返回句柄、后台跑（HTTP 路径，进度靠 SSE）。
     * @returns {Promise<{ job: object, done: Promise<object> }>}
     */
    async startVote(request, options = {}) {
      const job = await createJob(request)
      const done = execute(job, options).catch((error) => {
        bus.publish({ type: 'error', id: job.key, message: errorMessage(error) })
        logger?.warn?.(`[magi] 表决失败：${errorMessage(error)}`)
        throw error
      })
      done.catch(() => {
        // 后台任务，错误已经广播
      })
      return { job, done }
    },
  }
}
