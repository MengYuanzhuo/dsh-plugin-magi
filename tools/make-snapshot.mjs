/**
 * 生成 `preview/snapshot.html`：一个**完全静态**的界面快照页，用于无头截图验收。
 *
 * 为什么需要它：真实面板会开 SSE 长连接 + 持续动画，Chromium 的 `--virtual-time-budget`
 * 因此永不结束（截图会挂住）。快照页把一次真实表决的结果直接内联进页面，
 * 并停掉 EventSource/fetch，于是渲染是确定性的、可截图的。
 *
 * 数据来源优先级：
 *   1. `--from <ledger.jsonl>` 指定的账本里最新的一条；
 *   2. 随包固化的样例账本 `preview/fixtures/ledger.sample.jsonl`（可复现）；
 *   3. 开发服务器留下的 `.magi-dev/ledger.jsonl`；
 *   4. 都没有就用内置样例。
 *
 * 用法：node tools/make-snapshot.mjs [--from .magi-dev2/ledger.jsonl]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(fileURLToPath(new URL('..', import.meta.url)))

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const FALLBACK = {
  key: 'magi-9001-sample',
  id: 'MAGI-DECISION No.9001',
  seq: 9001,
  createdAt: '2026-02-11T09:41:07.000Z',
  question: '要不要把客户名单导出给第三方审计团队',
  criticality: 'critical',
  criticalitySource: 'keyword',
  matchedKeywords: ['第三方', '导出给', '客户名单'],
  opinions: [
    {
      unit: 'MELCHIOR-1', stance: 'approve', confidence: 0.82,
      reason: '导出本身可控：可以只给必要字段、加审计留痕、限期回收。缺少的是数据最小化的证据清单，补齐即可执行。',
      key_factors: ['字段可裁剪', '留痕可追溯'], risks: ['清单范围可能被扩大'], caveats: '若无法证明最小化，我会改判。',
    },
    {
      unit: 'BALTHASAR-2', stance: 'reject', confidence: 0.91,
      reason: '名单上的人没有能力拒绝这件事，而泄露不可逆。为了他们长期的处境，我不能同意在缺少约束的情况下交出去。',
      key_factors: ['不可逆损害', '当事人无法拒绝'], risks: ['二次流转失控', '信任受损'], caveats: '若有强约束与追责机制，我会重新评估。',
    },
    {
      unit: 'CASPER-3', stance: 'reject', confidence: 0.66,
      reason: '这件事跟我没有直接牵扯，但把别人的信息交出去让我不舒服，我不愿意。',
      key_factors: ['与自身无涉但不适'], risks: [], caveats: '若涉及我认识的人，我会更坚决地反对。',
    },
  ],
  tally: { approve: 1, reject: 2 },
  verdict: 'VETO',
  verdictLabel: '否決',
  unanimity: false,
  confidenceAvg: 0.72,
  elapsedMs: 4180,
  notes: ['critical 档：1 票反对即整体否决（需三票一致）', '议题命中敏感词（第三方, 导出给, 客户名单），已按 critical 档表决：需三票一致'],
}

async function loadRecords() {
  const explicit = readArg('from', '')
  const candidates = [
    explicit ? resolve(packageDir, explicit) : null,
    join(packageDir, 'preview', 'fixtures', 'ledger.sample.jsonl'),
    join(packageDir, '.magi-dev', 'ledger.jsonl'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const text = await readFile(candidate, 'utf8')
    const records = []
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      try {
        const parsed = JSON.parse(line)
        if (parsed?.opinions?.length === 3) records.push(parsed)
      } catch {
        // 跳过损坏行
      }
    }
    if (records.length > 0) {
      console.log(`✔ 使用真实账本：${candidate}（${records.length} 条）`)
      return records
    }
  }
  console.log('· 没有可用账本，使用内置样例')
  return [FALLBACK]
}

/** 同一张快照里同时呈现两档规则：最近一次 critical 与最近一次 normal。 */
function pickShowcase(records) {
  const latestCritical = [...records].reverse().find((record) => record.criticality === 'critical')
  const latestNormal = [...records].reverse().find((record) => record.criticality !== 'critical')
  const picked = [latestCritical, latestNormal].filter(Boolean)
  return picked.length > 0 ? picked : [records[records.length - 1]]
}

