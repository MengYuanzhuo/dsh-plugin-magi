/**
 * CASPER-3 的子功能：欲望读数。
 *
 * 它不掷骰子决定她的票，也不替她打分。它只把她自己给出的东西摆成一张可检查的图：
 * 想要什么、想要背后的想要、愿意付什么价、哪条底线不卖、这个想要是不是她的、
 * 如果没人看见还要不要、十年后会不会看不起自己。
 *
 * 只有一种情况下才允许随机：两个选项在所有轴上都打平、她仍然 undecided，
 * 并且显式请求 tieBreak。那时的随机不是判决，是镜子。
 */

import { randomInt } from 'node:crypto'

const OWNERS = new Set(['mine', 'borrowed', 'reactive'])
const VISIBILITY = new Set(['yes', 'no', 'unsure'])
const FITS = new Set(['high', 'partial', 'none'])
const GENERIC_PRICE = new Set(['代价', '一些代价', '很大代价', '代价很大', '看情况', '不知道', '没有'])

const fail = (message) => {
  const error = new Error(message)
  error.status = 400
  throw error
}

const text = (value, label, max, min = 1) => {
  if (typeof value !== 'string') fail(`${label} 必须是字符串`)
  const result = value.trim()
  if (result.length < min) fail(`${label} 太短（至少 ${min} 字）`)
  if (result.length > max) fail(`${label} 超过 ${max} 字`)
  return result
}

const optionalText = (value, label, max) => {
  if (value === undefined || value === null || value === '') return ''
  return text(value, label, max)
}

