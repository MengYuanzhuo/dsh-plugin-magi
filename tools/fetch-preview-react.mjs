/**
 * 仅用于**预览页**：从 npm registry 取 React / React-DOM 的 UMD 产物放进 preview/vendor/。
 *
 * 为什么需要：DSH 的 app.asar 里没有 React 包（React 由 Web 宿主在运行时提供给客户端插件），
 * 所以离线预览页必须自带一份。**这份文件不进入插件运行时路径** —— lib/client.js 里仍然是
 * `require("react")`，由宿主提供。
 *
 * 用法：node tools/fetch-preview-react.mjs [--version 18.3.1] [--force]
 * 幂等：文件已存在就跳过（除非 --force）。
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const vendorDir = join(packageDir, 'preview', 'vendor')

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const version = readArg('version', '18.3.1')
const force = args.includes('--force')

const TARGETS = [
  { pkg: 'react', file: 'umd/react.production.min.js', out: 'react.production.min.js' },
  { pkg: 'react-dom', file: 'umd/react-dom.production.min.js', out: 'react-dom.production.min.js' },
]

const exists = async (path) => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** 极简 tar 解包：按 512 字节块遍历，只取需要的成员。 */
function untar(buffer, wanted) {
  const files = new Map()
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    if (name === '') break
    const sizeField = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim()
    const size = Number.parseInt(sizeField, 8) || 0
    const dataStart = offset + 512
    if (wanted.includes(name)) files.set(name, buffer.subarray(dataStart, dataStart + size))
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return files
}

async function fetchTarball(pkg, pkgVersion) {
  const metaUrl = `https://registry.npmjs.org/${pkg}/${pkgVersion}`
  const meta = await fetch(metaUrl).then((response) => {
    if (!response.ok) throw new Error(`${metaUrl} → HTTP ${response.status}`)
    return response.json()
  })
  const tarball = meta?.dist?.tarball
  if (typeof tarball !== 'string') throw new Error(`${pkg}@${pkgVersion} 的元数据里没有 dist.tarball`)
  console.log(`  下载 ${pkg}@${pkgVersion} ← ${tarball}`)
  const response = await fetch(tarball)
  if (!response.ok) throw new Error(`${tarball} → HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

await mkdir(vendorDir, { recursive: true })

let fetched = 0
let skipped = 0

for (const target of TARGETS) {
  const outPath = join(vendorDir, target.out)
  if (!force && (await exists(outPath))) {
    console.log(`✔ 已存在，跳过 ${target.out}`)
    skipped += 1
    continue
  }
  try {
    const tarball = await fetchTarball(target.pkg, version)
    const members = untar(gunzipSync(tarball), [`package/${target.file}`])
    const body = members.get(`package/${target.file}`)
    if (!body) throw new Error(`压缩包里没有 ${target.file}`)
    await writeFile(outPath, body)
    console.log(`✔ 写入 preview/vendor/${target.out}（${body.length} 字节）`)
    fetched += 1
  } catch (error) {
    console.error(`✖ ${target.pkg} 获取失败：${error instanceof Error ? error.message : String(error)}`)
    console.error('  预览页需要这两个文件；若本机无法访问 npm registry，请手工放入 preview/vendor/。')
    process.exitCode = 1
  }
}

console.log(`\n完成：新增 ${fetched} 个，跳过 ${skipped} 个 → ${vendorDir}`)
