/**
 * 离线自检用的假模型：**不调用任何模型**，按「单元 + 议题」的确定性哈希编造一份结构化意见，
 * 并按字符流式吐出，用来在未安装插件的情况下跑通整条链路（工具 → 计票 → 账本 → SSE → 面板）。
 *
 * 只在 `llmMode: 'stub'` 时启用。
 */

function hashString(input) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const TEMPLATES = {
  'MELCHIOR-1': {
    approve: (q) => `以现有证据看，「${q}」的收益与成本可以量化，失败模式可控，且不存在未经验证的关键假设。我判断可以执行。`,
    reject: (q) => `关于「${q}」，缺少可验证的数据支撑：没有量化收益、没有失败概率、也没有回滚方案。在没有证据的情况下我只能反对。`,
  },
  'BALTHASAR-2': {
    approve: (q) => `如果「${q}」按现在的方案推进，受影响的人保有退路，最坏后果可恢复。为了他们长期的处境，我同意。`,
    reject: (q) => `「${q}」里我看到了不可逆的部分：一旦出错，受损的一方没有能力拒绝，也拿不回选择权。我不能同意。`,
  },
  'CASPER-3': {
    approve: (q) => `我对「${q}」是有感觉的——我想要它，而且我看不出自己会后悔。就这样，同意。`,
    reject: (q) => `「${q}」让我不舒服。说不上完整的理由，但我在意的那部分被忽略了，我不愿意。反对。`,
  },
}

/**
 * @param {typeof import('./personas.js').PERSONAS[number]} persona
 * @param {{ question: string, criticality: 'normal' | 'critical' }} request
 */
export function stubOpinion(persona, request) {
  const question = typeof request?.question === 'string' ? request.question : ''
  const seed = hashString(`${persona.unit}|${question}`)
  const roll = seed % 100
  // critical 档更保守：只有 30% 的情形才赞成（要三票一致，几乎必然被否）
  const stance = request?.criticality === 'critical'
    ? (roll < 30 ? 'approve' : 'reject')
    : (roll < 45 ? 'approve' : 'reject')

  const template = TEMPLATES[persona.unit] ?? TEMPLATES['MELCHIOR-1']
  const confidence = Math.round((0.55 + ((seed >>> 8) % 40) / 100) * 100) / 100

  return {
    stance,
    confidence,
    reason: template[stance](question.slice(0, 60)),
    key_factors: [`${persona.attribute}视角下的首要依据`, '对最坏后果的估计'].slice(0, 2),
    risks: stance === 'approve' ? ['执行偏差', '后续维护成本'] : ['信息不足', '不可逆损害'],
    caveats: stance === 'approve' ? '若出现未预期的副作用，我会改判。' : '若补齐关键证据，我会重新评估。',
  }
}

/** 把一段文本按字符切成流，遵守 AbortSignal。 */
export async function* streamText(text, { signal, delayMs = 18 } = {}) {
  for (const char of Array.from(text)) {
    if (signal?.aborted) throw new Error('aborted')
    yield char
    if (delayMs > 0) await sleep(delayMs, signal)
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}
