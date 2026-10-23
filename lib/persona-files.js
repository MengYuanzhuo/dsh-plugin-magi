/**
 * 人格提示词的**外部文件层**。
 *
 * 解析顺序：`<personasDir>/<key>.md` 存在且非空 → 用文件内容；否则用 `lib/personas.js` 的内置默认。
 * 同一目录下的 `contract.md` 覆盖**公共输出契约**（说话方式与判定规则），语义相同 —— 于是
 * 连「反 AI 腔」这类风格规则也可以热改，不用重启。
 *
 * 失败语义（三台单元自己提的条件）：
 * - 文件**不存在** = 用户没有自定义 → 静默使用内置，不算错误；
 * - 读取失败 / 内容为空 → 用内置并**显式告警**（不能「读到空人格而不自知」）；
 * - **每次表决现读**（带 mtime+size 缓存）→ 改人格文件即时生效，不需要重启、不需要重载；
 * - 每票都记录生效人格的 **sha256**（进结果与账本），于是"谁在什么时候改了人格"可追溯。
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { OUTPUT_CONTRACT, PERSONAS } from './personas.js'

/** 公共契约的外部文件名。 */
const CONTRACT_FILE = 'contract.md'

/** path → { mtimeMs, size, prompt, sha256 }，按文件元数据失效。 */
const cache = new Map()

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/** 生成带 HTTP 状态码的错误；保存路径的校验失败共用。 */
const fail = (message, status = 400) => {
  const error = new Error(message)
  error.status = status
  throw error
}

const fileExists = async (path) => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** 某个单元的人格文件路径。 */
export function personaFilePath(dir, persona) {
  return join(resolve(dir), `${persona.temperatureKey}.md`)
}

/** 公共契约的文件路径。 */
export function contractFilePath(dir) {
  return join(resolve(dir), CONTRACT_FILE)
}

/**
 * 通用解析：`<dir>/<file>` 存在且非空 → 用文件；否则用 `builtin`。
 * @returns {Promise<{ prompt: string, source: 'file' | 'builtin', path?: string, sha256: string }>}
 */
async function resolveTextFile(dir, path, builtinText, label, { logger } = {}) {
  const builtin = { prompt: builtinText, source: 'builtin', sha256: sha256(builtinText) }
  if (typeof dir !== 'string' || dir.trim() === '') return builtin

  let info
  try {
    info = await stat(path)
  } catch (error) {
    // 文件不存在是正常状态（未自定义）；其它错误要告警
    if (error?.code !== 'ENOENT') {
      logger?.warn?.(`[magi] ${label}无法访问，已回退内置：${path}（${error?.message ?? error}）`)
    }
    return builtin
  }

  try {
    const cached = cache.get(path)
    if (cached !== undefined && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return { prompt: cached.prompt, source: 'file', path, sha256: cached.sha256 }
    }
    const prompt = (await readFile(path, 'utf8')).trim()
    if (prompt === '') {
      logger?.warn?.(`[magi] ${label}为空，已回退内置：${path}`)
      return builtin
    }
    const entry = { mtimeMs: info.mtimeMs, size: info.size, prompt, sha256: sha256(prompt) }
    cache.set(path, entry)
    return { prompt, source: 'file', path, sha256: entry.sha256 }
  } catch (error) {
    logger?.warn?.(`[magi] ${label}读取失败，已回退内置：${path}（${error?.message ?? error}）`)
    return builtin
  }
}

/**
 * 解析某个单元当前生效的人格正文。
 * @returns {Promise<{ prompt: string, source: 'file' | 'builtin', path?: string, sha256: string }>}
 */
export async function resolvePersonaPrompt(dir, persona, { logger } = {}) {
  return resolveTextFile(dir, personaFilePath(dir, persona), persona.prompt, '人格文件', { logger })
}

/**
 * 解析当前生效的公共契约（说话方式 + 判定规则）。
 * @returns {Promise<{ prompt: string, source: 'file' | 'builtin', path?: string, sha256: string }>}
 */
