/**
 * 从本机 DSH 安装里**原样切出**真实的 React 18 + ReactDOM（生产构建），打包成一份自包含 UMD，
 * 供 `preview/` 离线预览使用。
 *
 * 为什么不去 npm 拿：宿主 Web GUI 用的就是前端 bundle 里内联的这份 React，
 * 用它做预览才与真实渲染环境一致；而且全程离线、不装依赖、只读 asar。
 * （备用方案：`tools/fetch-preview-react.mjs` 从 npm registry 取官方 UMD。）
 *
 * 用法：
 *   node tools/extract-host-react.cjs [--out preview/vendor/react-magi-umd.js]
 *                                     [--archive "D:\DSH\resources\app.asar"]
 *
 * 说明：这是一个 .cjs（CommonJS），因为包的 `type` 是 module。
 */

const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const packageDir = path.resolve(__dirname, '..')
const ARCHIVE = readArg('archive', 'D:\\DSH\\resources\\app.asar')
const OUT = path.resolve(packageDir, readArg('out', 'preview/vendor/react-magi-umd.js'))

/* ------------------------- 最小 asar 读取（只读） ------------------------- */

const fd = fs.openSync(ARCHIVE, 'r')
const sizeBuf = Buffer.alloc(8)
fs.readSync(fd, sizeBuf, 0, 8, 0)
const headerSize = sizeBuf.readUInt32LE(4)
const headerBuf = Buffer.alloc(headerSize)
fs.readSync(fd, headerBuf, 0, headerSize, 8)
const jsonLen = headerBuf.readUInt32LE(4)
const header = JSON.parse(headerBuf.subarray(8, 8 + jsonLen).toString('utf8'))
const dataStart = 8 + headerSize

const walk = (node, prefix, out) => {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const p = prefix ? `${prefix}/${name}` : name
    if (value.files) walk(value, p, out)
    else out.push({ path: p, size: value.size ?? 0, offset: value.offset ?? null })
  }
}
const files = []
walk(header, '', files)

/** 自动发现 Web 前端的入口 chunk（而不是写死带哈希的文件名）。 */
function discoverShellBundle() {
  const pattern = /^dsh\/node_modules\/@deepseek-ai\/dsh-web-frontend\/dist\/assets\/index-.*\.js$/
  const matches = files.filter((file) => pattern.test(file.path))
  if (matches.length === 0) {
    throw new Error('在 asar 里找不到 dsh-web-frontend/dist/assets/index-*.js（DSH 版本可能变了）')
  }
  matches.sort((a, b) => b.size - a.size)
  return matches[0]
}

const entry = discoverShellBundle()
const buf = Buffer.alloc(entry.size)
fs.readSync(fd, buf, 0, entry.size, dataStart + Number(entry.offset))
fs.closeSync(fd)
const src = buf.toString('utf8')
console.log(`读取 ${entry.path}（${entry.size} 字节）`)

/* --------------------------- 按 Rollup 边界切出 --------------------------- */

const at = (marker) => {
  const i = src.indexOf(marker)
  if (i === -1) throw new Error(`找不到标记：${marker}（宿主前端产物结构可能变了）`)
  return i
}

// Rollup 为每个 CJS 依赖生成 `var <mod>={exports:{}}` 包装，紧跟在它的函数体之后。
const helperAt = at('function _o(')
const reactBodyAt = at('var ka={exports:{}}')
const reactEnd = at('var j=Sc()')
const schedStart = at('var ba={exports:{}}')
const schedEnd = at('var l3;function Tf()')
const reactDomEnd = at('var cn=N4()')

const slices = {
  helper: src.slice(helperAt, reactBodyAt),
  react: src.slice(reactBodyAt, reactEnd),
  scheduler: src.slice(schedStart, schedEnd),
  reactDom: src.slice(schedEnd, reactDomEnd),
}

// 防呆：不许混进 ESM 互操作助手，也不许在非 react-dom 的片段里碰 document
for (const [name, text] of Object.entries(slices)) {
  if (/\bas\(/.test(text)) throw new Error(`${name}：混入了 ESM 互操作助手 as()`)
  if (!name.includes('reactDom') && /document\./.test(text)) throw new Error(`${name}：出现了意外的 document 访问`)
}
if (!slices.react.includes('react.production.min.js')) throw new Error('缺少 react license 标记')
if (!slices.scheduler.includes('scheduler.production.min.js')) throw new Error('缺少 scheduler 标记')
if (!slices.reactDom.includes('react-dom.production.min.js')) throw new Error('缺少 react-dom 标记')

const bundle = `/**
 * React 18.3.1 + ReactDOM 18.3.1（生产构建，压缩后）—— 原样切自 DSH 前端产物
 * ${entry.path}
 * （位于 ${ARCHIVE}）。全程离线、无构建步骤、无依赖安装，且不修改 DSH 的任何文件。
 * 重新生成：node tools/extract-host-react.cjs
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory()
  else global.React = factory()
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict"
${slices.helper}${slices.react}${slices.scheduler}${slices.reactDom}
  return { React: Sc(), ReactDOM: N4() }
})
`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, bundle)
console.log(`✔ 写入 ${OUT}（${bundle.length} 字节）`)
