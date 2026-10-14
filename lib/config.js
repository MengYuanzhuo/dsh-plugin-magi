/**
 * 插件配置：默认值 + 容错归一化。
 *
 * 本插件**不导出 `Config`**（Schemastery），因此包在模块顶层零依赖、加载期不会因解析
 * 依赖失败而整包挂掉；代价是配置需要自己校验。归一化只做保守处理：类型不对或越界就回落
 * 默认值，并把每一次修正记进 `warnings`，由调用方写日志。
 */

/** 命中即把决策自动升级为 critical（需三票一致）的敏感词。 */
const DEFAULT_CRITICAL_KEYWORDS = [
  // 破坏性 / 不可逆
  '删除', '删掉', '清空', '格式化', '不可逆', '覆盖', '销毁', 'drop', 'rm -rf', 'force push',
  // 凭据与隐私
  '密钥', '私钥', '密码', '口令', '凭据', 'token', 'api key', '隐私', '个人信息', '身份证', '手机号',
  // 对外暴露 / 发布
  '上传', '外发', '外部发送', '发给', '公开', '开源', '发布', '上线', '投产', '生产环境', '生产库', '线上',
  '第三方', '导出给', '对外提供', '共享给', '客户名单', '敏感数据',
  // 资金与承诺
  '资金', '转账', '付款', '支付', '购买', '下单', '合同', '签署', '承诺', '授权', '权限变更',
  // 关系与不可挽回的决定
  '终止', '解雇', '离职', '拒绝录用', '拉黑', '分手', '退学', '辞职', '医疗', '手术', '用药',
]

export const DEFAULT_CONFIG = Object.freeze({
  provider: '',
  model: '',
  timeoutMs: 90_000,
  maxTokens: 2_000,
  stubDelayMs: 18,
  passTemperature: false,
  temperature: Object.freeze({ melchior: 0.2, balthasar: 0.5, casper: 0.9 }),
  useWeights: false,
  weights: Object.freeze({ melchior: 1, balthasar: 1, casper: 1 }),
  llmMode: 'live',
  ledgerDir: '.magi',
  // 人格提示词的外部文件目录；空 = 只用 lib/personas.js 的内置默认。
  // 目录下按 melchior.md / balthasar.md / casper.md 覆盖对应单元，每次表决现读。
  personasDir: '',
  historyLimit: 50,
  criticalKeywords: DEFAULT_CRITICAL_KEYWORDS,
  ui: Object.freeze({ crtEffects: true, sound: false, bootSequence: false }),
})

const LLM_MODES = new Set(['live', 'stub'])

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const pickString = (value, fallback) => (typeof value === 'string' ? value : fallback)

const pickBoolean = (value, fallback) => (typeof value === 'boolean' ? value : fallback)

const pickEnum = (value, allowed, fallback) => (typeof value === 'string' && allowed.has(value) ? value : fallback)

/**
 * 生成一个数值读取器：类型不对或超出范围都**回落默认值**（而不是悄悄夹紧），
 * 并把每一次修正记进 warnings —— 配置写错时应当看得见。
 */
const makeNumberReader = (warnings) => (value, fallback, { min, max, integer = false }, label) => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    warnings.push(`${label} 不是有限数字，已回落为 ${fallback}`)
    return fallback
  }
  if (value < min || value > max) {
    warnings.push(`${label}=${value} 超出 [${min}, ${max}]，已回落为 ${fallback}`)
    return fallback
  }
  if (integer && !Number.isInteger(value)) {
    warnings.push(`${label}=${value} 不是整数，已取整`)
    return Math.round(value)
  }
  return value
}

/**
 * 把行内 config 归一化成完整配置。
 * @param {unknown} raw - `cordis.patch.yml` 中该插件行的 config。
 * @returns {{ config: typeof DEFAULT_CONFIG, warnings: string[] }}
 */
