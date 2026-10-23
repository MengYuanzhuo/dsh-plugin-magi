/**
 * MELCHIOR-1 的子功能：在隔离目录里跑分析脚本。
 *
 * 设计取舍：
 * - 只接受 **代码**，不接受任意命令行；解释器由本模块解析，调用方不能改。
 * - 优先使用 DSH 自带运行时（Node / Python）与 Windows 自带 PowerShell / cmd / cscript，
 *   因此默认不需要额外安装；Git Bash 若存在则作为 bash 引擎。
 * - 每次执行写进 `<labDir>/run-<时间>-<随机>/`，cwd 固定在该目录，超时杀进程树，输出截断。
 * - 环境变量只保留运行所需的少量白名单项，绝不把 DSH/API 凭据传给生成的脚本。
 *
 * 这不是安全沙箱：脚本以当前用户权限运行。需要彻底关闭时把 config.abilities.enabled 设为 false。
 */

import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readdirSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { errorMessage } from './errors.js'

const fail = (message, status = 400) => {
  const error = new Error(message)
  error.status = status
  throw error
}

const isFile = (path) => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const firstExisting = (candidates) => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '' && isFile(candidate)) return candidate
  }
  return null
}

/** `PATH` 里找可执行文件；Windows 会按 PATHEXT 补扩展名。 */
function findOnPath(names) {
  const pathValue = process.env.PATH ?? ''
  const dirs = pathValue.split(delimiter).filter(Boolean)
  const extensions = process.platform === 'win32'
    ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)]
    : ['']
  for (const dir of dirs) {
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = join(dir, name + (name.toLowerCase().endsWith(extension.toLowerCase()) ? '' : extension))
        if (isFile(candidate)) return candidate
      }
    }
  }
  return null
}

/** DSH 自带运行时根目录（Node / Python 所在的那一层 dependencies）。 */
function dshRuntimeRoots() {
  const roots = []
  try {
    const base = join(homedir(), '.dsh', 'dsh-runtimes')
    for (const name of readdirSync(base)) roots.push(join(base, name, 'dependencies'))
  } catch {
    // 没有这个目录（例如非 DSH 环境）就跳过
  }
  if (typeof process.resourcesPath === 'string' && process.resourcesPath !== '') {
    roots.push(join(process.resourcesPath, 'runtime', 'primary-runtime', 'dependencies'))
  }
  return roots
}

function findGitBash() {
  const explicit = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ]
  const direct = firstExisting(explicit)
  if (direct !== null) return direct
  const git = findOnPath(['git'])
  if (git !== null) {
    const root = dirname(dirname(git))
    const viaGit = firstExisting([
      join(root, 'bin', 'bash.exe'),
      join(root, 'usr', 'bin', 'bash.exe'),
    ])
    if (viaGit !== null) return viaGit
  }
  return null
}

const POWERSHELL_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File']

const ENGINE_SPECS = Object.freeze({
  python: { label: 'Python', ext: 'py' },
  javascript: { label: 'JavaScript (Node)', ext: 'js' },
  powershell: { label: 'PowerShell', ext: 'ps1' },
  bash: { label: 'Bash', ext: 'sh' },
  batch: { label: 'Batch', ext: 'cmd' },
  vbs: { label: 'VBScript', ext: 'vbs' },
  dotnet: { label: '.NET (C# via PowerShell)', ext: 'cs' },
})

