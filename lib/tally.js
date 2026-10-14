/**
 * 计票：**只有三个可能的结果** —— 承認 / 拒否 / 否決。
 *
 * 三台单元只允许投 approve 或 reject（没有弃权），因此 3 票必然是 2:1 或 3:0，
 * 多数永远存在，**不存在平票**，也就不需要「保留 / 交还人类」这种悬置结果。
 *
 * - `normal`   —— 多数决：2 票赞成即承認；否则拒否；三票齐否决记 否決(VETO)。
 * - `critical` —— **必须三票一致**：3:0 全票赞成才承認；出现任何一票反对即 否決(VETO)。
 *
 * 加权模式（可选）下，加权票数相等时按**保守默认**判为拒否，同样不留悬置。
 *
 * `unanimity` 的含义是**三票完全一致**（全票承認 或 全票否決），界面据此显示 `UNANIMOUS` 标记 ——
 * 0:3 的全票否决同样算一致，因此标记要带上真实票数，不能写死 3:0。
 *
 * 纯函数，无任何 DSH 依赖，便于离线单测。
 */

/** @typedef {'APPROVE' | 'REJECT' | 'VETO'} MagiVerdict */

export const VERDICT_LABEL = Object.freeze({
  APPROVE: '承認',
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

/**
 * @param {Array<{ unit: string, stance: string, confidence?: number, error?: string }>} opinions
 * @param {{ criticality?: 'normal' | 'critical', useWeights?: boolean,
 *           weights?: Record<string, number> }} [options]
 */
export function tallyOpinions(opinions, options = {}) {
  const criticality = options.criticality === 'critical' ? 'critical' : 'normal'
  const list = Array.isArray(opinions) ? opinions : []

  const counts = { approve: 0, reject: 0 }
  for (const opinion of list) {
    // 只有 approve 算赞成，其余（含调用失败被记为 reject 的）一律算反对：宁可错杀，不可放过
    if (opinion?.stance === 'approve') counts.approve += 1
    else counts.reject += 1
  }

  const total = list.length
  // 三票完全一致：全票承認 或 全票否決（界面用 UNANIMOUS 标记，需带真实票数）
  const unanimity = counts.approve === total || counts.reject === total
  const notes = []
  let verdict

  if (criticality === 'critical') {
    if (counts.approve === total) {
      verdict = 'APPROVE'
      notes.push('critical 档：三票一致承認')
    } else {
      verdict = 'VETO'
      notes.push(`critical 档：需三票一致，本次 ${counts.reject} 票反对，整体否决`)
    }
  } else if (options.useWeights) {
    const weights = options.weights ?? {}
    const weightOf = (unit) => {
      // 权重表既支持 { melchior: 2 } 这种短名，也支持 { 'MELCHIOR-1': 2 } 这种单元名
      const value = weights?.[unit] ?? weights?.[UNIT_WEIGHT_KEY[unit]]
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 1
    }
    let approveWeight = 0
    let rejectWeight = 0
    for (const opinion of list) {
      const weight = weightOf(opinion?.unit)
      if (opinion?.stance === 'approve') approveWeight += weight
      else rejectWeight += weight
    }
    if (approveWeight > rejectWeight) {
      verdict = 'APPROVE'
      notes.push(`加权多数决：赞成权重 ${round(approveWeight)} > 反对权重 ${round(rejectWeight)}`)
    } else {
      verdict = 'REJECT'
      notes.push(
        approveWeight === rejectWeight
          ? `加权票数相等（各 ${round(approveWeight)}），按保守默认判为拒否`
          : `加权多数决：反对权重 ${round(rejectWeight)} > 赞成权重 ${round(approveWeight)}`,
      )
    }
  } else if (counts.approve >= 2) {
    verdict = 'APPROVE'
    notes.push(`多数决：${counts.approve} 票赞成`)
  } else if (counts.reject === 3) {
    verdict = 'VETO'
    notes.push('三票齐否决')
  } else {
    verdict = 'REJECT'
    notes.push(`多数决：${counts.reject} 票反对`)
  }

  const confidences = list
    .map((opinion) => opinion?.confidence)
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const confidenceAvg = confidences.length === 0
    ? 0
    : round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)

  return { verdict, counts, unanimity, confidenceAvg, criticality, notes, total }
}
