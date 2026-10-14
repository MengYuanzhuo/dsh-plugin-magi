/**
 * 账本：每次表决追加一行 JSON（JSONL），并维护一份轻量索引，便于不再全量扫描。
 *
 * 目录默认 `.magi/`（相对进程工作目录，即会话工作区），可用 config.ledgerDir 改。
 * 文件：
 *   ledger.jsonl        —— 每条记录一行，含三份原始意见与判决
 *   ledger.index.json   —— 最近 500 条的摘要索引（key / id / 判决 / 时间）
 *   counter.json        —— 决策编号计数器（MAGI-DECISION No.000N）
 */

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const LEDGER_FILE = 'ledger.jsonl'
const INDEX_FILE = 'ledger.index.json'
const COUNTER_FILE = 'counter.json'
const INDEX_LIMIT = 500

export class Ledger {
  /**
   * @param {{ dir?: string, historyLimit?: number }} [options]
   */
  constructor(options = {}) {
    this.dir = resolve(options.dir ?? '.magi')
    this.historyLimit = Number.isFinite(options.historyLimit) ? options.historyLimit : 50
    this.counter = { seq: 0 }
    this.index = []
    this.initialized = null
    this.queue = Promise.resolve()
  }

  get ledgerPath() {
    return join(this.dir, LEDGER_FILE)
  }

  /** 幂等地准备目录与计数器/索引。 */
  init() {
    if (this.initialized) return this.initialized
    this.initialized = (async () => {
      await mkdir(this.dir, { recursive: true })
      this.counter = await this.#readJson(join(this.dir, COUNTER_FILE), { seq: 0 })
      if (!Number.isFinite(this.counter?.seq)) this.counter = { seq: 0 }
      const index = await this.#readJson(join(this.dir, INDEX_FILE), [])
      this.index = Array.isArray(index) ? index.slice(0, INDEX_LIMIT) : []
    })()
    return this.initialized
  }

  /** 串行化写操作，避免并发表决互相踩计数器/索引。 */
  #serialize(task) {
    const run = this.queue.then(task, task)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async #readJson(path, fallback) {
    try {
      const text = await readFile(path, 'utf8')
      return JSON.parse(text)
    } catch {
      return fallback
    }
  }

  /** 取下一个决策编号。 */
  async nextSeq() {
    await this.init()
    return this.#serialize(async () => {
      this.counter = { seq: (Number(this.counter?.seq) || 0) + 1 }
      await writeFile(join(this.dir, COUNTER_FILE), JSON.stringify(this.counter), 'utf8')
      return this.counter.seq
    })
  }

  /** 追加一条表决记录。 */
  async append(result) {
    await this.init()
    return this.#serialize(async () => {
      await appendFile(this.ledgerPath, `${JSON.stringify(result)}\n`, 'utf8')
      this.index.unshift({
        key: result.key,
        id: result.id,
        createdAt: result.createdAt,
        verdict: result.verdict,
        criticality: result.criticality,
        question: typeof result.question === 'string' ? result.question.slice(0, 120) : '',
      })
      if (this.index.length > INDEX_LIMIT) this.index.length = INDEX_LIMIT
      await writeFile(join(this.dir, INDEX_FILE), JSON.stringify(this.index, null, 2), 'utf8')
    })
  }

  /** 读取最近 `limit` 条（新→旧）。 */
  async read(limit = this.historyLimit) {
    await this.init()
    let text = ''
    try {
      text = await readFile(this.ledgerPath, 'utf8')
    } catch {
      return []
    }
    const lines = text.split('\n').filter((line) => line.trim() !== '')
    const out = []
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
      try {
        out.push(JSON.parse(lines[i]))
      } catch {
        // 跳过损坏行
      }
    }
    return out
  }

  /** 按 key 取单条记录。 */
  async get(key) {
    await this.init()
    if (typeof key !== 'string' || key === '') return undefined
    let text = ''
    try {
      text = await readFile(this.ledgerPath, 'utf8')
    } catch {
      return undefined
    }
    const lines = text.split('\n')
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (!lines[i]?.includes(key)) continue
      try {
        const parsed = JSON.parse(lines[i])
        if (parsed?.key === key) return parsed
      } catch {
        // 跳过损坏行
      }
    }
    return undefined
  }

  /** 索引摘要（不含完整意见）。 */
  async summary(limit = this.historyLimit) {
    await this.init()
    return this.index.slice(0, limit)
  }
}
