/**
 * 三台单元各自的子功能注册表。
 *
 * 设计：不依赖模型的 native tool-calling，而是把「调用」写进 JSON 契约：
 *   1. 单元先输出 {"action":"tool","tool":"...","args":{...}}；
 *   2. 编排层执行并把结果作为下一条用户消息回注；
 *   3. 单元再输出最终意见 JSON。
 * 这样工具回合在工具路径（有 sessionId）与面板 HTTP 路径（无会话）上行为一致，
 * 也不受不同 provider 的 tool_use 方言影响。
 */

import { resolve } from 'node:path'
import { desireMap } from './desire-map.js'
import { composeText } from './text-composer.js'
import { listScriptEngines, runScript } from './script-runner.js'
import { errorMessage } from './errors.js'

export const ABILITY_BY_UNIT = Object.freeze({
  'MELCHIOR-1': Object.freeze({ name: 'run_script', title: '运行分析脚本' }),
  'BALTHASAR-2': Object.freeze({ name: 'compose_text', title: '起草文本' }),
  'CASPER-3': Object.freeze({ name: 'desire_map', title: '欲望读数' }),
})

export function abilityForUnit(unit) {
  return ABILITY_BY_UNIT[unit] ?? null
}

/** 从模型输出里识别工具请求；不是工具请求就返回 null。 */
export function parseToolRequest(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  if (parsed.action !== undefined && parsed.action !== 'tool') return null
  const tool = typeof parsed.tool === 'string' && parsed.tool !== ''
    ? parsed.tool
    : (typeof parsed.name === 'string' && parsed.action === 'tool' ? parsed.name : '')
  if (tool === '') return null
  const args = parsed.args !== null && typeof parsed.args === 'object' && !Array.isArray(parsed.args) ? parsed.args : {}
  const note = typeof parsed.note === 'string' ? parsed.note.trim().slice(0, 200) : ''
  return { tool, args, note }
}

const paths = (config) => {
  const base = resolve(process.cwd(), typeof config?.ledgerDir === 'string' ? config.ledgerDir : '.magi')
  const abilities = config?.abilities ?? {}
  return {
    labDir: typeof abilities.labDir === 'string' && abilities.labDir.trim() !== ''
      ? resolve(process.cwd(), abilities.labDir)
      : resolve(base, 'lab'),
    draftsDir: typeof abilities.draftsDir === 'string' && abilities.draftsDir.trim() !== ''
      ? resolve(process.cwd(), abilities.draftsDir)
      : resolve(base, 'drafts'),
  }
}

/** 执行一次子功能；任何失败都变成结构化结果，不把整次表决打挂。 */
export async function executeAbility({ unit, tool, args, note, config, signal, logger } = {}) {
  const startedAt = Date.now()
  const noteText = typeof note === 'string' ? note.trim().slice(0, 200) : ''
  const ability = abilityForUnit(unit)
  if (ability === null) {
    return { tool: String(tool ?? ''), status: 'rejected', error: `单元 ${unit} 没有子功能`, durationMs: 0, note: noteText }
  }
  if (config?.abilities?.enabled !== true) {
    return { tool: String(tool ?? ''), status: 'rejected', error: '子功能已被配置关闭', durationMs: 0, note: noteText }
  }
  if (tool !== ability.name) {
    return {
      tool: String(tool ?? ''),
      status: 'rejected',
      error: `${unit} 只能调用 ${ability.name}，不能调用 ${String(tool ?? '')}`,
      durationMs: 0,
      note: noteText,
    }
  }

  const input = args !== null && typeof args === 'object' && !Array.isArray(args) ? args : {}
  const dirs = paths(config)
  try {
    let result
    if (ability.name === 'run_script') {
      result = await runScript({
        engine: input.engine,
        code: input.code,
        args: input.args,
        signal,
        timeoutMs: config.abilities.scriptTimeoutMs,
        maxOutputChars: config.abilities.maxOutputChars,
        labDir: dirs.labDir,
        unit,
      })
    } else if (ability.name === 'compose_text') {
      result = await composeText(input, { dir: dirs.draftsDir, unit })
    } else {
      result = desireMap(input)
    }
    return {
      tool: ability.name,
      status: 'ok',
      durationMs: typeof result.durationMs === 'number' ? result.durationMs : Date.now() - startedAt,
      note: noteText,
      ...result,
    }
  } catch (error) {
    const message = errorMessage(error)
    logger?.warn?.(`[magi] ${unit} 子功能 ${ability.name} 失败：${message}`)
    return {
      tool: ability.name,
      status: 'error',
      error: message,
      durationMs: Date.now() - startedAt,
      note: noteText,
    }
  }
}

