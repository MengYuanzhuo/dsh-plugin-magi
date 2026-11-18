/**
 * MAGI（三贤人）—— DeepSeek Harness 插件 · 宿主半。
 *
 * 做什么：
 * - 工具 `magi_vote`：把一件待决事项交给三台独立单元（MELCHIOR-1 科学家 / BALTHASAR-2 母亲 /
 *   CASPER-3 女人）各自判断，再按档位计票。通常事项多数决；**敏感/重要事项须三票一致**。
 * - 工具 `magi_history`：回放历史表决。
 * - HTTP/SSE 路由 `/magi/api/*`：给 Web GUI 面板与工具卡片用 —— 工具的执行体不会上线，
 *   所以客户端必须通过这些路由取数据（实现见 lib/api.js，离线开发服务器复用同一份）。
 *
 * 依赖策略：模块顶层 import `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/schemastery`；
 * 用 Schemastery 声明 `Config`，让 DSH 的插件管理页能渲染配置表单。
 * 其余不确定之处（消息工厂、模型路由、chunk 字段名）都在运行时探测并降级，见 lib/llm-bridge.js。
 */

import { resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

import { createApi, API_PATHS } from './lib/api.js'
import { DEFAULT_CONFIG, normalizeConfig } from './lib/config.js'
import { Ledger } from './lib/ledger.js'
import { createBus } from './lib/bus.js'
import { createVoteRunner } from './lib/vote.js'
import { describePersonaSet, exportPersonaFiles } from './lib/persona-files.js'

export const name = 'magi'
// agentDefaultModel 必须显式注入：cordis 里访问未注入的服务会直接抛
// `cannot get property "agentDefaultModel" without inject`，而不是返回 undefined。
export const inject = ['tools', 'llm', 'webServer', 'agentDefaultModel']

/**
 * 插件配置 schema。
 *
 * 声明 `Config` 后，DSH 会把这一行的配置暴露成可编辑表单：设置页的
 * `plugins.row.config` 能拿到 `form.state` / `form.mutate`，保存时由宿主校验并
 * 写回 profile 的用户补丁层。字段与 lib/config.js 的 DEFAULT_CONFIG 对齐。
 */
export const Config = z.object({
  provider: z.string().default(DEFAULT_CONFIG.provider),
  model: z.string().default(DEFAULT_CONFIG.model),
  timeoutMs: z.number().step(1).min(1_000).max(600_000).default(DEFAULT_CONFIG.timeoutMs),
  maxTokens: z.number().step(1).min(64).max(32_000).default(DEFAULT_CONFIG.maxTokens),
  stubDelayMs: z.number().step(1).min(0).max(500).default(DEFAULT_CONFIG.stubDelayMs),
  passTemperature: z.boolean().default(DEFAULT_CONFIG.passTemperature),
  temperature: z.object({
    melchior: z.number().min(0).max(2).default(DEFAULT_CONFIG.temperature.melchior),
    balthasar: z.number().min(0).max(2).default(DEFAULT_CONFIG.temperature.balthasar),
    casper: z.number().min(0).max(2).default(DEFAULT_CONFIG.temperature.casper),
  }).default({ ...DEFAULT_CONFIG.temperature }),
  useWeights: z.boolean().default(DEFAULT_CONFIG.useWeights),
  weights: z.object({
    melchior: z.number().min(0).default(DEFAULT_CONFIG.weights.melchior),
    balthasar: z.number().min(0).default(DEFAULT_CONFIG.weights.balthasar),
    casper: z.number().min(0).default(DEFAULT_CONFIG.weights.casper),
  }).default({ ...DEFAULT_CONFIG.weights }),
  llmMode: z.union([z.const('live'), z.const('stub')]).default(DEFAULT_CONFIG.llmMode),
  ledgerDir: z.string().default(DEFAULT_CONFIG.ledgerDir),
  personasDir: z.string().default(DEFAULT_CONFIG.personasDir).volatile(),
  historyLimit: z.number().step(1).min(1).max(1_000).default(DEFAULT_CONFIG.historyLimit),
  criticalKeywords: z.array(z.string()).default([...DEFAULT_CONFIG.criticalKeywords]),
  ui: z.object({
    crtEffects: z.boolean().default(DEFAULT_CONFIG.ui.crtEffects),
    bootSequence: z.boolean().default(DEFAULT_CONFIG.ui.bootSequence),
  }).default({ ...DEFAULT_CONFIG.ui }),
  abilities: z.object({
    // 旧版总开关：配置页不显示；保留为 volatile 以便旧的 enabled=false 能迁移。
    enabled: z.boolean().default(DEFAULT_CONFIG.abilities.enabled).volatile(),
    runScript: z.boolean().default(DEFAULT_CONFIG.abilities.runScript).volatile(),
    composeText: z.boolean().default(DEFAULT_CONFIG.abilities.composeText).volatile(),
    desireMap: z.boolean().default(DEFAULT_CONFIG.abilities.desireMap).volatile(),
    maxToolCallsPerUnit: z.number().step(1).min(0).max(4).default(DEFAULT_CONFIG.abilities.maxToolCallsPerUnit),
    scriptTimeoutMs: z.number().step(1).min(500).max(60_000).default(DEFAULT_CONFIG.abilities.scriptTimeoutMs),
    maxOutputChars: z.number().step(1).min(500).max(50_000).default(DEFAULT_CONFIG.abilities.maxOutputChars),
    labDir: z.string().default(DEFAULT_CONFIG.abilities.labDir),
    draftsDir: z.string().default(DEFAULT_CONFIG.abilities.draftsDir),
  }).default({ ...DEFAULT_CONFIG.abilities }),
})

const VOTE_DESCRIPTION = [
  '把一件待决事项提交 MAGI（三贤人）表决，返回三台独立单元各自的判断、理由与最终判决。',
  'MELCHIOR-1=科学家（只认证据与可行性）；BALTHASAR-2=母亲（保护与长期后果）；CASPER-3=女人（直觉、欲望与私心）。',
  '三台单元都必须选边（承認 / 拒否）——没有弃权、没有保留；判决只有三种结果：承認、拒否、否決。',
  '通常事项按多数决；critical（敏感/重要）事项必须三票一致才可通过，任一反对即整体否决。',
  '当议题涉及删除、不可逆操作、资金、隐私、密钥、对外发布、医疗等敏感内容时，请显式传 criticality="critical"。',
].join(' ')

const HISTORY_DESCRIPTION =
  '查看 MAGI 的历史表决记录。传 key 取单次表决的完整记录（含三份原始意见）；不传 key 则返回最近的若干条。'

/** 从工具执行上下文里尽力取出会话 id（字段名做兼容，取不到就不传）。 */
function resolveSessionId(exec) {
  const candidates = [
    exec?.agent?.session?.id,
    exec?.session?.id,
    exec?.agent?.sessionId,
    exec?.sessionId,
  ]
  return candidates.find((value) => typeof value === 'string' && value !== '')
}

/** Read a Schemastery volatile field's current value; plain values pass through. */
function readLive(value, fallback) {
  try {
    if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
      const current = value.get()
      return current === undefined ? fallback : current
    }
    return value === undefined ? fallback : value
  } catch {
    return fallback
  }
}