/** 解析某个引擎的实际解释器；找不到返回 null。 */
function resolveScriptEngine(engine) {
  if (engine === 'python') {
    const executable = firstExisting([
      process.env.MAGI_PYTHON,
      ...dshRuntimeRoots().flatMap((root) => [
        join(root, 'python', 'python.exe'),
        join(root, 'python', 'bin', 'python3'),
      ]),
      findOnPath(['python', 'python3']),
    ])
    return executable === null ? null : { command: executable, baseArgs: [] }
  }

  if (engine === 'javascript') {
    const executable = firstExisting([
      process.env.MAGI_NODE,
      ...dshRuntimeRoots().flatMap((root) => [
        join(root, 'node', 'bin', 'node.exe'),
        join(root, 'node', 'bin', 'node'),
      ]),
      findOnPath(['node']),
    ])
    return executable === null ? null : { command: executable, baseArgs: [] }
  }

  if (engine === 'powershell') {
    const executable = firstExisting([
      process.env.MAGI_POWERSHELL,
      process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : null,
      findOnPath(['powershell', 'pwsh']),
    ])
    return executable === null ? null : { command: executable, baseArgs: POWERSHELL_ARGS }
  }

  if (engine === 'bash') {
    const executable = firstExisting([
      process.env.MAGI_BASH,
      process.platform === 'win32' ? findGitBash() : '/bin/bash',
      process.platform === 'win32' ? null : findOnPath(['bash']),
    ])
    if (executable === null) return null
    // Windows 上误找到 WSL 的 bash 时，Windows 路径无法直接使用；除非用户显式指定 MAGI_BASH。
    if (process.platform === 'win32' && executable.toLowerCase().includes('system32\\bash.exe') && !process.env.MAGI_BASH) {
      return null
    }
    return { command: executable, baseArgs: [] }
  }

  if (engine === 'batch') {
    if (process.platform !== 'win32') return null
    const executable = firstExisting([
      process.env.ComSpec,
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'),
    ])
    return executable === null ? null : { command: executable, baseArgs: ['/d', '/s', '/c'] }
  }

  if (engine === 'vbs') {
    if (process.platform !== 'win32') return null
    const executable = firstExisting([join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cscript.exe')])
    return executable === null ? null : { command: executable, baseArgs: ['//nologo'] }
  }

  if (engine === 'dotnet') {
    const powershell = resolveScriptEngine('powershell')
    return powershell === null ? null : { command: powershell.command, baseArgs: powershell.baseArgs }
  }

  return null
}

/** 供人格提示词使用：当前机器上哪些引擎真的可用。 */
export function listScriptEngines() {
  return Object.entries(ENGINE_SPECS).map(([id, spec]) => ({
    id,
    label: spec.label,
    available: resolveScriptEngine(id) !== null,
  }))
}

const safeEnv = (runDir, unit) => {
  const keep = [
    'PATH', 'PATHEXT', 'SystemRoot', 'SystemDrive', 'WINDIR', 'TEMP', 'TMP',
    'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LANG', 'LC_ALL', 'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE', 'PROCESSOR_ARCHITEW6432', 'PSModulePath', 'ComSpec',
  ]
  const env = {}
  for (const key of keep) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  env.PYTHONIOENCODING = 'utf-8'
  env.PYTHONUTF8 = '1'
  env.MAGI_LAB_DIR = runDir
  env.MAGI_UNIT = unit ?? ''
  return env
}

const quotePowerShell = (value) => String(value).replace(/'/g, "''")

const stamp = (date) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function killTree(child) {
  if (child === null || child === undefined || child.killed === true) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    try {
      spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' })
    } catch {
      // 继续用 child.kill 兜底
    }
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // 已经退出
  }
}

const readArgs = (value) => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 10) fail('args 必须是最多 10 项的数组')
  return value.map((item) => {
    if (typeof item !== 'string') fail('args 的每一项都必须是字符串')
    return item.slice(0, 200)
  })
}

