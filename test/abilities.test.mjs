/**
 * 三家子功能测试：欲望读数 / 文本起草 / 脚本运行 / 能力注册表与提示词。
 * 运行：node test/abilities.test.mjs
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { normalizeConfig } from '../lib/config.js'
import { desireMap } from '../lib/desire-map.js'
import { composeText } from '../lib/text-composer.js'
import { listScriptEngines, runScript } from '../lib/script-runner.js'
import {
  abilityForUnit,
  describeAbilityForPrompt,
  executeAbility,
  parseToolRequest,
} from '../lib/abilities.js'

const makeDir = (prefix) => mkdtemp(join(tmpdir(), prefix))

const desireArgs = () => ({
  question: '要不要现在答应这件事',
  options: [
    { id: 'A', label: '答应，本周上线', fit: 'partial', violatesRefusal: false, price: '一次难看的对话' },
    { id: 'B', label: '拒绝，继续等', fit: 'high', violatesRefusal: false, price: '关系可能冷下来' },
  ],
  want: '不再被当成可以随时推迟的人',
  wantBehindWant: '我的时间也算数',
  price: '一次难看的对话，但不替别人通宵',
  refusals: ['不接受事后被说成是我自己同意的'],
  owner: 'mine',
  visibility: 'yes',
  affect: '想到答应胃是紧的，想到拒绝反而松一口气',
  competing: [{ want: '不想再拖', rank: 1 }],
  regret: {
    tenMinutes: '会有点怕',
    tenMonths: '会觉得自己当时很清醒',
    tenYears: '会记得我没有把自己卖便宜',
  },
  forcedChoice: 'B',
})

/* ------------------------------ CASPER：欲望 ------------------------------ */

test('欲望：完整读数返回想要 / 价格 / 底线 / 所有权，且不替她做决定', () => {
  const result = desireMap(desireArgs())
  assert.equal(result.status, 'ok')
  assert.equal(result.mode, 'desire_map')
  assert.equal(result.readout.want, '不再被当成可以随时推迟的人')
  assert.equal(result.readout.owner, 'mine')
  assert.equal(result.readout.visibility, 'yes')
  assert.deepEqual(result.readout.refusals, ['不接受事后被说成是我自己同意的'])
  assert.equal(result.readout.forcedChoice, 'B')
  assert.equal(result.readout.flags.length, 0)
  assert.equal(result.readout.tie, false)
  assert.ok(result.summary.includes('欲望读数'))
})

test('欲望：借来的欲望 / 看不见时不要 / 违反底线都会被标出来', () => {
  const result = desireMap({
    ...desireArgs(),
    owner: 'borrowed',
    borrowedFrom: '老板希望我主动背这个锅',
    visibility: 'no',
    options: [
      { id: 'A', label: '答应', fit: 'high', violatesRefusal: true, price: '背锅' },
      { id: 'B', label: '拒绝', fit: 'partial', violatesRefusal: false, price: '被说不合群' },
    ],
    forcedChoice: 'A',
  })
  const codes = result.readout.flags.map((flag) => flag.code)
  assert.ok(codes.includes('borrowed-desire'))
  assert.ok(codes.includes('status-trap'))
  assert.ok(codes.includes('refusal-risk'))
  assert.ok(codes.includes('chosen-violates-refusal'))
})

test('欲望：太浅的图会被拒绝（want 重复 / 价格太泛 / 缺底线 / 缺十年回看）', () => {
  assert.throws(() => desireMap({ ...desireArgs(), wantBehindWant: '不再被当成可以随时推迟的人' }), /wantBehindWant/)
  assert.throws(() => desireMap({ ...desireArgs(), price: '一些代价' }), /price 太泛/)
  assert.throws(() => desireMap({ ...desireArgs(), refusals: [] }), /refusals/)
  assert.throws(() => desireMap({ ...desireArgs(), regret: { tenMonths: '会后悔' } }), /tenYears/)
  assert.throws(() => desireMap({ ...desireArgs(), forcedChoice: 'Z' }), /forcedChoice/)
  assert.throws(() => desireMap({ ...desireArgs(), affect: '  ' }), /affect/)
})