const readStringList = (value, label, min, max, itemMax) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} 必须是 ${min}–${max} 项的数组`)
  }
  return value.map((item, index) => text(item, `${label}[${index}]`, itemMax, 2))
}

const readOptions = (value) => {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) {
    fail('options 必须是 2–4 个选项')
  }
  const seen = new Set()
  return value.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail(`options[${index}] 必须是对象`)
    const id = text(raw.id, `options[${index}].id`, 12, 1)
    if (seen.has(id)) fail(`options 的 id 重复：${id}`)
    seen.add(id)
    const fit = typeof raw.fit === 'string' ? raw.fit.trim().toLowerCase() : ''
    if (!FITS.has(fit)) fail(`options[${index}].fit 必须是 high / partial / none`)
    return {
      id,
      label: text(raw.label, `options[${index}].label`, 120, 2),
      fit,
      violatesRefusal: raw.violatesRefusal === true,
      price: optionalText(raw.price, `options[${index}].price`, 160),
    }
  })
}

const readRegret = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('regret 必须是对象')
  const tenMinutes = optionalText(value.tenMinutes, 'regret.tenMinutes', 200)
  const tenMonths = text(value.tenMonths, 'regret.tenMonths', 200, 2)
  const tenYears = text(value.tenYears, 'regret.tenYears', 200, 2)
  return { tenMinutes, tenMonths, tenYears }
}

const readCompeting = (value) => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 3) fail('competing 必须是最多 3 项的数组')
  return value.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail(`competing[${index}] 必须是对象`)
    const rank = typeof raw.rank === 'number' ? raw.rank : Number(raw.rank)
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) fail(`competing[${index}].rank 必须是 1–10 的整数`)
    return { want: text(raw.want, `competing[${index}].want`, 120, 2), rank }
  })
}

const sentence = (value) => value.replace(/\s+/g, '').toLowerCase()

/**
 * @param {Record<string, unknown>} args
 * @returns {{ status: 'ok', mode: 'desire_map', summary: string, readout: object, outputPreview: string }}
 */
export function desireMap(args = {}) {
  const input = args !== null && typeof args === 'object' && !Array.isArray(args) ? args : {}
  const options = readOptions(input.options)
  const want = text(input.want, 'want', 200, 4)
  const wantBehindWant = text(input.wantBehindWant, 'wantBehindWant', 200, 4)
  if (sentence(want) === sentence(wantBehindWant)) {
    fail('wantBehindWant 必须说出“想要背后的想要”，不能和 want 相同')
  }

  const price = text(input.price, 'price', 200, 4)
  if (GENERIC_PRICE.has(sentence(price))) {
    fail('price 太泛：请写具体愿意付出什么（时间、关系、机会、难看的一次对话……）')
  }

  const refusals = readStringList(input.refusals, 'refusals', 1, 3, 120)
  const owner = typeof input.owner === 'string' ? input.owner.trim().toLowerCase() : ''
  if (!OWNERS.has(owner)) fail('owner 必须是 mine / borrowed / reactive')
  const borrowedFrom = owner === 'mine'
    ? optionalText(input.borrowedFrom, 'borrowedFrom', 120)
    : text(input.borrowedFrom, 'borrowedFrom', 120, 2)

  const visibility = typeof input.visibility === 'string' ? input.visibility.trim().toLowerCase() : ''
  if (!VISIBILITY.has(visibility)) fail('visibility 必须是 yes / no / unsure')
  const affect = text(input.affect, 'affect', 200, 2)
  const regret = readRegret(input.regret)
  const competing = readCompeting(input.competing)

  const forcedChoice = typeof input.forcedChoice === 'string' ? input.forcedChoice.trim() : ''
  if (forcedChoice !== 'undecided' && !options.some((option) => option.id === forcedChoice)) {
    fail('forcedChoice 必须是某个选项 id，或 "undecided"')
  }

  const chosen = options.find((option) => option.id === forcedChoice) ?? null
  const fitSet = new Set(options.map((option) => option.fit))
  const priceSet = new Set(options.map((option) => sentence(option.price)))
  const tie = forcedChoice === 'undecided' &&
    fitSet.size === 1 &&
    priceSet.size === 1 &&
    options.every((option) => option.violatesRefusal === false)

  const flags = []
  if (owner !== 'mine') {
    flags.push({
      code: 'borrowed-desire',
      message: owner === 'borrowed'
        ? `这可能是别人的欲望：${borrowedFrom}。先分清这是谁想要的。`
        : `这可能是在对某个人/某件事做反应，而不是你主动想要：${borrowedFrom}。`,
    })
  }
  if (visibility !== 'yes') {
    flags.push({
      code: 'status-trap',
      message: visibility === 'no'
        ? '如果没人看见你还想要吗？这可能是在要地位，不是在要那件事。'
        : '你说不准没人看见时还要不要；把它想清楚再投。',
    })
  }
  if (options.some((option) => option.violatesRefusal)) {
    flags.push({
      code: 'refusal-risk',
      message: '至少一个选项要求你卖掉一条底线；把它标出来，别让它在投票里消失。',
    })
  }
  if (chosen !== null && chosen.violatesRefusal) {
    flags.push({
      code: 'chosen-violates-refusal',
      message: `你选的 ${chosen.id} 违反了你的底线。要么改选，要么承认你愿意为它破例。`,
    })
  }

  let tieBreak = null
  if (input.tieBreak === true) {
    if (!tie) {
      fail('只有两个选项 fit 相同、都不违反底线、且 forcedChoice=undecided 时才允许 tieBreak')
    }
    const picked = options[randomInt(0, options.length)]
    tieBreak = {
      result: picked.id,
      label: picked.label,
      entropy: 'crypto.randomInt',
      probe: '看到这个结果，你是松了一口气，还是有点失望？',
      responsible: '抽签是镜子，不是替你负责的人。最终仍要说出“我要 A/B”。',
    }
  }

  const readout = {
    question: optionalText(input.question, 'question', 300),
    want,
    wantBehindWant,
    price,
    refusals,
    owner,
    borrowedFrom,
    visibility,
    affect,
    regret,
    competing,
    options,
    forcedChoice,
    flags,
    tie,
    tieBreak,
  }

  const summary = [
    `想要「${want}」`,
    `价格「${price}」`,
    `底线 ${refusals.length} 条`,
    `所有权 ${owner}`,
    tie ? '两个选项打平' : `选择 ${forcedChoice}`,
  ].join('；')

  return {
    status: 'ok',
    mode: 'desire_map',
    summary: `欲望读数：${summary}`,
    readout,
    outputPreview: JSON.stringify(readout, null, 2),
  }
}