/**
 * Keep the editable fields live: the schema marks them `.volatile()`, so a saved
 * edit must reach the already-running plugin without remounting it. The normalized
 * config keeps ordinary plain properties; these getters read the current volatile
 * values where the rest of the code expects them.
 */
function attachLiveConfig(config, rawConfig) {
  const raw = rawConfig !== null && typeof rawConfig === 'object' ? rawConfig : {}
  const rawAbilities = raw.abilities !== null && typeof raw.abilities === 'object' ? raw.abilities : {}
  const fallbackPersonasDir = config.personasDir
  const fallbackAbilitiesEnabled = config.abilities.enabled
  const fallbackRunScript = config.abilities.runScript
  const fallbackComposeText = config.abilities.composeText
  const fallbackDesireMap = config.abilities.desireMap

  Object.defineProperty(config, 'personasDir', {
    enumerable: true,
    configurable: true,
    get: function () {
      const value = readLive(raw.personasDir, fallbackPersonasDir)
      return typeof value === 'string' ? value : fallbackPersonasDir
    },
  })
  const bindAbility = (key, fallback) => {
    Object.defineProperty(config.abilities, key, {
      enumerable: true,
      configurable: true,
      get: function () {
        const value = readLive(rawAbilities[key], fallback)
        return typeof value === 'boolean' ? value : fallback
      },
    })
  }
  bindAbility('enabled', fallbackAbilitiesEnabled)
  bindAbility('runScript', fallbackRunScript)
  bindAbility('composeText', fallbackComposeText)
  bindAbility('desireMap', fallbackDesireMap)
}

