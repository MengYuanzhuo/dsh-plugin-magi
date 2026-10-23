/**
 * BALTHASAR-2 的子功能：把判断写成一份可以真的发出去的文本。
 *
 * 不调用模型 —— 内容是人格自己给的；这里只负责结构、语气标注、落盘与摘要。
 * 目标是把「我担心的是……」变成通知、信件、声明、清单这类可交付物。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'

const KINDS = Object.freeze({
  letter: '信件',
  notice: '通知',
  statement: '声明',
  checklist: '清单',
  memo: '备忘',
  summary: '摘要',
})

const TONES = Object.freeze({
  warm: '温和',
  plain: '平实',
  firm: '坚定',
})

const fail = (message) => {
  const error = new Error(message)
  error.status = 400
  throw error
}

const readText = (value, label, max) => {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} 不能为空`)
  const text = value.trim()
  if (text.length > max) fail(`${label} 超过 ${max} 字`)
  return text
}

const optionalText = (value, label, max) => {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') fail(`${label} 必须是字符串`)
  const text = value.trim()
  if (text.length > max) fail(`${label} 超过 ${max} 字`)
  return text
}

/** 文件名只取标题里的安全字符，绝不接受调用方给的路径。 */
function safeSlug(title) {
  const slug = String(title)
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/[^0-9A-Za-z\u3400-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return slug === '' ? 'draft' : slug
}

function stamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function renderMarkdown({ title, kindLabel, audience, toneLabel, intro, sections, unit }) {
  const lines = [`# ${title}`, '']
  const meta = [`类型：${kindLabel}`]
  if (audience !== '') meta.push(`对象：${audience}`)
  meta.push(`语气：${toneLabel}`)
  meta.push(`起草：${unit}`)
  lines.push(`> ${meta.join(' · ')}`, '')
  if (intro !== '') lines.push(intro, '')
  for (const section of sections) {
    if (section.heading !== '') lines.push(`## ${section.heading}`, '')
    if (section.body !== '') lines.push(section.body, '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function renderPlain({ title, kindLabel, audience, toneLabel, intro, sections, unit }) {
  const lines = [title, '='.repeat(Math.max(4, Math.min(40, title.length))), '']
  const meta = [`类型：${kindLabel}`]
  if (audience !== '') meta.push(`对象：${audience}`)
  meta.push(`语气：${toneLabel}`)
  meta.push(`起草：${unit}`)
  lines.push(meta.join(' · '), '')
  if (intro !== '') lines.push(intro, '')
  for (const section of sections) {
    if (section.heading !== '') lines.push(`【${section.heading}】`)
    if (section.body !== '') lines.push(section.body)
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * @param {Record<string, unknown>} args
 * @param {{ dir: string, unit: string }} context
 * @returns {Promise<{ status: 'ok', kind: string, title: string, path: string, chars: number, preview: string, sections: number, summary: string }>}
 */
export async function composeText(args = {}, { dir, unit } = {}) {
  const input = args !== null && typeof args === 'object' ? args : {}
  if (typeof dir !== 'string' || dir.trim() === '') fail('未配置起草目录，无法生成文本')

  const rawKind = typeof input.kind === 'string' ? input.kind.trim().toLowerCase() : 'memo'
  const kind = Object.prototype.hasOwnProperty.call(KINDS, rawKind) ? rawKind : 'memo'
  const kindLabel = KINDS[kind]
  const title = readText(input.title, 'title', 120)
  const audience = optionalText(input.audience, 'audience', 80)
  const rawTone = typeof input.tone === 'string' ? input.tone.trim().toLowerCase() : 'plain'
  const tone = Object.prototype.hasOwnProperty.call(TONES, rawTone) ? rawTone : 'plain'
  const toneLabel = TONES[tone]
  const format = input.format === 'text' ? 'text' : 'markdown'
  const intro = optionalText(input.body, 'body', 4000)

  let sections = []
  if (input.sections !== undefined) {
    if (!Array.isArray(input.sections)) fail('sections 必须是数组')
    if (input.sections.length > 20) fail('sections 最多 20 段')
    sections = input.sections.map((section, index) => {
      if (section === null || typeof section !== 'object') fail(`sections[${index}] 必须是对象`)
      return {
        heading: optionalText(section.heading, `sections[${index}].heading`, 60),
        body: optionalText(section.body, `sections[${index}].body`, 4000),
      }
    })
  }

  const hasContent = intro !== '' || sections.some((section) => section.body !== '' || section.heading !== '')
  if (!hasContent) fail('正文为空：请给 body 或至少一个 sections')

  const totalChars = intro.length + sections.reduce((sum, section) => sum + section.heading.length + section.body.length, 0)
  if (totalChars > 20_000) fail('正文总长度超过 20000 字')

  const document = format === 'text'
    ? renderPlain({ title, kindLabel, audience, toneLabel, intro, sections, unit: unit || 'BALTHASAR-2' })
    : renderMarkdown({ title, kindLabel, audience, toneLabel, intro, sections, unit: unit || 'BALTHASAR-2' })

  const target = resolve(dir)
  await mkdir(target, { recursive: true })
  const filename = `${stamp(new Date())}-${safeSlug(title)}-${randomUUID().slice(0, 6)}.${format === 'text' ? 'txt' : 'md'}`
  const path = join(target, filename)
  await writeFile(path, document, 'utf8')

  return {
    status: 'ok',
    kind,
    title,
    path,
    chars: document.length,
    preview: document.slice(0, 600),
    sections: sections.length,
    summary: `${kindLabel}《${title}》已写入 ${path}（${document.length} 字${sections.length > 0 ? `，${sections.length} 段` : ''}）`,
  }
}