const records = await loadRecords()
const showcase = pickShowcase(records)
for (const record of showcase) {
  console.log(`  · ${record.id} [${record.criticality}] ${record.verdict} ` +
    `(${record.tally.approve}:${record.tally.reject}) ${record.question}`)
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>MAGI · 静态快照（${showcase.map((record) => `${record.id} ${record.verdict}`).join(' / ')}）</title>
<style>
  html, body { margin: 0; background: #040604; }
  .wrap { max-width: 1560px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .case { border-top: 1px solid #123021; padding-top: 10px; color: #1f7a35; font-family: Consolas, monospace; font-size: 11.5px; letter-spacing: .06em; }
</style>
</head>
<body>
<div class="wrap" id="root"></div>

<script src="./vendor/react-magi-umd.js"></script>
<script>
  if (typeof window.React !== "object" || window.React === null) {
    document.write('<script src="./vendor/react.production.min.js"><\\/script>');
    document.write('<script src="./vendor/react-dom.production.min.js"><\\/script>');
  }
  if (typeof window.React !== "undefined" && window.React.React !== undefined) {
    window.ReactDOM = window.React.ReactDOM;
    window.React = window.React.React;
  }
</script>

<script>
  // 静态快照：不连服务器、不订阅事件流、不启动任何计时器
  window.EventSource = function () {
    this.addEventListener = function () {};
    this.removeEventListener = function () {};
    this.close = function () {};
  };
  var realFetch = window.fetch;
  window.fetch = function (url) {
    // 面板挂载时会拉一次「最近一条历史」做回填；快照页不需要它，回一个空列表，
    // 盘面完全由 initialResult 驱动 —— 也不会冒出「无法读取账本」的错误条。
    if (String(url).indexOf("/magi/api/history") === 0) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () { return Promise.resolve({ items: [] }); }
      });
    }
    return Promise.reject(new Error("snapshot: network disabled"));
  };
  window.__snapshotFetch = realFetch;

  window.__magiModule = null;
  window.__ModuleLoader__ = {
    load: function (descriptor) {
      window.__magiModule = descriptor.factory(function (id) {
        if (id === "react") return window.React;
        throw new Error("snapshot require shim: unexpected module '" + id + "'");
      });
    }
  };
</script>

<script src="../lib/client.js"></script>

<script>
(function () {
  "use strict";
  var cases = ${JSON.stringify(showcase, null, 2)};
  if (window.__magiModule === null) throw new Error("client.js 未加载");
  var registrations = [];
  window.__magiModule.apply({
    slots: {
      inject: function (name, fn) { fn(); },
      register: function (opts, Comp) { registrations.push({ opts: opts, Comp: Comp }); return function () {}; }
    }
  });
  var panel = registrations.filter(function (r) { return r.opts.name === "main"; })[0];
  var root = window.ReactDOM.createRoot(document.getElementById("root"));
  root.render(window.React.createElement(
    window.React.Fragment,
    null,
    cases.map(function (result, index) {
      return window.React.createElement(
        "div",
        { key: result.key || index },
        window.React.createElement(panel.Comp, {
          ui: { crtEffects: true, sound: false },
          initialResult: result
        }),
        window.React.createElement(
          "div",
          { className: "case" },
          "CASE " + (index + 1) + " · " + result.id + " · criticality=" + result.criticality +
          " (source=" + result.criticalitySource + ") · tally=" +
          result.tally.approve + ":" + result.tally.reject +
          " · verdict=" + result.verdict
        )
      );
    })
  ));
})();
</script>
</body>
</html>
`

const outPath = join(packageDir, 'preview', 'snapshot.html')
await writeFile(outPath, html, 'utf8')
console.log(`✔ 写入 ${outPath}（${html.length} 字节）`)