const clamp = (value, fallback, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * 执行一段分析代码。
 *
 * @param {{
 *   engine?: string, code?: string, args?: string[], signal?: AbortSignal,
 *   timeoutMs?: number, maxOutputChars?: number, labDir?: string, unit?: string,
 * }} options
 */
export async function runScript(options = {}) {
  const engine = typeof options.engine === 'string' ? options.engine.trim().toLowerCase() : 'javascript'
  const spec = ENGINE_SPECS[engine]
  if (spec === undefined) fail(`未知引擎：${engine}`)
  const resolved = resolveScriptEngine(engine)
  if (resolved === null) {
    const available = listScriptEngines().filter((item) => item.available).map((item) => item.id)
    fail(`引擎 ${engine} 不可用；当前可用：${available.join('、') || '无'}`, 503)
  }
  if (typeof options.code !== 'string' || options.code.trim() === '') fail('code 不能为空')
  if (options.code.length > 20_000) fail('code 超过 20000 字符')
  const extraArgs = readArgs(options.args)
  const timeoutMs = clamp(options.timeoutMs, 15_000, 500, 60_000)
  const maxOutputChars = clamp(options.maxOutputChars, 8_000, 500, 50_000)
  const labRoot = resolve(options.labDir ?? join(tmpdir(), 'magi-lab'))
  const runDir = join(labRoot, `run-${stamp(new Date())}-${randomUUID().slice(0, 6)}`)
  await mkdir(runDir, { recursive: true })

  const scriptPath = join(runDir, `script.${spec.ext}`)
  const source = engine === 'powershell'
    ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n${options.code}\n`
    : engine === 'batch'
      ? `@echo off\r\n${options.code}\n`
      : `${options.code}\n`
  await writeFile(scriptPath, source, 'utf8')

  let command = resolved.command
  let args = [...resolved.baseArgs]
  if (engine === 'dotnet') {
    const wrapperPath = join(runDir, 'run.ps1')
    await writeFile(
      wrapperPath,
      [
        "$ErrorActionPreference = 'Stop'",
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        `$definition = Get-Content -Raw -LiteralPath '${quotePowerShell(scriptPath)}'`,
        'Add-Type -TypeDefinition $definition -Language CSharp',
        '[MagiScript]::Run()',
        '',
      ].join('\n'),
      'utf8',
    )
    args.push(wrapperPath)
  } else {
    const invocationPath = engine === 'bash' && process.platform === 'win32'
      ? scriptPath.replace(/\\/g, '/')
      : scriptPath
    args.push(invocationPath, ...extraArgs)
  }

  const startedAt = Date.now()
  return await new Promise((resolvePromise) => {
    let timedOut = false
    let aborted = false
    let oversize = false
    let settled = false
    let timer = null
    let sizeTimer = null
    const stdoutPath = join(runDir, 'stdout.log')
    const stderrPath = join(runDir, 'stderr.log')

    let child
    let outFd = null
    let errFd = null
    try {
      // 用文件而不是 pipe 捕获输出：在受限环境里 pipe 可能被拒绝，
      // 文件描述符方案在沙箱内外都能工作，也避免无界内存缓冲。
      outFd = openSync(stdoutPath, 'w')
      errFd = openSync(stderrPath, 'w')
      child = spawn(command, args, {
        cwd: runDir,
        env: safeEnv(runDir, options.unit),
        windowsHide: true,
        stdio: ['ignore', outFd, errFd],
      })
    } catch (error) {
      if (outFd !== null) { try { closeSync(outFd) } catch { /* ignore */ } }
      if (errFd !== null) { try { closeSync(errFd) } catch { /* ignore */ } }
      resolvePromise({
        status: 'error',
        engine,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        outputPreview: '',
        truncated: false,
        error: errorMessage(error),
        scriptPath,
        runDir,
      })
      return
    }
    try { closeSync(outFd) } catch { /* 子进程已继承 */ }
    try { closeSync(errFd) } catch { /* 子进程已继承 */ }

    const readOutput = async () => {
      let stdout = ''
      let stderr = ''
      try { stdout = await readFile(stdoutPath, 'utf8') } catch { /* 没有输出 */ }
      try { stderr = await readFile(stderrPath, 'utf8') } catch { /* 没有输出 */ }
      return [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join('\n[stderr]\n')
    }

    const finish = async (result) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      if (sizeTimer !== null) clearInterval(sizeTimer)
      options.signal?.removeEventListener?.('abort', onAbort)
      const output = await readOutput()
      const preview = output.slice(0, maxOutputChars)
      resolvePromise({
        engine,
        exitCode: result.exitCode ?? null,
        durationMs: Date.now() - startedAt,
        outputPreview: preview,
        truncated: output.length > preview.length,
        scriptPath,
        runDir,
        codePreview: options.code.slice(0, 300),
        summary: `${spec.label} ${result.status === 'ok' ? '执行完成' : result.status}，` +
          `${result.exitCode === undefined || result.exitCode === null ? '无退出码' : `退出码 ${result.exitCode}`}，` +
          `${Date.now() - startedAt}ms，输出 ${output.length} 字`,
        ...result,
      })
    }

    const onAbort = () => {
      aborted = true
      killTree(child)
    }

    if (options.signal?.aborted) onAbort()
    else options.signal?.addEventListener?.('abort', onAbort, { once: true })

    timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)
    timer.unref?.()

    // 防止脚本把磁盘写满：超过输出上限的 4 倍就直接终止（最终仍按上限截断）
    const sizeLimit = Math.max(2_000, maxOutputChars * 4)
    sizeTimer = setInterval(() => {
      try {
        const size = (existsSync(stdoutPath) ? statSync(stdoutPath).size : 0) +
          (existsSync(stderrPath) ? statSync(stderrPath).size : 0)
        if (size > sizeLimit) {
          oversize = true
          killTree(child)
        }
      } catch {
        // 正在写 / 已关闭，忽略
      }
    }, 250)
    sizeTimer.unref?.()

    child.on('error', (error) => {
      void finish({ status: 'error', exitCode: null, error: errorMessage(error) })
    })
    child.on('close', (code) => {
      if (aborted) return void finish({ status: 'aborted', exitCode: code, error: '执行被取消' })
      if (oversize) return void finish({ status: 'error', exitCode: code, error: `输出超过 ${sizeLimit} 字上限，已终止` })
      if (timedOut) return void finish({ status: 'timeout', exitCode: code, error: `超过 ${timeoutMs}ms 未结束，已终止` })
      if (code === 0) return void finish({ status: 'ok', exitCode: 0 })
      return void finish({ status: 'error', exitCode: code, error: `退出码 ${code}` })
    })
  })
}