export function normalizeConfig(raw) {
  const warnings = []
  const input = isPlainObject(raw) ? raw : {}
  const num = makeNumberReader(warnings)
  if (raw !== undefined && !isPlainObject(raw)) warnings.push('config 不是对象，已整体回落为默认值')

  const normalizeWeights = (value, fallback) => {
    if (!isPlainObject(value)) return { ...fallback }
    const out = { ...fallback }
    for (const key of Object.keys(fallback)) {
      if (value[key] === undefined) continue
      if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0) {
        warnings.push(`weights.${key} 不是非负数，已忽略`)
        continue
      }
      out[key] = value[key]
    }
    return out
  }

  const keywords = Array.isArray(input.criticalKeywords)
    ? input.criticalKeywords.filter((item) => typeof item === 'string' && item.trim() !== '')
    : null
  if (input.criticalKeywords !== undefined && keywords === null) {
    warnings.push('criticalKeywords 不是字符串数组，已回落为默认敏感词表')
  }

  const ui = isPlainObject(input.ui) ? input.ui : {}
  if (input.ui !== undefined && !isPlainObject(input.ui)) warnings.push('ui 不是对象，已整体回落为默认值')

  const llmMode = pickEnum(input.llmMode, LLM_MODES, DEFAULT_CONFIG.llmMode)
  if (input.llmMode !== undefined && llmMode !== input.llmMode) {
    warnings.push(`llmMode="${String(input.llmMode)}" 不是 live|stub，已回落为 ${llmMode}`)
  }

  const config = {
    provider: pickString(input.provider, DEFAULT_CONFIG.provider),
    model: pickString(input.model, DEFAULT_CONFIG.model),
    timeoutMs: num(input.timeoutMs, DEFAULT_CONFIG.timeoutMs, { min: 1_000, max: 600_000, integer: true }, 'timeoutMs'),
    maxTokens: num(input.maxTokens, DEFAULT_CONFIG.maxTokens, { min: 64, max: 32_000, integer: true }, 'maxTokens'),
    passTemperature: pickBoolean(input.passTemperature, DEFAULT_CONFIG.passTemperature),
    temperature: {
      melchior: num(input.temperature?.melchior, DEFAULT_CONFIG.temperature.melchior, { min: 0, max: 2 }, 'temperature.melchior'),
      balthasar: num(input.temperature?.balthasar, DEFAULT_CONFIG.temperature.balthasar, { min: 0, max: 2 }, 'temperature.balthasar'),
      casper: num(input.temperature?.casper, DEFAULT_CONFIG.temperature.casper, { min: 0, max: 2 }, 'temperature.casper'),
    },
    useWeights: pickBoolean(input.useWeights, DEFAULT_CONFIG.useWeights),
    weights: normalizeWeights(input.weights, DEFAULT_CONFIG.weights),
    llmMode,
    ledgerDir: pickString(input.ledgerDir, DEFAULT_CONFIG.ledgerDir) || DEFAULT_CONFIG.ledgerDir,
    personasDir: pickString(input.personasDir, DEFAULT_CONFIG.personasDir).trim(),
    historyLimit: num(input.historyLimit, DEFAULT_CONFIG.historyLimit, { min: 1, max: 1_000, integer: true }, 'historyLimit'),
    stubDelayMs: num(input.stubDelayMs, DEFAULT_CONFIG.stubDelayMs, { min: 0, max: 500, integer: true }, 'stubDelayMs'),
    criticalKeywords: keywords ?? [...DEFAULT_CRITICAL_KEYWORDS],
    ui: {
      crtEffects: pickBoolean(ui.crtEffects, DEFAULT_CONFIG.ui.crtEffects),
      sound: pickBoolean(ui.sound, DEFAULT_CONFIG.ui.sound),
      bootSequence: pickBoolean(ui.bootSequence, DEFAULT_CONFIG.ui.bootSequence),
    },
  }

  if (input.provider !== undefined && config.provider !== '' && config.model === '') {
    warnings.push('只配置了 provider 没有配置 model，已忽略 provider（两者必须成对，留空表示沿用会话默认）')
    config.provider = ''
  }

  return { config, warnings }
}

/** 只暴露给前端的配置子集（不含任何可能敏感的字段）。 */
export function publicConfig(config) {
  return {
    useWeights: config.useWeights,
    weights: config.weights,
    timeoutMs: config.timeoutMs,
    maxTokens: config.maxTokens,
    llmMode: config.llmMode,
    provider: config.provider,
    model: config.model,
    historyLimit: config.historyLimit,
    personasDir: config.personasDir,
    ui: config.ui,
  }
}
