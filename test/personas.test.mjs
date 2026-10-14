/**
 * 人格外部文件层测试：解析顺序、缓存失效、空文件回退与告警、导出不覆盖、公共契约覆盖。
 * 运行：node test/personas.test.mjs
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PERSONAS, buildSystemPrompt } from '../lib/personas.js'
import {
  contractFilePath,
  describeContract,
  describePersonas,
  exportPersonaFiles,
  personaFilePath,
  resolveContractPrompt,
  resolvePersonaPrompt,
} from '../lib/persona-files.js'

const melchior = PERSONAS[0]
const casper = PERSONAS[2]

const makeDir = () => mkdtemp(join(tmpdir(), 'magi-personas-'))

/** 契约文件路径（单独包一层，避免测试里重复写字符串）。 */
const contractFileFor = (dir) => contractFilePath(dir)

test('人格文件：目录为空/未配置时使用内置默认', async () => {
  const dir = await makeDir()
  try {
    const missing = await resolvePersonaPrompt(dir, melchior, {})
    assert.equal(missing.source, 'builtin')
    assert.equal(missing.prompt, melchior.prompt)
    assert.equal(missing.path, undefined)

    const unset = await resolvePersonaPrompt('', melchior, {})
    assert.equal(unset.source, 'builtin')
    assert.ok(unset.sha256.length === 64)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('人格文件：存在则优先，内容变化后缓存失效且哈希改变', async () => {
  const dir = await makeDir()
  try {
    const path = personaFilePath(dir, melchior)
    assert.equal(path, join(dir, 'melchior.md'), '文件基名应取 temperatureKey')

    await writeFile(path, '你是测试人格 A', 'utf8')
    const first = await resolvePersonaPrompt(dir, melchior, {})
    assert.equal(first.source, 'file')
    assert.equal(first.prompt, '你是测试人格 A')
    assert.ok(first.sha256.length === 64)

    // 内容变长 → size/mtime 变化 → 必须重读
    await writeFile(path, '你是测试人格 B，比上一版更长一些', 'utf8')
    const second = await resolvePersonaPrompt(dir, melchior, {})
    assert.equal(second.prompt, '你是测试人格 B，比上一版更长一些')
    assert.notEqual(second.sha256, first.sha256, '不同人格应有不同哈希')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('人格文件：空文件（或纯空白）回退内置并显式告警', async () => {
  const dir = await makeDir()
  try {
    await writeFile(personaFilePath(dir, casper), '   \n\n\t\n', 'utf8')
    const warnings = []
    const resolved = await resolvePersonaPrompt(dir, casper, { logger: { warn: (message) => warnings.push(String(message)) } })
    assert.equal(resolved.source, 'builtin', '绝不能把空人格当成有效人格')
    assert.equal(resolved.prompt, casper.prompt)
    assert.ok(warnings.some((line) => line.includes('为空')), `应给出告警，实际：${warnings.join(' / ')}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('人格文件：读取失败（目录同名）回退内置并告警', async () => {
  const dir = await makeDir()
  try {
    // 用目录占位 melchior.md，制造一个「存在但读不出来」的情形
    const { mkdir } = await import('node:fs/promises')
    await mkdir(personaFilePath(dir, melchior), { recursive: true })
    const warnings = []
    const resolved = await resolvePersonaPrompt(dir, melchior, { logger: { warn: (message) => warnings.push(String(message)) } })
    assert.equal(resolved.source, 'builtin')
    assert.ok(warnings.length > 0, '应给出告警')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('导出：写入模板但不覆盖已存在的文件，force 才覆盖（含公共契约）', async () => {
  const dir = await makeDir()
  try {
    const first = await exportPersonaFiles(dir)
    assert.equal(first.written.length, PERSONAS.length + 1, '三份人格 + 一份公共契约')
    assert.equal(first.skipped.length, 0)
    assert.ok(first.written.includes(contractFilePath(dir)), '契约也要导出')

    // 用户改过其中一份
    const path = personaFilePath(dir, casper)
    await writeFile(path, '我自己写的人格', 'utf8')

    const second = await exportPersonaFiles(dir)
    assert.deepEqual(second.written, [], '不应覆盖用户改过的文件')
    assert.equal(second.skipped.length, PERSONAS.length + 1)
    assert.equal((await readFile(path, 'utf8')).trim(), '我自己写的人格')

    const forced = await exportPersonaFiles(dir, { force: true })
    assert.equal(forced.written.length, PERSONAS.length + 1)
    assert.equal((await readFile(path, 'utf8')).trim(), casper.prompt)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('公共契约：默认内置，contract.md 存在则优先，空文件回退并告警', async () => {
  const dir = await makeDir()
  try {
    const builtin = await resolveContractPrompt(dir, {})
    assert.equal(builtin.source, 'builtin')
    assert.ok(builtin.prompt.includes('说话方式'), '内置契约应含「说话方式」一节')

    await writeFile(contractFileFor(dir), '只准说短句。', 'utf8')
    const fromFile = await resolveContractPrompt(dir, {})
    assert.equal(fromFile.source, 'file')
    assert.equal(fromFile.prompt, '只准说短句。')

    const described = await describeContract(dir, {})
    assert.equal(described.fileKey, 'contract')
    assert.equal(described.source, 'file')

    await writeFile(contractFileFor(dir), '   \n', 'utf8')
    const warnings = []
    const fallback = await resolveContractPrompt(dir, { logger: { warn: (m) => warnings.push(String(m)) } })
    assert.equal(fallback.source, 'builtin', '空契约不能生效')
    assert.ok(warnings.some((line) => line.includes('契约文件为空')), `应告警，实际：${warnings.join(' / ')}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('buildSystemPrompt：契约可被覆盖，默认拼内置契约', () => {
  const withBuiltin = buildSystemPrompt(PERSONAS[0], { criticality: 'normal' })
  assert.ok(withBuiltin.includes('说话方式'), '默认应拼内置契约')

  const overridden = buildSystemPrompt(PERSONAS[0], { criticality: 'normal' }, { contract: '覆盖后的契约' })
  assert.ok(overridden.trim().endsWith('覆盖后的契约'))
  assert.ok(!overridden.includes('说话方式'), '覆盖后不应再拼内置契约')
})

test('describePersonas：报告来源、哈希与字数', async () => {
  const dir = await makeDir()
  try {
    await writeFile(personaFilePath(dir, melchior), '简短的外部人格', 'utf8')
    const units = await describePersonas(dir, {})
    assert.equal(units.length, 3)
    const byUnit = new Map(units.map((entry) => [entry.unit, entry]))
    assert.equal(byUnit.get('MELCHIOR-1').source, 'file')
    assert.equal(byUnit.get('MELCHIOR-1').chars, '简短的外部人格'.length)
    assert.equal(byUnit.get('BALTHASAR-2').source, 'builtin')
    assert.equal(byUnit.get('BALTHASAR-2').fileKey, 'balthasar')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