export function apply(ctx, rawConfig) {
  const logger = ctx?.logger ?? console
  const { config, warnings } = normalizeConfig(rawConfig)
  attachLiveConfig(config, rawConfig)
  for (const warning of warnings) logger.warn?.(`[magi] 配置提示：${warning}`)

  const ledger = new Ledger({ dir: resolve(process.cwd(), config.ledgerDir), historyLimit: config.historyLimit })
  const bus = createBus()
  const runner = createVoteRunner({ ctx, config, ledger, bus, logger })

  /* ---------------------------------- 工具 ---------------------------------- */

  ctx.tools.register(defineTool({
    name: 'magi_vote',
    description: VOTE_DESCRIPTION,
    parameters: {
      question: { type: 'string', required: true, description: '待决事项本身，一到三句话。' },
      context: { type: 'string', description: '背景、约束、可选方案、已知数据。' },
      criticality: {
        type: 'string',
        description: 'normal（默认，多数决）或 critical（敏感/重要事项，需三票一致）。留空时按敏感词自动判定。',
      },
      label: { type: 'string', description: '这次表决的短标签，仅用于记录与显示。' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      return runner.runVote(args, { signal: exec?.signal, sessionId: resolveSessionId(exec) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'magi_history',
    description: HISTORY_DESCRIPTION,
    parameters: {
      limit: { type: 'number', description: '返回最近多少条，默认 10，最多 100。' },
      key: { type: 'string', description: '要精确读取的表决 key（形如 magi-0007-ab12cd）。' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      if (typeof args?.key === 'string' && args.key !== '') {
        const record = await ledger.get(args.key)
        return record ? { found: true, record } : { found: false, key: args.key }
      }
      const limit = Number.isFinite(args?.limit) ? Math.min(100, Math.max(1, Math.round(args.limit))) : 10
      return { items: await ledger.read(limit) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'magi_personas',
    description:
      '查看或导出 MAGI 三台单元的人格提示词。action="show"（默认）显示每台当前生效的人格来源' +
      '（内置默认还是外部文件）、哈希与正文；action="export" 把内置人格写成可编辑的模板文件' +
      '（默认不覆盖已存在的文件）。人格文件改动在**下一次表决**即生效，不需要重启。',
    parameters: {
      action: { type: 'string', description: 'show（默认）或 export。' },
      force: { type: 'boolean', description: 'export 时是否覆盖已存在的文件，默认 false。' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      if (args?.action === 'export') {
        if (!config.personasDir) {
          throw new Error('未配置 personasDir，无法导出：请先在 profile 的 cordis.patch.yml 里给 magi 行设置 personasDir')
        }
        const result = await exportPersonaFiles(config.personasDir, { force: args?.force === true })
        return { ...result, hint: '编辑这些 .md 文件即可调整人格，下一次表决生效；文件优先于内置默认。' }
      }
      return describePersonaSet(config, { logger })
    },
  }))

  /* --------------------------------- 路由 ---------------------------------- */

  const api = createApi({ runner, ledger, bus, config, logger, ctx })
  for (const [key, path] of Object.entries(API_PATHS)) {
    const handler = api[key]
    if (typeof handler !== 'function') continue
    ctx.effect(() => {
      const dispose = ctx.webServer.register({ kind: 'exact', path, handler })
      return () => dispose()
    }, `magi: ${path}`)
  }

  logger.info?.(
    `[magi] 三贤人就绪：MELCHIOR-1 / BALTHASAR-2 / CASPER-3 · ` +
    `模型=${config.llmMode === 'stub' ? 'stub（离线桩）' : (config.model || '会话默认')} · 账本=${ledger.ledgerPath}`,
  )
}