/** 拼进 system prompt 的「你独有的子功能」一节。 */
export function describeAbilityForPrompt(unit, config) {
  if (config?.abilities?.enabled !== true) return ''
  const ability = abilityForUnit(unit)
  if (ability === null) return ''
  const maxCalls = Number.isFinite(config.abilities.maxToolCallsPerUnit) ? config.abilities.maxToolCallsPerUnit : 2
  const timeoutMs = Number.isFinite(config.abilities.scriptTimeoutMs) ? config.abilities.scriptTimeoutMs : 15_000
  const maxChars = Number.isFinite(config.abilities.maxOutputChars) ? config.abilities.maxOutputChars : 8_000
  const header = [
    `【你独有的子功能：${ability.name}（${ability.title}）】`,
    `在给出最终意见之前，你最多可以调用 ${maxCalls} 次。需要调用时，只输出下面这种 JSON（不要带 stance、confidence 等意见字段）：`,
    '{"action":"tool","tool":"' + ability.name + '","note":"我为什么现在要调用它（第一人称，一句话）","args":{ … }}',
    'note 会进账本与界面；没有真实理由就不要调用。系统执行后会把结果回注给你，然后你必须输出最终意见 JSON。',
  ]

  if (ability.name === 'run_script') {
    const engines = listScriptEngines()
    const available = engines.filter((item) => item.available)
    const missing = engines.filter((item) => !item.available)
    return [
      ...header,
      'args 形态：{"engine":"python|javascript|powershell|bash|batch|vbs|dotnet","code":"<完整代码>","note":"<为什么跑它>"}',
      `当前可用引擎：${available.map((item) => item.id).join('、') || '无'}` +
        (missing.length > 0 ? `；当前不可用：${missing.map((item) => item.id).join('、')}` : ''),
      '引擎说明：python / javascript 用系统内置或 PATH 上的运行时；powershell / batch / vbs 用 Windows 自带组件；' +
        'dotnet 是把 C# 源码交给 PowerShell Add-Type 编译执行（C# 需定义 public static class MagiScript { public static string Run() }）；' +
        'bash 需要 Git Bash 或 Unix bash。',
      `约束：单次超时 ${timeoutMs}ms；stdout+stderr 截断到 ${maxChars} 字；cwd 是隔离的临时目录；` +
        '只做分析、计算、模拟、检查；不要联网、不要读写工作区外的敏感文件、不要执行破坏性操作。',
      '跑之前先写清：这次要验证哪一条假设、什么结果会推翻它。把假设写进 note，或写在代码第一行注释里。',
      '结果不支持假设时，如实报告并改判；不要改假设来迁就结果。',
      '先做最便宜、最能推翻当前判断的那个检查；不要用脚本堆砌精确感。',
      '只在脚本能真正改善判断时使用（核对数量级、跑模拟、检查环境），不要为了表演调用。',
    ].join('\n')
  }

  if (ability.name === 'compose_text') {
    return [
      ...header,
      'args 形态：{"kind":"letter|notice|statement|checklist|memo|summary","title":"标题","audience":"给谁看",' +
        '"tone":"warm|plain|firm","body":"开头正文","sections":[{"heading":"小标题","body":"段落"}]}',
      '用途：把你要保护的人、要说清的条件写成一份可以直接发出的文本；不是替你投票，而是让判断有可交付的形态。',
      '写给那个要承担代价的人，不是写给会议室：先写他今晚怎么过，再写十年后的账；文本里要给他留出可以说“不”的位置。',
      '如果一段话会让他事后才知道自己被决定了，重写它。',
      'kind 默认 memo；tone 默认 plain；body 与 sections 至少给一项；单段不超过 4000 字。' +
        '文件会写到隔离的起草目录，回注给模型的预览会截断到 ' + maxChars + ' 字。',
      '只在议题确实需要一个成品文本（通知、信件、声明、清单）时使用；不要用它重复意见正文。',
    ].join('\n')
  }

  return [
    ...header,
    'args 形态：{"question":"正在决定什么","options":[{"id":"A","label":"...","fit":"high|partial|none",' +
      '"violatesRefusal":false,"price":"这个选项的代价"},…],' +
      '"want":"我真正想要的结果","wantBehindWant":"得到它之后我还想要什么","price":"我愿意为此付出的具体代价",' +
      '"refusals":["我不卖的底线"],"owner":"mine|borrowed|reactive","borrowedFrom":"如果是借来的，来自谁",' +
      '"visibility":"yes|no|unsure","affect":"身体/情绪信号","competing":[{"want":"...","rank":1}],' +
      '"regret":{"tenMinutes":"...","tenMonths":"...","tenYears":"..."},"forcedChoice":"A|B|undecided","tieBreak":false}',
    '必填：options（2–4 个）、want、wantBehindWant（不能和 want 相同）、price（必须具体）、refusals（至少 1 条）、' +
      'owner、visibility、affect、regret.tenMonths、regret.tenYears、forcedChoice。owner 不是 mine 时 borrowedFrom 必填。',
    '这不是打分，也不替你决定。它只把你的欲望摆出来：想要什么、价格、底线、所有权、如果没人看见还要不要、十年后怎么看自己。',
    'visibility 不是 yes 时会标 status-trap；选项违反底线时会标 refusal-risk。',
    '只有 forcedChoice=undecided、所有选项 fit 与 price 都相同且都不违反底线时，才允许 tieBreak:true；系统会掷一次加密随机，' +
      '并返回“松了口气还是失望”的探针。抽签是镜子，不是替你负责的人；最终仍要说出“我要 A/B”。',
  ].join('\n')
}
