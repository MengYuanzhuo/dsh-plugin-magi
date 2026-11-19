/**
 * 计票：結果是 承認 / 有条件承認 / 拒否 / 否決 四种。
 *
 * 三台单元允许投 approve / conditional / reject（没有弃权）。conditional 表示
 * 「条件满足时同意」；票数按独立一档统计，不并入 approve 或 reject。
 *
 * - `normal`   —— 多数决：2 票以上赞成即承認；2 票以上反对即拒否（三票全反对记 VETO）；
 *                 其余情况（1:1:1 或 2 票有条件承認）按**有条件承認**处理。
 * - `critical` —— **必须三票一致**：全票 approve 才承認；全票 conditional 记有条件承認；
 *                 任何混合或反对票即 否決(VETO)。
 *
 * 加权模式（可选）下，先看权重是否过半；无任何一边过半时，有条件票占多数则记
 * 有条件承認，否则按**保守默认**判为拒否。
 *
 * `unanimity` 的含义是**三票完全一致**（全票承認 / 全票有条件承認 / 全票否決），
 * 界面据此显示 `UNANIMOUS` 标记 —— 0:3 的全票否决同样算一致，因此标记要带上真实票数。
 *
 * `probability` 是三个单元对「议题成立 / 成功 / 获胜 / 正确 / 支持」的概率估计的平均值，
 * `probabilityLabel` 取三台给出的短名词里出现次数最多的一个（平票取第一台）。
 *
 * 纯函数，无任何 DSH 依赖，便于离线单测。
 */

/** @typedef {'APPROVE' | 'CONDITIONAL' | 'REJECT' | 'VETO'} MagiVerdict */

export const VERDICT_LABEL = Object.freeze({
  APPROVE: '承認',
  CONDITIONAL: '有条件承認',
  REJECT: '拒否',
  VETO: '否決',
})

/** 单元 id → 权重表里的短名。 */
const UNIT_WEIGHT_KEY = Object.freeze({
  'MELCHIOR-1': 'melchior',
  'BALTHASAR-2': 'balthasar',
  'CASPER-3': 'casper',
})

const round = (value) => Math.round(value * 100) / 100
const round4 = (value) => Math.round(value * 10_000) / 10_000

/** 三台给出的概率取平均；没有任何有效值时返回 null。 */
function aggregateProbability(list) {
  const values = list
    .map((opinion) => opinion?.probability)
    .filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
  if (values.length === 0) return null
  return round4(values.reduce((sum, value) => sum + value, 0) / values.length)
}

/** 取出现次数最多的概率名词；平票按意见顺序取第一个。 */
function aggregateProbabilityLabel(list) {
  const labels = list
    .map((opinion) => (typeof opinion?.probabilityLabel === 'string' ? opinion.probabilityLabel.trim().slice(0, 40) : ''))
    .filter((label) => label !== '')
  if (labels.length === 0) return null
  const counts = new Map()
  let best = labels[0]
  let bestCount = 0
  for (const label of labels) {
    const count = (counts.get(label) ?? 0) + 1
    counts.set(label, count)
    if (count > bestCount) {
      best = label
      bestCount = count
    }
  }
  return best
}

/**
 * @param {Array<{ unit: string, stance: string, confidence?: number, probability?: number,
 *                 probabilityLabel?: string, error?: string }>} opinions
 * @param {{ criticality?: 'normal' | 'critical', useWeights?: boolean,
 *           weights?: Record<string, number> }} [options]
 */
