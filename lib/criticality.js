/**
 * 决策档位：normal（多数决）与 critical（三票一致）。
 *
 * 敏感 / 重要事项**不得**被默认的多数决放过，因此当调用方没有显式声明档位时，
 * 这里用一份可配置的敏感词表把议题自动升级为 critical，并把命中的词回传给调用方，
 * 让结果里能写明「为什么这次要三票一致」。
 */

/**
 * @typedef {'normal' | 'critical'} Criticality
 * @typedef {{ criticality: Criticality, source: 'explicit' | 'keyword' | 'default', matchedKeywords: string[] }} CriticalityDecision
 */

const normalizeText = (value) => (typeof value === 'string' ? value : '')

/**
 * 判定本次表决的档位。
 * @param {{ question?: string, context?: string, criticality?: string }} request
 * @param {{ criticalKeywords: string[] }} config
 * @returns {CriticalityDecision}
 */
export function resolveCriticality(request, config) {
  const explicit = normalizeText(request?.criticality).trim().toLowerCase()
  if (explicit === 'critical' || explicit === 'sensitive' || explicit === 'important') {
    return { criticality: 'critical', source: 'explicit', matchedKeywords: [] }
  }
  if (explicit === 'normal' || explicit === 'ordinary') {
    return { criticality: 'normal', source: 'explicit', matchedKeywords: [] }
  }

  const haystack = `${normalizeText(request?.question)}\n${normalizeText(request?.context)}`.toLowerCase()
  const matchedKeywords = []
  for (const keyword of config?.criticalKeywords ?? []) {
    const needle = String(keyword).trim().toLowerCase()
    if (needle === '') continue
    if (haystack.includes(needle) && !matchedKeywords.includes(keyword)) matchedKeywords.push(keyword)
  }

  if (matchedKeywords.length > 0) {
    return { criticality: 'critical', source: 'keyword', matchedKeywords }
  }
  return { criticality: 'normal', source: 'default', matchedKeywords: [] }
}
