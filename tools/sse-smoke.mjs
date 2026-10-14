/**
 * SSE/HTTP 协议冒烟测试：连上事件流 → 发起一次表决 → 校验帧序列是否完整、是否都属于本次表决。
 *
 * 用法（先起 tools/magi-dev-server.mjs）：
 *   node tools/sse-smoke.mjs [--port 8790] [--question "..."] [--timeout 30000]
 *
 * 退出码：0 = 协议符合预期；1 = 有断言失败。
 */

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const port = Number(readArg('port', '8790'))
const base = `http://127.0.0.1:${port}`
const question = readArg('question', '要不要把生产环境的日志级别改成 debug')
const timeoutMs = Number(readArg('timeout', '30000'))

const failures = []
const check = (ok, message) => {
  console.log(`${ok ? '✔' : '✖'} ${message}`)
  if (!ok) failures.push(message)
}

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), timeoutMs)

let ourId = null
const frames = []

const events = await fetch(`${base}/magi/api/events`, { signal: controller.signal })
check(events.ok, `SSE 连接建立（HTTP ${events.status}）`)
check(
  (events.headers.get('content-type') ?? '').includes('text/event-stream'),
  `SSE content-type 正确（${events.headers.get('content-type')}）`,
)

const reader = events.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

const consume = async () => {
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue
        try {
          frames.push(JSON.parse(line.slice(5).trim()))
        } catch {
          // 忽略非 JSON 帧
        }
      }
    }
    // 只认属于本次表决的判决帧；重放的历史帧不参与判定
    if (ourId && frames.some((frame) => frame.type === 'verdict' && frame.id === ourId)) return
  }
}

const streamDone = consume()

const response = await fetch(`${base}/magi/api/vote`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ question }),
  signal: controller.signal,
})
const accepted = await response.json()
ourId = accepted.id

check(response.status === 202, `POST /magi/api/vote 返回 202（实际 ${response.status}）`)
check(typeof ourId === 'string' && ourId.startsWith('magi-'), `返回表决 id：${ourId}`)
check(typeof accepted.criticality === 'string', `返回本次档位：${accepted.criticality}（${accepted.criticalitySource}）`)
check(typeof accepted.displayId === 'string', `返回展示编号：${accepted.displayId}`)

await streamDone
clearTimeout(timer)

const mine = frames.filter((frame) => frame.id === ourId)
const countOf = (type) => mine.filter((frame) => frame.type === type).length
const unitsWithDeltas = new Set(mine.filter((f) => f.type === 'unit-delta').map((f) => f.unit))
const verdictFrame = mine.find((frame) => frame.type === 'verdict')

check(mine.length > 0, `收到属于本次表决的帧 ${mine.length} 个`)
check(countOf('vote') === 1, `开场帧恰好一个（${countOf('vote')}）`)
check(countOf('unit') >= 6, `单元状态帧 ${countOf('unit')} 个（analyzing + output/error，共 3 台）`)
check(countOf('unit-delta') > 0, `逐字增量帧 ${countOf('unit-delta')} 个`)
check(countOf('unit-done') === 3, `三台单元都收尾（${countOf('unit-done')}/3）`)
check(unitsWithDeltas.size === 3, `三台单元都有增量输出（${[...unitsWithDeltas].join(', ')}）`)
check(Boolean(verdictFrame), '收到本次表决的判决帧')
// 连接时重放「上一次已完成表决」是预期行为（刷新页面后仍能看到最近判决）；
// 真正要保证的是：本次表决的开场帧之后，不得再混入其他表决的帧。
const openingIndex = frames.findIndex((frame) => frame.type === 'vote' && frame.id === ourId)
const afterOpening = openingIndex >= 0 ? frames.slice(openingIndex) : []
const foreignAfterOpening = afterOpening.filter((frame) => frame.id !== ourId)
check(openingIndex >= 0, '本次表决的开场帧在流里出现')
check(
  foreignAfterOpening.length === 0,
  `开场帧之后没有混入其他表决的帧（混入 ${foreignAfterOpening.length} 个）`,
)
const replayed = frames.slice(0, Math.max(0, openingIndex))
const replayedIds = new Set(replayed.map((frame) => frame.id))
check(
  replayedIds.size <= 1,
  `连接时的重放最多只涉及一次表决（${replayed.length} 帧，id=${[...replayedIds].join(',') || '无'}）`,
)

if (verdictFrame) {
  const result = verdictFrame.result
  const votes = result.tally
  console.log(
    `  → ${result.id} [${result.criticality}] ${result.verdict} ` +
    `(${votes.approve}:${votes.reject}) ${result.elapsedMs}ms`,
  )
  check(result.opinions.length === 3, '判决帧里带三份原始意见')
  check(typeof result.verdictLabel === 'string', `判决带日式标签：${result.verdictLabel}`)
  check(result.key === ourId, '判决帧的 key 与 POST 返回的 id 一致')
  check(
    Array.isArray(result.personaSources) && result.personaSources.length === 3,
    `判决帧里带三台生效人格的来源与哈希（${(result.personaSources ?? []).map((s) => `${s.unit}:${s.source}`).join(', ')}）`,
  )

  // 复核计票规则（critical 需三票一致；三台单元只能选边）
  if (result.criticality === 'critical') {
    const expected = votes.reject > 0 ? 'VETO' : 'APPROVE'
    check(result.verdict === expected, `critical 计票符合规则（期望 ${expected}，实际 ${result.verdict}）`)
  } else if (votes.approve >= 2) {
    check(result.verdict === 'APPROVE', 'normal 多数赞成 → APPROVE')
  } else if (votes.reject === 3) {
    check(result.verdict === 'VETO', '三票齐否决 → VETO')
  }
  check(votes.abstain === undefined, '计票里不再有 abstain 字段')

  const fetched = await fetch(`${base}/magi/api/result?id=${encodeURIComponent(result.key)}`)
  check(fetched.ok, 'GET /magi/api/result 能取回同一条记录')

  const history = await fetch(`${base}/magi/api/history?limit=5`).then((r) => r.json())
  check(Array.isArray(history.items) && history.items.some((item) => item.key === result.key), '账本里能找到这次表决')
}

console.log(failures.length === 0 ? '\n协议冒烟测试通过' : `\n协议冒烟测试失败：${failures.length} 项`)
process.exit(failures.length === 0 ? 0 : 1)