export function tallyOpinions(opinions, options = {}) {
  const criticality = options.criticality === 'critical' ? 'critical' : 'normal'
  const list = Array.isArray(opinions) ? opinions : []

  const counts = { approve: 0, conditional: 0, reject: 0 }
  for (const opinion of list) {
    if (opinion?.stance === 'approve') counts.approve += 1
    else if (opinion?.stance === 'conditional') counts.conditional += 1
    else counts.reject += 1 // 弃权/未知/调用失败一律按反对计：宁可错杀，不可放过
  }

  const total = list.length
  // 三票完全一致：全票承認 / 全票有条件承認 / 全票否決
  const unanimity = total > 0
    && (counts.approve === total || counts.conditional === total || counts.reject === total)
  const notes = []
  let verdict

  if (criticality === 'critical') {
    if (counts.approve === total) {
      verdict = 'APPROVE'
      notes.push('critical 档：三票一致承認')
    } else if (counts.conditional === total) {
      verdict = 'CONDITIONAL'
      notes.push('critical 档：三票一致有条件承認，执行时需逐条满足各自条件')
    } else {
      verdict = 'VETO'
      const parts = []
      if (counts.reject > 0) parts.push(`${counts.reject} 票反对`)
      if (counts.conditional > 0) parts.push(`${counts.conditional} 票有条件承認`)
      notes.push(`critical 档：需三票一致，本次${parts.length > 0 ? ` ${parts.join('、')}` : ''}，整体否决`)
    }
  } else if (options.useWeights) {
    const weights = options.weights ?? {}
    const weightOf = (unit) => {
      // 权重表既支持 { melchior: 2 } 这种短名，也支持 { 'MELCHIOR-1': 2 } 这种单元名
      const value = weights?.[unit] ?? weights?.[UNIT_WEIGHT_KEY[unit]]
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 1
    }
    let approveWeight = 0
    let conditionalWeight = 0
    let rejectWeight = 0
    for (const opinion of list) {
      const weight = weightOf(opinion?.unit)
      if (opinion?.stance === 'approve') approveWeight += weight
      else if (opinion?.stance === 'conditional') conditionalWeight += weight
      else rejectWeight += weight
    }
    const totalWeight = approveWeight + conditionalWeight + rejectWeight
    if (approveWeight > totalWeight / 2) {
      verdict = 'APPROVE'
      notes.push(`加权多数决：赞成权重 ${round(approveWeight)} > 反对权重 ${round(rejectWeight)}`)
    } else if (rejectWeight > totalWeight / 2) {
      verdict = 'REJECT'
      notes.push(`加权多数决：反对权重 ${round(rejectWeight)} > 赞成权重 ${round(approveWeight)}`)
    } else if (conditionalWeight > 0) {
      verdict = 'CONDITIONAL'
      notes.push(`加权多数决：有条件权重 ${round(conditionalWeight)}，无一边过半，按有条件承認处理`)
    } else {
      verdict = 'REJECT'
      notes.push(`加权票数相等（各 ${round(approveWeight)}），按保守默认判为拒否`)
    }
  } else if (counts.approve >= 2) {
    verdict = 'APPROVE'
    notes.push(`多数决：${counts.approve} 票赞成${counts.conditional > 0 ? `，${counts.conditional} 票有条件承認` : ''}`)
  } else if (counts.reject >= 2) {
    verdict = counts.reject === total ? 'VETO' : 'REJECT'
    notes.push(counts.reject === total ? '三票齐否决' : `多数决：${counts.reject} 票反对`)
  } else if (counts.conditional > 0) {
    verdict = 'CONDITIONAL'
    notes.push(
      counts.conditional >= 2
        ? `多数决：${counts.conditional} 票有条件承認`
        : '三方不一致（承認 / 有条件承認 / 拒否），按有条件承認处理',
    )
  } else {
    verdict = 'REJECT'
    notes.push('没有有效意见，按保守默认判为拒否')
  }

  const confidences = list
    .map((opinion) => opinion?.confidence)
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const confidenceAvg = confidences.length === 0
    ? 0
    : round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)

  return {
    verdict,
    counts,
    unanimity,
    confidenceAvg,
    probability: aggregateProbability(list),
    probabilityLabel: aggregateProbabilityLabel(list),
    criticality,
    notes,
    total,
  }
}