test('欲望：只有真正打平时才允许 tieBreak，返回结果与探针', () => {
  const tied = {
    ...desireArgs(),
    options: [
      { id: 'A', label: '答应', fit: 'high', violatesRefusal: false, price: '同一件事' },
      { id: 'B', label: '拒绝', fit: 'high', violatesRefusal: false, price: '同一件事' },
    ],
    forcedChoice: 'undecided',
    tieBreak: true,
  }
  const result = desireMap(tied)
  assert.equal(result.readout.tie, true)
  assert.ok(['A', 'B'].includes(result.readout.tieBreak.result))
  assert.match(result.readout.tieBreak.probe, /松了口气|失望/)
  assert.match(result.readout.tieBreak.responsible, /不是替你负责/)

  assert.throws(() => desireMap({ ...desireArgs(), tieBreak: true }), /tieBreak/)
})

/* ------------------------------ BALTHASAR：文本 ----------------------------- */

test('文本：Markdown 起草写入文件，标题/对象/语气/段落齐全', async () => {
  const dir = await makeDir('magi-drafts-')
  try {
    const result = await composeText({
      kind: 'notice',
      title: '关于暂停旧表删除的通知',
      audience: '受影响的值班同学',
      tone: 'warm',
      body: '先说结论：这周先不删。',
      sections: [
        { heading: '为什么', body: '旧表里还有没核对完的账。' },
        { heading: '接下来', body: '周五前把核对清单补齐。' },
      ],
    }, { dir, unit: 'BALTHASAR-2' })
    assert.equal(result.status, 'ok')
    assert.equal(result.kind, 'notice')
    assert.equal(result.sections, 2)
    const text = await readFile(result.path, 'utf8')
    assert.ok(text.includes('# 关于暂停旧表删除的通知'))
    assert.ok(text.includes('## 为什么'))
    assert.ok(text.includes('受影响的值班同学'))
    assert.ok(text.includes('BALTHASAR-2'))
    assert.ok(result.preview.length > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('文本：纯文本格式、空正文与超长参数被拒绝', async () => {
  const dir = await makeDir('magi-drafts-plain-')
  try {
    const result = await composeText({
      kind: 'memo',
      title: '短备忘',
      format: 'text',
      body: '一行话。',
    }, { dir, unit: 'BALTHASAR-2' })
    assert.equal(result.status, 'ok')
    assert.ok(result.path.endsWith('.txt'))
    assert.ok((await readFile(result.path, 'utf8')).includes('短备忘'))

    await assert.rejects(() => composeText({ title: '空', body: '   ' }, { dir, unit: 'BALTHASAR-2' }), /正文为空/)
    await assert.rejects(() => composeText({ title: 'x'.repeat(121), body: 'y' }, { dir, unit: 'BALTHASAR-2' }), /title/)
    await assert.rejects(() => composeText({ title: 'x', body: 'y' }, { dir: '', unit: 'BALTHASAR-2' }), /起草目录/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

/* ------------------------------ MELCHIOR：脚本 ----------------------------- */

test('脚本：JavaScript 输出、非零退出码与超时', async () => {
  const dir = await makeDir('magi-script-')
  const previous = process.env.MAGI_NODE
  process.env.MAGI_NODE = process.execPath
  try {
    const ok = await runScript({
      engine: 'javascript',
      code: 'console.log(2 + 3)',
      labDir: dir,
      timeoutMs: 5000,
      maxOutputChars: 2000,
      unit: 'MELCHIOR-1',
    })
    assert.equal(ok.status, 'ok')
    assert.equal(ok.exitCode, 0)
    assert.match(ok.outputPreview, /5/)
    assert.equal(ok.engine, 'javascript')
    assert.ok(ok.scriptPath.startsWith(dir))

    const failed = await runScript({
      engine: 'javascript',
      code: 'console.error("boom"); process.exit(7)',
      labDir: dir,
      timeoutMs: 5000,
      maxOutputChars: 2000,
      unit: 'MELCHIOR-1',
    })
    assert.equal(failed.status, 'error')
    assert.equal(failed.exitCode, 7)
    assert.match(failed.outputPreview, /boom/)

    const timedOut = await runScript({
      engine: 'javascript',
      code: 'setInterval(function () {}, 1000)',
      labDir: dir,
      timeoutMs: 800,
      maxOutputChars: 2000,
      unit: 'MELCHIOR-1',
    })
    assert.equal(timedOut.status, 'timeout')
  } finally {
    if (previous === undefined) delete process.env.MAGI_NODE
    else process.env.MAGI_NODE = previous
    await rm(dir, { recursive: true, force: true })
  }
})

test('脚本：输出截断、空代码与未知引擎被拒绝', async () => {
  const dir = await makeDir('magi-script-limits-')
  const previous = process.env.MAGI_NODE
  process.env.MAGI_NODE = process.execPath
  try {
    const result = await runScript({
      engine: 'javascript',
      code: 'console.log("x".repeat(5000))',
      labDir: dir,
      timeoutMs: 5000,
      maxOutputChars: 500,
      unit: 'MELCHIOR-1',
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.outputPreview.length, 500)
    assert.equal(result.truncated, true)

    await assert.rejects(() => runScript({ engine: 'javascript', code: '   ' }, { labDir: dir }), /code/)
    await assert.rejects(() => runScript({ engine: 'not-a-language', code: 'x', labDir: dir }), /未知引擎/)
  } finally {
    if (previous === undefined) delete process.env.MAGI_NODE
    else process.env.MAGI_NODE = previous
    await rm(dir, { recursive: true, force: true })
  }
})

test('脚本：当前机器的引擎清单包含内置 JavaScript 与 PowerShell', () => {
  const engines = listScriptEngines()
  const ids = engines.map((item) => item.id)
  assert.ok(ids.includes('javascript'))
  assert.ok(ids.includes('python'))
  assert.ok(ids.includes('powershell'))
  assert.equal(engines.find((item) => item.id === 'javascript').available, true)
})

/* --------------------------- 能力注册表 / 工具回合 --------------------------- */

test('能力：每家只能调用自己的工具，结果结构化', async () => {
  const dir = await makeDir('magi-abilities-')
  const { config } = normalizeConfig({
    ledgerDir: dir,
    abilities: { enabled: true, maxToolCallsPerUnit: 2, labDir: dir, draftsDir: dir, scriptTimeoutMs: 5000 },
  })
  try {
    const desire = await executeAbility({
      unit: 'CASPER-3',
      tool: 'desire_map',
      note: '我想先看清自己要什么',
      args: desireArgs(),
      config,
    })
    assert.equal(desire.status, 'ok')
    assert.equal(desire.tool, 'desire_map')
    assert.equal(desire.note, '我想先看清自己要什么')
    assert.equal(desire.readout.want, '不再被当成可以随时推迟的人')

    const text = await executeAbility({
      unit: 'BALTHASAR-2',
      tool: 'compose_text',
      args: { kind: 'checklist', title: '核对清单', sections: [{ heading: '一', body: '确认可回滚' }] },
      config,
    })
    assert.equal(text.status, 'ok')
    assert.ok(text.path.startsWith(dir))

    const rejected = await executeAbility({
      unit: 'CASPER-3',
      tool: 'run_script',
      args: { engine: 'javascript', code: '1' },
      config,
    })
    assert.equal(rejected.status, 'rejected')
    assert.match(rejected.error, /只能调用 desire_map/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('能力：提示词按单元注入，关闭后为空', () => {
  const { config } = normalizeConfig({ abilities: { enabled: true } })
  const melchior = describeAbilityForPrompt('MELCHIOR-1', config)
  assert.match(melchior, /run_script/)
  assert.match(melchior, /python/)
  const balthasar = describeAbilityForPrompt('BALTHASAR-2', config)
  assert.match(balthasar, /compose_text/)
  assert.match(balthasar, /letter/)
  const casper = describeAbilityForPrompt('CASPER-3', config)
  assert.match(casper, /desire_map/)
  assert.match(casper, /wantBehindWant/)
  assert.match(casper, /tieBreak/)

  const disabled = normalizeConfig({ abilities: { enabled: false } }).config
  assert.equal(describeAbilityForPrompt('MELCHIOR-1', disabled), '')
})

test('能力：工具请求解析拒绝非工具 JSON，并保留第一人称 note', () => {
  assert.deepEqual(
    parseToolRequest({ action: 'tool', tool: 'desire_map', note: '我想先看清自己要什么', args: {} }),
    { tool: 'desire_map', note: '我想先看清自己要什么', args: {} },
  )
  assert.deepEqual(
    parseToolRequest({ tool: 'compose_text', args: {} }),
    { tool: 'compose_text', note: '', args: {} },
  )
  assert.equal(parseToolRequest({ action: 'final', tool: 'x' }), null)
  assert.equal(parseToolRequest({ stance: 'approve' }), null)
  assert.equal(parseToolRequest(null), null)
})

test('能力：单元映射与常量一致', () => {
  assert.equal(abilityForUnit('MELCHIOR-1').name, 'run_script')
  assert.equal(abilityForUnit('BALTHASAR-2').name, 'compose_text')
  assert.equal(abilityForUnit('CASPER-3').name, 'desire_map')
  assert.equal(abilityForUnit('UNKNOWN'), null)
})