export async function resolveContractPrompt(dir, { logger } = {}) {
  return resolveTextFile(dir, contractFilePath(dir), OUTPUT_CONTRACT, '契约文件', { logger })
}

/** 把内置人格与契约导出成可编辑的模板文件；默认**不覆盖**已存在的文件。 */
export async function exportPersonaFiles(dir, { force = false } = {}) {
  const target = resolve(dir)
  await mkdir(target, { recursive: true })
  const written = []
  const skipped = []
  const jobs = [
    ...PERSONAS.map((persona) => [personaFilePath(target, persona), persona.prompt]),
    [contractFilePath(target), OUTPUT_CONTRACT],
  ]
  for (const [path, text] of jobs) {
    if (!force && await fileExists(path)) {
      skipped.push(path)
      continue
    }
    await writeFile(path, `${text}\n`, 'utf8')
    written.push(path)
  }
  return { dir: target, written, skipped }
}

/**
 * 手动保存某台单元的人格正文（端末盘面点击后的编辑弹层用）。
 *
 * 只接受三台已知单元并把文件锁定在 `<personasDir>/<fileKey>.md`，不做任意路径写入。
 * 写入成功后清掉解析缓存 —— 即使文件大小与 mtime 恰好没变，**下一次表决也会读到新正文**。
 *
 * @param {string} dir
 * @param {string} unit
 * @param {string} text
 * @returns {Promise<{ unit: string, fileKey: string, source: 'file', path: string, sha256: string, chars: number, prompt: string }>}
 */
export async function savePersonaText(dir, unit, text) {
  const persona = PERSONAS.find((entry) => entry.unit === unit)
  if (persona === undefined) fail(`未知单元：${String(unit)}`, 400)
  if (typeof dir !== 'string' || dir.trim() === '') fail('未配置 personasDir，无法保存人格文件', 400)
  if (typeof text !== 'string' || text.trim() === '') fail('人格内容不能为空', 400)
  if (text.length > 200_000) fail('人格内容过大（上限 200000 字符）', 413)

  const target = personaFilePath(dir, persona)
  const prompt = text.trim()
  await mkdir(resolve(dir), { recursive: true })
  // 先清缓存，避免写入与下一次读取之间命中旧条目
  cache.delete(target)
  await writeFile(target, `${prompt}\n`, 'utf8')
  cache.delete(target)
  return {
    unit: persona.unit,
    fileKey: persona.temperatureKey,
    source: 'file',
    path: target,
    sha256: sha256(prompt),
    chars: prompt.length,
    prompt,
  }
}

/** 当前三台的人格来源与哈希（供 `magi_personas` 工具与诊断路由使用）。 */
export async function describePersonas(dir, { logger } = {}) {
  const out = []
  for (const persona of PERSONAS) {
    const resolved = await resolvePersonaPrompt(dir, persona, { logger })
    out.push({
      unit: persona.unit,
      attribute: persona.attribute,
      fileKey: persona.temperatureKey,
      source: resolved.source,
      path: resolved.path,
      sha256: resolved.sha256,
      chars: resolved.prompt.length,
      preview: resolved.prompt.split('\n').slice(0, 2).join(' ').slice(0, 80),
      prompt: resolved.prompt,
    })
  }
  return out
}

/** 当前生效契约的来源与哈希。 */
export async function describeContract(dir, { logger } = {}) {
  const resolved = await resolveContractPrompt(dir, { logger })
  return {
    fileKey: 'contract',
    source: resolved.source,
    path: resolved.path,
    sha256: resolved.sha256,
    chars: resolved.prompt.length,
    prompt: resolved.prompt,
  }
}

/** 当前三台人格 + 公共契约的快照；工具 `magi_personas` 与 HTTP 路由共用同一形状。 */
export async function describePersonaSet(config, { logger } = {}) {
  return {
    dir: config.personasDir || null,
    units: await describePersonas(config.personasDir, { logger }),
    contract: await describeContract(config.personasDir, { logger }),
  }
}
