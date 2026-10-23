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
 * 依赖策略：模块顶层只 import `@deepseek-ai/dsh-tools`；不导出 `Config`（Schemastery），
 * 其余不确定之处（消息工厂、模型路由、chunk 字段名）都在运行时探测并降级，见 lib/llm-bridge.js。
 */

import { resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { createApi, API_PATHS } from './lib/api.js'
import { normalizeConfig } from './lib/config.js'
import { Ledger } from './lib/ledger.js'
import { createBus } from './lib/bus.js'
import { createVoteRunner } from './lib/vote.js'
import { describePersonaSet, exportPersonaFiles } from './lib/persona-files.js'

export const name = 'magi'
// agentDefaultModel 必须显式注入：cordis 里访问未注入的服务会直接抛
// `cannot get property "agentDefaultModel" without inject`，而不是返回 undefined。
export const inject = ['tools', 'llm', 'webServer', 'agentDefaultModel']

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

export function apply(ctx, rawConfig) {
  const logger = ctx?.logger ?? console
  const { config, warnings } = normalizeConfig(rawConfig)
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
