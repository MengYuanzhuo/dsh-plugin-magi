window.__ModuleLoader__.load({
	id: "dsh-plugin-magi",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { useState, useEffect, useRef, useMemo, useCallback } = React;
		const h = React.createElement;

		/* ------------------------------------------------------------------ *
		 * Styles. Injected at runtime into a dedicated style[data-plugin-css]  *
		 * tag, exactly like the official client plugins. Only --magi-* custom  *
		 * properties are declared; no global --dsw-* token is ever written.    *
		 * ------------------------------------------------------------------ */
		const CSS = [
			/* 令牌只声明一次，面板 / 卡片 / 输入区按钮共用；含端末与历史抽屉的琥珀色阶。 */
			'.magi-panel,.magi-card,.magi-dock{--magi-bg:#070a08;--magi-panel:#0b0f0c;--magi-panel-2:#0d130f;--magi-line:#123021;--magi-line-2:#1b4a2e;--magi-green:#39ff14;--magi-green-dim:#2fd44b;--magi-green-dark:#1f7a35;--magi-red:#ff2b2b;--magi-orange:#ff8c00;--magi-cyan:#35d6d6;--magi-amber:#ff8c00;--magi-amber-dim:#c98a3c;--magi-amber-text:#ffd08a;--magi-amber-muted:#9a7638;--magi-amber-q:#b98f4e;--magi-font:var(--ds-font-family-code,Consolas,monospace)}',
			'.magi-panel,.magi-card{box-sizing:border-box}',
			'.magi-panel *,.magi-card *{box-sizing:border-box}',
			'.magi-panel{position:relative;isolation:isolate;background:var(--magi-bg);color:var(--magi-green-dim);border:1px solid var(--magi-line);border-radius:2px;font-family:var(--magi-font);font-size:13px;line-height:1.55;padding:0;overflow:hidden;text-align:left;display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
			'.magi-panel::after{content:"";position:absolute;inset:0;z-index:5;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(57,255,20,.05) 0 1px,rgba(0,0,0,0) 1px 3px)}',
			'.magi-panel[data-crt="off"]::after{display:none}',
			'.magi-panel[data-crt="on"]{text-shadow:0 0 6px rgba(57,255,20,.35)}',
			'.magi-body{position:relative;z-index:1}',
			'.magi-header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--magi-line);background:linear-gradient(180deg,var(--magi-panel-2),var(--magi-panel));padding:9px 12px}',
			'.magi-header-left{display:flex;align-items:center;gap:10px;min-width:0}',
			'.magi-system{color:var(--magi-green);font-weight:700;letter-spacing:.22em;font-size:14px;text-shadow:0 0 10px rgba(57,255,20,.45)}',
			'.magi-protocol{font-size:10.5px;letter-spacing:.18em}',
			'.magi-header-right{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;font-size:11.5px}',
			'.magi-decision{color:var(--magi-green-dim);letter-spacing:.06em}',
			'.magi-decision b{color:var(--magi-green);font-weight:600}',
			'.magi-timestamp{color:var(--magi-cyan);font-variant-numeric:tabular-nums;letter-spacing:.04em}',
			'.magi-alertbar{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--magi-red);background:rgba(255,43,43,.09);color:var(--magi-red);padding:7px 12px;font-size:12px;font-weight:600;letter-spacing:.1em}',
			'.magi-alertbar-dot{width:8px;height:8px;flex:none;background:var(--magi-red);box-shadow:0 0 8px var(--magi-red);animation:magi-pulse 1.1s steps(2,end) infinite}',
			'.magi-units{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--magi-line)}',
			'.magi-unit{background:var(--magi-panel);padding:9px 10px 11px;min-width:0;display:flex;flex-direction:column;gap:7px;position:relative}',
			'.magi-unit[data-state="analyzing"]{background:linear-gradient(180deg,rgba(255,140,0,.06),var(--magi-panel))}',
			'.magi-unit[data-state="output"]{background:linear-gradient(180deg,rgba(57,255,20,.05),var(--magi-panel))}',
			'.magi-unit[data-state="error"]{background:linear-gradient(180deg,rgba(255,43,43,.08),var(--magi-panel))}',
			'.magi-unit.flash{animation:magi-flash .18s steps(2,end) 1}',
			'.magi-unit-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
			'.magi-unit-head-main{min-width:0}',
			'.magi-unit-name{color:var(--magi-green);font-weight:700;letter-spacing:.08em;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.magi-unit-role{color:var(--magi-green-dim);font-size:11.5px;letter-spacing:.22em;opacity:.85}',
			'.magi-lamp{display:flex;align-items:center;gap:5px;flex:none;font-size:10.5px;letter-spacing:.1em}',
			'.magi-lamp i{width:9px;height:9px;border-radius:50%;background:var(--magi-green-dark);display:inline-block}',
			'.magi-lamp[data-state="standby"]{color:var(--magi-green-dark)}',
			'.magi-lamp[data-state="analyzing"]{color:var(--magi-orange)}',
			'.magi-lamp[data-state="analyzing"] i{background:var(--magi-orange);box-shadow:0 0 8px var(--magi-orange);animation:magi-pulse .5s steps(2,end) infinite}',
			'.magi-lamp[data-state="output"]{color:var(--magi-green)}',
			'.magi-lamp[data-state="output"] i{background:var(--magi-green);box-shadow:0 0 8px var(--magi-green)}',
			'.magi-lamp[data-state="error"]{color:var(--magi-red)}',
			'.magi-lamp[data-state="error"] i{background:var(--magi-red);box-shadow:0 0 8px var(--magi-red)}',
			'.magi-reason{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--magi-green-dim);font-size:12px;min-height:74px;max-height:190px;overflow-y:auto;scrollbar-width:thin}',
			'.magi-caret{display:inline-block;width:7px;height:13px;margin-left:1px;background:var(--magi-green);vertical-align:-2px;animation:magi-blink .9s steps(2,end) infinite}',
			'.magi-muted{color:var(--magi-green-dark)}',
			'.magi-facts{display:flex;flex-direction:column;gap:4px;font-size:11px}',
			'.magi-fact-error{color:var(--magi-red)}',
			'.magi-facts summary{cursor:pointer;color:var(--magi-green-dark);letter-spacing:.06em;outline:none}',
			'.magi-facts summary:hover{color:var(--magi-green-dim)}',
			'.magi-facts ul{margin:4px 0 0;padding-left:14px}',
			'.magi-facts li{color:var(--magi-green-dark);overflow-wrap:anywhere}',
			'.magi-facts li b{color:var(--magi-red);font-weight:500}',
			'.magi-tools li{margin:3px 0}',
			'.magi-tool-head{color:var(--magi-green-dim);letter-spacing:.06em;font-weight:600}',
			'.magi-tool-note{color:var(--magi-green);font-size:10.5px;font-style:italic;margin-top:2px}',
			'.magi-tool-summary{color:var(--magi-green-dark);margin-top:2px}',
			'.magi-tool-path{color:var(--magi-green-dark);font-size:10px;overflow-wrap:anywhere;margin-top:2px}',
			'.magi-tool-output{margin:4px 0 0;max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#040604;border:1px solid var(--magi-line);padding:5px 6px;color:var(--magi-green-dim);font-family:var(--magi-font);font-size:10.5px;line-height:1.5}',
			'.magi-tool-error{color:var(--magi-red);margin-top:2px}',
			'.magi-desire{margin-top:4px;display:flex;flex-direction:column;gap:2px;border:1px solid var(--magi-line);background:#040604;padding:5px 6px}',
			'.magi-desire-title{color:var(--magi-green);font-size:9.5px;letter-spacing:.18em}',
			'.magi-desire-row{display:flex;gap:6px;font-size:10px;line-height:1.5}',
			'.magi-desire-key{color:var(--magi-green-dark);flex:0 0 56px;letter-spacing:.08em}',
			'.magi-desire-val{color:var(--magi-green-dim);overflow-wrap:anywhere}',
			'.magi-desire-flags{margin:3px 0 0;padding-left:13px;color:var(--magi-red);font-size:10px}',
			'.magi-desire-tie{margin-top:3px;border-top:1px dashed var(--magi-line);padding-top:3px;color:var(--magi-orange);font-size:10px;overflow-wrap:anywhere}',
			'.magi-stance{align-self:flex-start;border:1px solid var(--magi-line-2);padding:1px 9px;font-size:12px;font-weight:700;letter-spacing:.16em}',
			'.magi-stance[data-stance="approve"]{color:var(--magi-green);border-color:var(--magi-green);box-shadow:inset 0 0 12px rgba(57,255,20,.12)}',
			'.magi-stance[data-stance="reject"]{color:var(--magi-red);border-color:var(--magi-red);box-shadow:inset 0 0 12px rgba(255,43,43,.14)}',
			'.magi-stance[data-stance="none"]{color:var(--magi-green-dark);border-color:var(--magi-line);letter-spacing:.1em}',
			'.magi-stance small{font-size:10px;letter-spacing:.08em;margin-left:5px;opacity:.85}',
			'.magi-conf{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--magi-green-dark);letter-spacing:.06em}',
			'.magi-conf-bar{flex:1;height:4px;background:#0a1a0f;border:1px solid var(--magi-line);position:relative;min-width:30px}',
			'.magi-conf-bar i{position:absolute;inset:0 auto 0 0;background:var(--magi-green-dark)}',
			'.magi-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid var(--magi-line);border-bottom:1px solid var(--magi-line);background:var(--magi-panel-2);padding:8px 12px;font-size:12px}',
			'.magi-tally{display:flex;align-items:center;gap:6px;color:var(--magi-green-dim);letter-spacing:.14em;font-weight:700}',
			'.magi-tally .magi-dots{display:flex;gap:3px}',
			'.magi-tally .magi-dots i{width:9px;height:9px;display:inline-block;border:1px solid var(--magi-line-2)}',
			'.magi-tally .magi-dots i[data-stance="approve"]{background:var(--magi-green)}',
			'.magi-tally .magi-dots i[data-stance="reject"]{background:var(--magi-red)}',
			'.magi-verdict{display:flex;align-items:baseline;gap:6px;font-weight:700;letter-spacing:.1em}',
			'.magi-verdict[data-verdict="APPROVE"]{color:var(--magi-green)}',
			'.magi-verdict[data-verdict="REJECT"]{color:var(--magi-red)}',
			'.magi-verdict[data-verdict="VETO"]{color:var(--magi-red);text-shadow:0 0 10px rgba(255,43,43,.5)}',
			'.magi-verdict small{font-size:11px;letter-spacing:.14em;opacity:.85}',
			'.magi-chip{border:1px solid var(--magi-line-2);color:var(--magi-green-dim);padding:0 6px;font-size:10.5px;letter-spacing:.14em}',
			'.magi-chip[data-kind="critical"]{border-color:var(--magi-red);color:var(--magi-red)}',
			'.magi-chip[data-kind="unanimous"]{border-color:var(--magi-green);color:var(--magi-green);box-shadow:inset 0 0 10px rgba(57,255,20,.14)}',
			'.magi-chip[data-kind="meta"]{border-color:var(--magi-line);color:var(--magi-green-dark)}',
			'.magi-notes{margin:0;padding:6px 12px 8px;list-style:none;font-size:11px;color:var(--magi-green-dark);border-bottom:1px solid var(--magi-line)}',
			'.magi-question{margin:0;padding:6px 12px 8px;font-size:11px;line-height:1.55;color:var(--magi-green-dark);border-bottom:1px solid var(--magi-line);overflow-wrap:anywhere;white-space:pre-wrap}',
			'.magi-question::before{content:"// ";color:var(--magi-green-dark)}',
			'.magi-notes li::before{content:"// ";color:var(--magi-green-dark)}',
			'.magi-composer{display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:var(--magi-panel-2)}',
			'.magi-composer label.magi-field{display:flex;flex-direction:column;gap:4px;font-size:10.5px;letter-spacing:.18em;color:var(--magi-green-dark)}',
			'.magi-textarea{width:100%;background:#060807;color:var(--magi-green);border:1px solid var(--magi-line);border-radius:1px;font-family:var(--magi-font);font-size:12.5px;padding:6px 8px;outline:none;resize:vertical}',
			'.magi-textarea:focus{border-color:var(--magi-green-dark);box-shadow:0 0 0 1px rgba(47,212,75,.25)}',
			'.magi-textarea::placeholder{color:#17422a}',
			/* 入口按钮渲染在会话输入区（.magi-panel 之外），令牌由上面的共用块提供 */
			'.magi-dock{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--magi-line-2);border-radius:2px;background:var(--magi-panel);color:var(--magi-green);font-family:var(--magi-font);font-size:11.5px;letter-spacing:.16em;cursor:pointer;transition:background .15s ease,border-color .15s ease}',
			'.magi-dock:hover{background:rgba(57,255,20,.08);border-color:var(--magi-green)}',
			'.magi-dock-dot{width:7px;height:7px;border-radius:50%;background:var(--magi-green);box-shadow:0 0 6px var(--magi-green);display:inline-block;flex:none}',
			'.magi-context-toggle,.magi-seg button{background:none;border:0;color:var(--magi-green-dark);font-family:var(--magi-font);cursor:pointer}',
			'.magi-context-toggle{align-self:flex-start;font-size:11px;padding:0;letter-spacing:.08em}',
			'.magi-context-toggle:hover{color:var(--magi-green-dim)}',
			'.magi-composer-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
			'.magi-seg{display:flex;align-items:center;gap:0;border:1px solid var(--magi-line)}',
			'.magi-seg button{font-size:11.5px;padding:4px 12px;letter-spacing:.1em}',
			'.magi-seg button+button{border-left:1px solid var(--magi-line)}',
			'.magi-seg button[aria-pressed="true"]{background:rgba(57,255,20,.1);color:var(--magi-green)}',
			'.magi-seg button[aria-pressed="true"][data-crit="critical"]{background:rgba(255,43,43,.12);color:var(--magi-red)}',
			'.magi-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
			/* 所有按钮共用的骨架：透明底、等宽字、一致的过渡与禁用指针。 */
			'.magi-btn,.magi-history-btn,.magi-history-row,.magi-persona-btn,.magi-term-histbtn{background:none;font-family:var(--magi-font);cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}',
			'.magi-btn:focus-visible,.magi-dock:focus-visible,.magi-persona-btn:focus-visible{outline:1px solid var(--magi-green);outline-offset:1px}',
			'.magi-btn:disabled,.magi-history-btn:disabled,.magi-persona-btn:disabled{cursor:not-allowed}',
			'.magi-btn{border:1px solid var(--magi-green-dark);color:var(--magi-green);font-size:12px;font-weight:700;letter-spacing:.22em;padding:5px 18px}',
			'.magi-btn:hover:not(:disabled){background:rgba(57,255,20,.1)}',
			'.magi-btn:disabled{border-color:var(--magi-line);color:var(--magi-green-dark)}',
			'.magi-btn[data-variant="ghost"]{border-color:var(--magi-line-2);color:var(--magi-green-dim);font-weight:500;letter-spacing:.1em;padding:4px 10px}',
			'.magi-hint{font-size:10.5px;color:var(--magi-green-dark);letter-spacing:.04em}',
			'.magi-error,.magi-history-error,.magi-persona-error{border:1px solid var(--magi-red);color:var(--magi-red);background:rgba(255,43,43,.08);overflow-wrap:anywhere}',
			'.magi-error{margin:8px 12px;padding:6px 8px;font-size:11.5px}',
			'.magi-empty{padding:22px 12px;text-align:center;color:var(--magi-green-dark);letter-spacing:.24em;font-size:12px}',
			'.magi-card{background:var(--magi-panel);border:1px solid var(--magi-line);color:var(--magi-green-dim);font-family:var(--magi-font);font-size:12px;padding:8px 10px;display:flex;flex-direction:column;gap:7px;text-align:left}',
			'.magi-card-title{display:flex;align-items:center;gap:8px;font-size:10.5px;letter-spacing:.2em;color:var(--magi-green);border-bottom:1px solid var(--magi-line);padding-bottom:5px}',
			'.magi-card-title .magi-spacer{flex:1}',
			'.magi-card-q{color:var(--magi-green-dim);font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap}',
			'.magi-card-units{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}',
			'.magi-card-unit{border:1px solid var(--magi-line);padding:5px 6px;display:flex;flex-direction:column;gap:4px;min-width:0}',
			'.magi-card-unit b{color:var(--magi-green);font-size:10.5px;letter-spacing:.06em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.magi-card-reason{color:var(--magi-green-dark);font-size:11px;max-height:66px;overflow:hidden;overflow-wrap:anywhere}',
			'.magi-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--magi-green-dark)}',
			'.magi-pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--magi-green-dim);font-family:var(--magi-font);font-size:11.5px;max-height:300px;overflow:auto}',
			'.magi-panel[data-theme="light"]{--magi-bg:#101312;--magi-panel:#141917;--magi-panel-2:#161c19;text-shadow:none}',
			'.magi-panel[data-theme="light"]::after{opacity:.35}',
			'.magi-panel[data-reduced="true"]::after,.magi-panel[data-reduced="true"] .magi-alertbar-dot,.magi-panel[data-reduced="true"] .magi-lamp i,.magi-panel[data-reduced="true"] .magi-caret{animation:none}',
			'.magi-panel[data-reduced="true"] .magi-unit.flash{animation:none}',
			'@keyframes magi-pulse{0%,49%{opacity:1}50%,100%{opacity:.25}}',
			'@keyframes magi-blink{0%,49%{opacity:1}50%,100%{opacity:0}}',
			'@keyframes magi-flash{0%{box-shadow:inset 0 0 0 1px var(--magi-green),0 0 18px rgba(57,255,20,.45)}100%{box-shadow:none}}',
			'@media (max-width:640px){.magi-units,.magi-card-units{grid-template-columns:1fr}}',
			'@media (prefers-reduced-motion:reduce){.magi-panel::after,.magi-alertbar-dot,.magi-lamp i,.magi-caret,.magi-unit.flash,.magi-term-shape.is-thinking{animation:none}}',
			/* ── 铺满主视图区 ────────────────────────────────────────────────
			 * 宿主中间栏（.BynINW_centerCol）是 flex 列、底色取自当前主题（浅色主题＝白），
			 * 而槽贴片外层是 display:contents —— 面板本身就是中间栏的 flex 子项。
			 * 面板默认只有内容高度，下方于是露出一大块宿主底色。这里让面板撑满：
			 * 内容不足时占满整栏，内容过高时由棋盘区内部滚动。
			 * 面板自身继续保持 overflow:hidden，CRT 扫描线覆盖层才会固定在可视区、不被滚走。
			 * 撑满规则已并入上面的 .magi-panel 基规则，这里只留子项约束。 */
			'.magi-panel>*{flex:0 0 auto}',
			'.magi-panel>.magi-body{flex:1 1 auto;min-height:0;overflow:auto}',
			'.magi-panel>.magi-empty{flex:1 1 auto;display:flex;align-items:center;justify-content:center}',
			/* ── 端末模式（terminal）──────────────────────────────────────────
			 * 参考原作的三盾三角盘面：蓝＝承認、红＝拒否、琥珀＝待決，
			 * 橙色连线汇到中心 MAGI。此模式不输出理由，颜色即结论。 */
			'.magi-term{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;padding:10px 12px 0;gap:6px}',
			'.magi-term-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:2px solid var(--magi-amber);padding-bottom:6px}',
			'.magi-term-top .magi-mode{align-self:center;margin-top:8px}',
			'.magi-term-top .magi-mode button{border-color:rgba(255,140,0,.5);color:var(--magi-amber-dim)}',
			'.magi-term-top .magi-mode button[aria-pressed="true"]{background:rgba(255,140,0,.16);border-color:var(--magi-amber);color:var(--magi-amber-text)}',
			'.magi-term-brief{min-width:0}',
			'.magi-term-verdict{flex:0 0 auto;text-align:right}',
			'.magi-term-kanji,.magi-history-title{color:var(--magi-amber);font-weight:700;text-shadow:0 0 10px rgba(255,140,0,.45)}',
			'.magi-term-kanji{font-size:22px;letter-spacing:.34em;line-height:1.1}',
			'.magi-term-rows{margin-top:3px}',
			'.magi-term-row{display:flex;gap:6px;font-size:11px;line-height:1.45;letter-spacing:.1em;color:var(--magi-amber);white-space:nowrap}',
			'.magi-term-key{opacity:.72}',
			'.magi-term-val{color:var(--magi-amber-text)}',
			'.magi-term-question{margin-top:5px;max-width:54ch;font-size:11.5px;line-height:1.45;color:var(--magi-amber-muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
			'.magi-term-slot{margin-top:4px;min-width:108px;padding:5px 14px;border:2px solid;font-size:19px;font-weight:700;letter-spacing:.26em;text-align:center;text-shadow:none}',
			'.magi-term-sub{margin-top:4px;font-size:10.5px;letter-spacing:.14em;color:var(--magi-amber);opacity:.8}',
			'.magi-term-board{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}',
			'.magi-term-svg{width:100%;height:100%;max-height:100%}',
			'.magi-term-magi{font-family:var(--magi-font);font-size:24px;font-weight:700;letter-spacing:.2em;fill:var(--magi-amber)}',
			'.magi-term-name{font-family:var(--magi-font);font-size:22px;font-weight:700}',
			'.magi-term-stance{font-family:var(--magi-font);font-size:13.5px;letter-spacing:.2em;opacity:.9}',
			'.magi-term-shape{transition:fill .25s ease}',
			/* 思考中：浅绿 ↔ 黑 高频闪烁；周期与相位由 beat 随机给定，三台互不同步。
			 * 文字加一圈深色描边，才能在这种底色上始终读得清。 */
			'@keyframes magi-think-fill{0%,22%{fill:#5ef07a}22.5%,46%{fill:#04120a}46.5%,66%{fill:#9cffb2}66.5%,86%{fill:#04120a}86.5%,100%{fill:#5ef07a}}',
			'.magi-term-shape.is-thinking{stroke:#5ef07a;animation-name:magi-think-fill;animation-timing-function:linear;animation-iteration-count:infinite}',
			'.magi-term-name.on-flicker,.magi-term-stance.on-flicker{fill:#ffffff;stroke:#04120a;stroke-width:3px;paint-order:stroke;stroke-linejoin:round}',
			'.magi-term-shape.is-live{animation:magi-term-pulse 1.1s ease-in-out infinite}',
			'@keyframes magi-term-pulse{0%,100%{opacity:1}50%{opacity:.55}}',
			'.magi-composer-compact{border-top:1px solid var(--magi-line);padding:8px 12px 9px}',
			'.magi-composer-compact .magi-input-line{flex:1 1 auto;min-width:0;height:30px;resize:none}',
			'.magi-panel>.magi-term{flex:1 1 auto;min-height:0}',
			/* ── 端末模式：历史（HISTORY）抽屉 ─────────────────────────────────
			 * 覆在整块面板上，按条列出账本里的缩略记录。点一条 → 载入该决议并
			 * 切到詳細模式看三份意见全文；清空需要连点两次确认。 */
			'.magi-term-controls{display:flex;flex-direction:column;align-items:center;gap:6px;align-self:center;margin-top:8px}',
			'.magi-term-controls .magi-mode{margin-top:0}',
			/* 端末系按钮共用一个基样式：琥珀描边 + 等宽字，只有字号/内边距按场景微调。 */
			'.magi-term-histbtn,.magi-history-btn{border:1px solid rgba(255,140,0,.5);color:var(--magi-amber-dim);letter-spacing:.12em}',
			'.magi-term-histbtn{font-size:11px;padding:3px 10px}',
			'.magi-history-btn{font-size:11.5px;padding:4px 12px}',
			'.magi-term-histbtn:hover:not(:disabled),.magi-history-btn:hover:not(:disabled){background:rgba(255,140,0,.12);border-color:var(--magi-amber);color:var(--magi-amber-text)}',
			'.magi-term-histbtn:focus-visible,.magi-history-btn:focus-visible{outline:1px solid var(--magi-amber);outline-offset:1px}',
			'.magi-history{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;min-height:0;background:rgba(4,6,4,.965);color:var(--magi-amber-dim);font-family:var(--magi-font);text-align:left}',
			'.magi-history-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:10px 14px;border-bottom:2px solid var(--magi-amber);flex:0 0 auto}',
			'.magi-history-title{font-size:17px;letter-spacing:.26em}',
			'.magi-history-sub{font-size:10.5px;letter-spacing:.14em;color:var(--magi-amber-muted)}',
			'.magi-history-tools{margin-left:auto;display:flex;align-items:center;gap:8px}',
			'.magi-history-btn:disabled{opacity:.4}',
			'.magi-history-btn[data-danger="true"]{border-color:rgba(255,43,43,.4);color:#b06a5a}',
			'.magi-history-btn[data-danger="true"][data-confirm="true"]{border-color:var(--magi-red);color:var(--magi-red);background:rgba(255,43,43,.12)}',
			'.magi-history-list{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:thin}',
			'.magi-history-row{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;border:0;border-bottom:1px solid rgba(255,140,0,.16);color:var(--magi-amber-dim);padding:8px 14px 9px}',
			'.magi-history-row:hover:not(:disabled){background:rgba(255,140,0,.07);color:var(--magi-amber-text)}',
			'.magi-history-row:focus-visible{outline:1px solid var(--magi-amber);outline-offset:-1px}',
			'.magi-history-row:disabled{cursor:not-allowed;opacity:.5}',
			'.magi-history-row[aria-current="true"]{background:rgba(255,140,0,.13);box-shadow:inset 3px 0 0 var(--magi-amber)}',
			'.magi-history-line{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}',
			'.magi-history-code{color:var(--magi-amber-text);font-weight:700;letter-spacing:.08em;flex:none}',
			'.magi-history-verdict{font-weight:700;letter-spacing:.14em;flex:none}',
			'.magi-history-verdict[data-verdict="APPROVE"]{color:var(--magi-green)}',
			'.magi-history-verdict[data-verdict="REJECT"]{color:var(--magi-red)}',
			'.magi-history-verdict[data-verdict="VETO"]{color:var(--magi-red);text-shadow:0 0 8px rgba(255,43,43,.45)}',
			'.magi-history-verdict[data-verdict="PENDING"]{color:var(--magi-amber-muted)}',
			'.magi-history-meta{font-size:10.5px;letter-spacing:.08em;color:var(--magi-amber-muted)}',
			'.magi-history-meta[data-kind="critical"]{color:var(--magi-red)}',
			'.magi-history-q{font-size:11.5px;line-height:1.45;color:var(--magi-amber-q);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
			'.magi-history-empty{padding:26px 14px;text-align:center;color:var(--magi-amber-muted);letter-spacing:.2em;font-size:12px}',
			'.magi-history-note{flex:0 0 auto;padding:7px 14px;border-top:1px solid rgba(255,140,0,.25);font-size:10.5px;line-height:1.6;color:var(--magi-amber-muted)}',
			'.magi-history-error{flex:0 0 auto;margin:8px 14px 0;padding:6px 8px;font-size:11.5px}',
			'.magi-history-notice{flex:0 0 auto;margin:8px 14px 0;border:1px solid rgba(255,140,0,.4);color:var(--magi-amber-text);padding:5px 8px;font-size:11px;overflow-wrap:anywhere}',
			'@media (max-width:640px){.magi-history-tools{margin-left:0;width:100%}.magi-history-q{white-space:normal}}',
			/* ── 端末模式：三台盾形可点击（打开人格文件） ──────────────────── */
			'.magi-term-unit{outline:none}',
			'.magi-term-unit.is-interactive{cursor:pointer}',
			'.magi-term-unit.is-interactive:hover .magi-term-shape{stroke-width:4;filter:brightness(1.12)}',
			'.magi-term-unit.is-interactive:focus-visible .magi-term-shape{stroke-width:4;filter:brightness(1.18)}',
			/* ── 端末模式：人格文件弹层（粗边框 + 黑底绿字 + 放大字号） ──────
			 * 比詳細模式的正文再大一号；编辑态用同色系 textarea，不引入浅色控件。 */
			'.magi-persona{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;min-height:0;background:#040604;border:3px solid var(--magi-green);box-shadow:inset 0 0 0 1px rgba(4,18,10,.9),0 0 30px rgba(57,255,20,.28);color:var(--magi-green-dim);font-family:var(--magi-font);text-align:left}',
			'.magi-persona::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(57,255,20,.045) 0 1px,rgba(0,0,0,0) 1px 3px)}',
			'.magi-persona>*{position:relative;z-index:1}',
			'.magi-persona-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:12px 16px;border-bottom:2px solid var(--magi-green);background:linear-gradient(180deg,#0a1a0f,#040604);flex:0 0 auto}',
			'.magi-persona-title{color:var(--magi-green);font-size:18px;font-weight:700;letter-spacing:.2em;text-shadow:0 0 10px rgba(57,255,20,.45)}',
			'.magi-persona-unit{color:var(--magi-green);font-size:15px;font-weight:700;letter-spacing:.1em}',
			'.magi-persona-role{font-size:11.5px;letter-spacing:.22em;color:var(--magi-green-dim);opacity:.85}',
			'.magi-persona-src{margin-left:auto;border:1px solid var(--magi-line-2);color:var(--magi-green-dim);padding:1px 8px;font-size:10.5px;letter-spacing:.12em;white-space:nowrap}',
			'.magi-persona-src[data-source="file"]{border-color:var(--magi-green);color:var(--magi-green);box-shadow:inset 0 0 10px rgba(57,255,20,.12)}',
			'.magi-persona-sub{flex:1 0 100%;min-width:0;font-size:11px;line-height:1.5;color:var(--magi-green-dark);letter-spacing:.04em;overflow-wrap:anywhere}',
			'.magi-persona-body{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 18px 18px;display:flex;flex-direction:column;gap:10px}',
			'.magi-persona-text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--magi-green-dim);font-family:var(--magi-font);font-size:15.5px;line-height:1.85}',
			'.magi-persona-empty{margin:auto;padding:24px 0;color:var(--magi-green-dark);letter-spacing:.18em;font-size:13px;text-align:center}',
			'.magi-persona-edit{flex:1 1 auto;width:100%;min-height:14em;background:#030503;color:var(--magi-green);border:2px solid var(--magi-green-dark);border-radius:0;padding:12px 14px;font-family:var(--magi-font);font-size:15.5px;line-height:1.85;resize:none;outline:none}',
			'.magi-persona-edit:focus{border-color:var(--magi-green);box-shadow:0 0 0 1px rgba(57,255,20,.25)}',
			'.magi-persona-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;border-top:2px solid var(--magi-green);background:#040604;flex:0 0 auto}',
			'.magi-persona-hint{margin-right:auto;max-width:62ch;font-size:11px;line-height:1.6;color:var(--magi-green-dark);letter-spacing:.03em}',
			'.magi-persona-btn{border:2px solid var(--magi-green-dark);color:var(--magi-green-dim);font-size:13px;font-weight:700;letter-spacing:.16em;padding:6px 20px}',
			'.magi-persona-btn:hover:not(:disabled){background:rgba(57,255,20,.1);border-color:var(--magi-green);color:var(--magi-green)}',
			'.magi-persona-btn:disabled{opacity:.4}',
			'.magi-persona-btn[data-primary="true"]{border-color:var(--magi-green);color:var(--magi-green);background:rgba(57,255,20,.08);box-shadow:inset 0 0 12px rgba(57,255,20,.08)}',
			'.magi-persona-error{margin:8px 16px 0;padding:6px 10px;font-size:12px;flex:0 0 auto}',
			'.magi-persona-notice{margin:8px 16px 0;border:1px solid var(--magi-green-dark);background:rgba(57,255,20,.06);color:var(--magi-green);padding:6px 10px;font-size:12px;overflow-wrap:anywhere;flex:0 0 auto}',
			'@media (max-width:640px){.magi-persona-head{padding:10px 12px;gap:8px}.magi-persona-src{margin-left:0}.magi-persona-body{padding:10px 12px}.magi-persona-foot{padding:8px 12px}.magi-persona-title{font-size:16px}.magi-persona-text,.magi-persona-edit{font-size:14.5px}.magi-persona-btn{font-size:12px;padding:5px 14px}}',
		].join("\n");

		const tagId = "dsh-plugin-magi/MagiPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-magi";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		/* ------------------------------------------------------------------ *
		 * Vocabulary — must stay byte-aligned with MAGI-数据模型.md            *
		 * ------------------------------------------------------------------ */
		const UNITS = [
			{ unit: "MELCHIOR-1", role: "科学家" },
			{ unit: "BALTHASAR-2", role: "母亲" },
			{ unit: "CASPER-3", role: "女人" },
		];
		const UNIT_NAMES = UNITS.map((entry) => entry.unit);
		const UNIT_STATES = ["standby", "analyzing", "output", "error"];
		const STANCE_LABEL = { approve: "承認", reject: "拒否" };
		const STANCE_EN = { approve: "YES", reject: "NO" };
		/** 旧账本里可能残留的、本系统已取消的取值：只为如实回放历史，不再作为可选项。 */
		function stanceLabel(stance) { return STANCE_LABEL[stance] || String(stance); }
		function verdictLabel(verdict) { return VERDICT_LABEL[verdict] || { zh: String(verdict), en: String(verdict) }; }
		const VERDICT_LABEL = {
			APPROVE: { zh: "承認", en: "APPROVE" },
			REJECT: { zh: "拒否", en: "REJECT" },
			VETO: { zh: "否決", en: "VETO" },
		};
		const TYPE_INTERVAL_MS = 1000 / 35;
		const MAX_CHUNK = 6;

		/**
		 * Layout service handle, captured when the root context exposes one. It is never
		 * assumed to exist: the "转到主视图" button renders only when `selectPanel` is
		 * actually callable on this object.
		 */
		var LAYOUT = null;
		/** Root context kept for lazy service lookup (a service may be provided after apply()). */
		var HOST_CTX = null;

		/** Resolve the layout service lazily; never assume it exists. */
		function layoutFace() {
			if (LAYOUT !== null && typeof LAYOUT.selectPanel === "function") return LAYOUT;
			try {
				const candidate = HOST_CTX === null ? undefined : HOST_CTX.layout;
				if (candidate !== null && candidate !== undefined && typeof candidate.selectPanel === "function") {
					LAYOUT = candidate;
					return LAYOUT;
				}
			} catch (error) {
				// 宿主没有 layout 服务时静默降级：按钮不渲染
			}
			return null;
		}

		/* ------------------------------------------------------------------ *
		 * Small pure helpers                                                   *
		 * ------------------------------------------------------------------ */
		function pad(value, width) {
			let text = String(value);
			while (text.length < width) text = "0" + text;
			return text;
		}

		/** Readable message out of a thrown value (Error, string, anything). */
		function describeError(cause) {
			if (cause === null || cause === undefined) return "unknown error";
			return String(cause.message !== undefined ? cause.message : cause);
		}

		/** 统一取 JSON：非 2xx 时用服务端 error 文案抛错，并带上 status 供调用方分辨 404。 */
		async function requestJson(path, init) {
			const response = await fetch(path, init);
			const payload = await response.json().catch(function () { return null; });
			if (!response.ok) {
				const message = payload !== null && typeof payload === "object" && typeof payload.error === "string"
					? payload.error
					: "HTTP " + response.status;
				const error = new Error(message);
				error.status = response.status;
				throw error;
			}
			return payload;
		}

		/** 决策编号的四位数字；无法识别时为空串。 */
		function decisionDigits(id) {
			if (typeof id !== "string" || id === "") return "";
			const match = /No\.?\s*(\d+)/i.exec(id);
			if (match !== null) return pad(match[1], 4);
			return /^[0-9]+$/.test(id) ? pad(id, 4) : "";
		}

		/** Render an id (`MAGI-DECISION No.0007` or a bare `id`) for the header. */
		function decisionLabel(id) {
			const digits = decisionDigits(id);
			if (digits !== "") return "MAGI DECISION No." + digits;
			return typeof id === "string" && id !== "" ? id : "MAGI DECISION No.----";
		}

		/** `No.0007` — the compact form used by the history rows. */
		function historyCode(id) {
			const digits = decisionDigits(id);
			if (digits !== "") return "No." + digits;
			return typeof id === "string" && id !== "" ? id : "No.----";
		}

		/** `10-22 18:02` — compact local timestamp for a history row. */
		function shortTimestamp(value) {
			const full = formatTimestamp(value);
			return full === "" ? "" : full.slice(5, 16);
		}

		/** Readable message out of a thrown value (Error, string, anything). */
		function describeError(cause) {
			if (cause === null || cause === undefined) return "unknown error";
			return String(cause.message !== undefined ? cause.message : cause);
		}

		/** `2026-02-11 09:41:07` in local time; empty string when unparsable. */
		function formatTimestamp(value) {
			if (value === undefined || value === null || value === "") return "";
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return String(value);
			return (
				date.getFullYear() +
				"-" + pad(date.getMonth() + 1, 2) +
				"-" + pad(date.getDate(), 2) +
				" " + pad(date.getHours(), 2) +
				":" + pad(date.getMinutes(), 2) +
				":" + pad(date.getSeconds(), 2)
			);
		}

		function formatElapsed(ms) {
			if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "--";
			if (ms < 1000) return Math.round(ms) + "ms";
			return (ms / 1000).toFixed(1) + "s";
		}

		function formatConfidence(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "--";
			return value.toFixed(2);
		}

		function confidencePercent(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return 0;
			return Math.max(0, Math.min(100, Math.round(value * 100)));
		}

		function emptyTally() {
			return { approve: 0, reject: 0 };
		}

		/** 三台单元的初始状态表；STANDBY / OUTPUT 两处初始化共用。 */
		function unitStateMap(state) {
			const out = {};
			for (const name of UNIT_NAMES) out[name] = state;
			return out;
		}

		function tallyOf(opinions) {
			const tally = emptyTally();
			for (const opinion of opinions) {
				if (opinion !== null && opinion !== undefined && Object.prototype.hasOwnProperty.call(tally, opinion.stance)) tally[opinion.stance] += 1;
			}
			return tally;
		}

		function tallyText(tally) {
			return tally.approve + " : " + tally.reject;
		}

		function averageConfidence(opinions) {
			let total = 0;
			let count = 0;
			for (const opinion of opinions) {
				if (opinion !== null && opinion !== undefined && typeof opinion.confidence === "number" && Number.isFinite(opinion.confidence)) {
					total += opinion.confidence;
					count += 1;
				}
			}
			return count === 0 ? 0 : total / count;
		}

		function asStringArray(value) {
			if (!Array.isArray(value)) return [];
			const out = [];
			for (const item of value) {
				if (typeof item === "string" && item !== "") out.push(item);
				else if (item !== null && item !== undefined) out.push(String(item));
			}
			return out;
		}

		/** 只接受字符串字段；其余类型统一回落空串。 */
		const asString = (value) => (typeof value === "string" ? value : "");

		function normalizeTally(value) {
			if (value === null || typeof value !== "object") return emptyTally();
			return {
				approve: Number(value.approve) || 0,
				reject: Number(value.reject) || 0,
			};
		}

		/** Normalize the desire readout attached to CASPER-3's tool call. */
		function normalizeDesireReadout(value) {
			if (value === null || typeof value !== "object") return null;
			const flags = Array.isArray(value.flags)
				? value.flags.filter(function (flag) { return flag !== null && typeof flag === "object"; }).slice(0, 4).map(function (flag) {
					return { code: asString(flag.code), message: asString(flag.message) };
				})
				: [];
			const options = Array.isArray(value.options)
				? value.options.filter(function (option) { return option !== null && typeof option === "object"; }).slice(0, 4).map(function (option) {
					return {
						id: asString(option.id),
						label: asString(option.label),
						fit: asString(option.fit),
						violatesRefusal: option.violatesRefusal === true,
					};
				})
				: [];
			const tieBreak = value.tieBreak !== null && typeof value.tieBreak === "object"
				? { result: asString(value.tieBreak.result), probe: asString(value.tieBreak.probe) }
				: null;
			return {
				want: asString(value.want),
				wantBehindWant: asString(value.wantBehindWant),
				price: asString(value.price),
				refusals: asStringArray(value.refusals),
				owner: asString(value.owner),
				borrowedFrom: asString(value.borrowedFrom),
				visibility: asString(value.visibility),
				affect: asString(value.affect),
				forcedChoice: asString(value.forcedChoice),
				tie: value.tie === true,
				flags: flags,
				options: options,
				tieBreak: tieBreak,
			};
		}

		/** Normalize the sub-function audit trail attached to an opinion. Never throws. */
		function normalizeToolCalls(value) {
			if (!Array.isArray(value)) return [];
			const out = [];
			for (const raw of value.slice(0, 4)) {
				if (raw === null || typeof raw !== "object") continue;
				const tool = typeof raw.tool === "string" && raw.tool !== "" ? raw.tool : "";
				if (tool === "") continue;
				out.push({
					tool: tool,
					engine: asString(raw.engine),
					status: typeof raw.status === "string" ? raw.status : "unknown",
					exitCode: typeof raw.exitCode === "number" ? raw.exitCode : undefined,
					durationMs: typeof raw.durationMs === "number" ? raw.durationMs : undefined,
					outputPreview: asString(raw.outputPreview).slice(0, 1200),
					error: asString(raw.error),
					path: asString(raw.path),
					mode: asString(raw.mode),
					summary: asString(raw.summary).slice(0, 400),
					note: asString(raw.note).slice(0, 200),
					readout: tool === "desire_map" ? normalizeDesireReadout(raw.readout) : null,
				});
			}
			return out;
		}

		/** Coerce one wire opinion into the shapes the view depends on. Never throws. */
		function normalizeOpinion(raw, fallbackUnit) {
			const source = raw !== null && typeof raw === "object" ? raw : {};
			const unit = typeof source.unit === "string" && source.unit !== "" ? source.unit : fallbackUnit;
			const stance = source.stance === "approve" ? "approve" : source.stance === "abstain" ? "abstain" : "reject";
			return {
				unit: unit,
				stance: stance,
				confidence: typeof source.confidence === "number" && Number.isFinite(source.confidence) ? source.confidence : 0,
				reason: asString(source.reason),
				key_factors: asStringArray(source.key_factors),
				risks: asStringArray(source.risks),
				caveats: asString(source.caveats),
				tool_calls: normalizeToolCalls(source.tool_calls),
				latencyMs: typeof source.latencyMs === "number" ? source.latencyMs : undefined,
				tokens: source.tokens !== null && typeof source.tokens === "object" ? source.tokens : undefined,
				error: typeof source.error === "string" && source.error !== "" ? source.error : undefined,
			};
		}

		/** Coerce a whole wire result into a MagiResult-ish record. Never throws. */
		function normalizeResult(raw) {
			if (raw === null || typeof raw !== "object") return null;
			const opinions = Array.isArray(raw.opinions)
				? raw.opinions.slice(0, 3).map((opinion, index) => normalizeOpinion(opinion, UNIT_NAMES[index]))
				: [];
			const tally = raw.tally !== null && typeof raw.tally === "object" ? normalizeTally(raw.tally) : tallyOf(opinions);
			const verdict = typeof raw.verdict === "string" && VERDICT_LABEL[raw.verdict] ? raw.verdict : "REJECT";
			const criticality = raw.criticality === "critical" ? "critical" : "normal";
			// 缺少该字段时按「三票完全一致」推断（全票承認 或 全票否決）
			const unanimity = typeof raw.unanimity === "boolean" ? raw.unanimity : tally.approve === 3 || tally.reject === 3;
			return {
				id: typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : "",
				createdAt: asString(raw.createdAt),
				question: asString(raw.question),
				context: typeof raw.context === "string" ? raw.context : undefined,
				criticality: criticality,
				criticalitySource: typeof raw.criticalitySource === "string" ? raw.criticalitySource : "default",
				matchedKeywords: asStringArray(raw.matchedKeywords),
				opinions: opinions,
				tally: tally,
				verdict: verdict,
				unanimity: unanimity,
				confidenceAvg: typeof raw.confidenceAvg === "number" && Number.isFinite(raw.confidenceAvg) ? raw.confidenceAvg : averageConfidence(opinions),
				elapsedMs: typeof raw.elapsedMs === "number" ? raw.elapsedMs : 0,
				notes: asStringArray(raw.notes),
			};
		}

		/** Tool-card payload: a MagiResult, or `{ result }` / `{ id, result }` wrapped. */
		function pickResult(payload) {
			if (payload === null || typeof payload !== "object") return null;
			if (payload.result !== null && typeof payload.result === "object") return normalizeResult(payload.result);
			if (Array.isArray(payload.opinions)) return normalizeResult(payload);
			if (payload.data !== null && typeof payload.data === "object") return pickResult(payload.data);
			return null;
		}

		/** Parse a tool block's text; returns `{ ok, value }` and never throws. */
		function parseBlockText(text) {
			if (typeof text !== "string") return { ok: false, value: null };
			const trimmed = text.trim();
			if (trimmed === "" || (trimmed.charAt(0) !== "{" && trimmed.charAt(0) !== "[")) return { ok: false, value: null };
			try {
				return { ok: true, value: JSON.parse(trimmed) };
			} catch (error) {
				return { ok: false, value: null };
			}
		}

		/** Id out of the tool result, accepting `id` or an id embedded in the label. */
		function resultIdOf(value) {
			if (value === null || typeof value !== "object") return "";
			if (typeof value.id === "string" || typeof value.id === "number") return String(value.id);
			if (value.result !== null && typeof value.result === "object") return resultIdOf(value.result);
			return "";
		}

		function prefersReducedMotion() {
			if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
			try {
				return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			} catch (error) {
				return false;
			}
		}

		/** requestAnimationFrame typewriter. Returns `[visibleText, skip]`. */
		function useTypewriter(fullText, active, instant) {
			const text = typeof fullText === "string" ? fullText : "";
			const [visible, setVisible] = useState(text);
			const reduced = useMemo(prefersReducedMotion, []);
			const animate = active === true && instant !== true && reduced !== true;

			useEffect(function () {
				if (!animate) {
					setVisible(text);
					return undefined;
				}
				if (text === "") {
					setVisible("");
					return undefined;
				}
				setVisible(text.slice(0, 1));
				let shown = 1;
				let handle = 0;
				let last = 0;
				const step = function (time) {
					if (last === 0) last = time;
					const budget = Math.max(1, Math.floor((time - last) / TYPE_INTERVAL_MS));
					if (budget >= 1) {
						last = time;
						shown = Math.min(text.length, shown + Math.min(budget, MAX_CHUNK));
						setVisible(text.slice(0, shown));
					}
					if (shown < text.length) handle = window.requestAnimationFrame(step);
				};
				handle = window.requestAnimationFrame(step);
				return function () {
					if (handle !== 0) window.cancelAnimationFrame(handle);
				};
			}, [text, animate, active]);

			const skip = useCallback(function () { setVisible(text); }, [text]);
			const done = animate !== true || visible.length >= text.length;
			return [visible, skip, done];
		}

		/* ------------------------------------------------------------------ *
		 * Presentation pieces                                                  *
		 * ------------------------------------------------------------------ */
		/** 仪表读数用的短标签，避免界面直白地写 TOOL。 */
		function toolBadge(tool) {
			if (tool === "run_script") return "LAB";
			if (tool === "compose_text") return "CARE";
			if (tool === "desire_map") return "DESIRE";
			return "TOOL";
		}

		/** 状态灯：詳細三列与对话卡片共用。 */
		function Lamp(props) {
			return h("div", { className: "magi-lamp", "data-state": props.state, title: "状态: " + props.state.toUpperCase() },
				h("i", null),
				h("span", null, props.state.toUpperCase()));
		}

		/** 结论徽标：只有 承認 / 拒否 / 待决 三种显示。 */
		function StanceBadge(props) {
			const stance = props.stance;
			return h("div", { className: "magi-stance", "data-stance": stance === null ? "none" : stance },
				stance === null ? "── 待决 ──" : stanceLabel(stance),
				stance === null ? null : h("small", null, STANCE_EN[stance]));
		}

		/** 置信度读数条：没有有效数值时不渲染。 */
		function ConfidenceBar(props) {
			if (typeof props.value !== "number" || !Number.isFinite(props.value)) return null;
			return h("div", { className: "magi-conf" },
				h("span", null, "CONF"),
				h("span", { className: "magi-conf-bar" }, h("i", { style: { width: confidencePercent(props.value) + "%" } })),
				h("span", null, formatConfidence(props.value)));
		}

		/** 错误 / 提示条：只负责角色与 class，配色交给各场景自己的样式。 */
		function StatusBanner(props) {
			if (typeof props.text !== "string" || props.text === "") return null;
			return h("div", { className: props.className, role: props.role }, props.text);
		}

		/** CASPER-3 的欲望读数：只展示她给出的东西，不做额外判断。 */
		function DesireReadout(props) {
			const readout = props.readout;
			const rows = [
				["WANT", readout.want],
				["BEHIND", readout.wantBehindWant],
				["PRICE", readout.price],
				["REFUSAL", readout.refusals.join(" / ")],
				["OWNER", readout.owner + (readout.borrowedFrom !== "" ? " ← " + readout.borrowedFrom : "")],
				["UNSEEN", readout.visibility],
				["AFFECT", readout.affect],
				["CHOICE", readout.forcedChoice],
			].filter(function (row) { return row[1] !== ""; });
			return h("div", { className: "magi-desire" },
				h("div", { className: "magi-desire-title" }, "CASPER // DESIRE"),
				rows.map(function (row) {
					return h("div", { key: row[0], className: "magi-desire-row" },
						h("span", { className: "magi-desire-key" }, row[0]),
						h("span", { className: "magi-desire-val" }, row[1]));
				}),
				readout.flags.length > 0
					? h("ul", { className: "magi-desire-flags" }, readout.flags.map(function (flag, index) {
						return h("li", { key: flag.code + index }, flag.message);
					}))
					: null,
				readout.tie === true
					? h("div", { className: "magi-desire-tie" }, "两个选项打平；抽签是镜子，不是替你负责的人。")
					: null,
				readout.tieBreak !== null
					? h("div", { className: "magi-desire-tie" },
						"TIE " + readout.tieBreak.result + " · " + readout.tieBreak.probe)
					: null
			);
		}

		function UnitColumn(props) {
			const view = props.view;
			const reduced = props.reduced;
			const typed = useTypewriter(view.text, view.state === "output", false);
			const visible = typed[0];
			const skip = typed[1];
			const typing = view.state === "output" && typed[2] !== true;
			const reasonRef = useRef(null);
			const unitRef = useRef(null);

			useEffect(function () {
				const node = reasonRef.current;
				if (node !== null && view.state === "output") node.scrollTop = node.scrollHeight;
			}, [visible, view.state]);

			// 判决落定时三列各闪一次；flash 每次判决递增，effect 负责重新触发 180ms 脉冲。
			useEffect(function () {
				if (props.flash === undefined || props.flash === 0 || reduced === true) return undefined;
				const node = unitRef.current;
				if (node === null) return undefined;
				node.classList.remove("flash");
				void node.offsetWidth; // 强制回流，连续两次判决也能看到脉冲
				node.classList.add("flash");
				const handle = window.setTimeout(function () { node.classList.remove("flash"); }, 200);
				return function () {
					window.clearTimeout(handle);
					node.classList.remove("flash");
				};
			}, [props.flash, reduced]);

			const children = [];
			children.push(
				h("div", { key: "head", className: "magi-unit-head" },
					h("div", { className: "magi-unit-head-main" },
						h("div", { className: "magi-unit-name" }, view.unit),
						h("div", { className: "magi-unit-role" }, view.role)
					),
					h(Lamp, { state: view.state })
				)
			);
			const reasonChildren = [h("span", { key: "t" }, visible)];
			if (typing) reasonChildren.push(h("span", { key: "c", className: "magi-caret", "aria-hidden": "true" }));
			children.push(
				h("div", {
					key: "reason",
					className: "magi-reason",
					ref: reasonRef,
					"aria-live": view.state === "output" ? "polite" : "off",
				}, reasonChildren.length === 1 && visible === "" ? h("span", { className: "magi-muted" }, "── 待機 ──") : reasonChildren)
			);
			if (typing) children.push(h("button", { key: "skip", type: "button", className: "magi-context-toggle", onClick: skip }, "跳过动画 ▸▸"));

			const facts = [];
			if (view.opinion !== null && view.opinion.key_factors.length > 0) {
				facts.push(h("details", { key: "kf", className: "magi-facts" },
					h("summary", null, "key_factors · " + view.opinion.key_factors.length),
					h("ul", null, view.opinion.key_factors.map(function (item, index) { return h("li", { key: index }, item); }))
				));
			}
			if (view.opinion !== null && view.opinion.risks.length > 0) {
				facts.push(h("details", { key: "rk", className: "magi-facts" },
					h("summary", null, "risks · " + view.opinion.risks.length),
					h("ul", null, view.opinion.risks.map(function (item, index) { return h("li", { key: index }, h("b", null, "! "), item); }))
				));
			}
			if (view.opinion !== null && view.opinion.caveats !== "") {
				facts.push(h("div", { key: "cv", className: "magi-facts magi-muted" }, "caveats: " + view.opinion.caveats));
			}
			if (view.opinion !== null && Array.isArray(view.opinion.tool_calls) && view.opinion.tool_calls.length > 0) {
				facts.push(h("details", { key: "tools", className: "magi-facts magi-tools" },
					h("summary", null, "子功能 · " + view.opinion.tool_calls.length),
					h("ul", null, view.opinion.tool_calls.map(function (call, index) {
						const meta = [call.tool, call.engine, call.status].filter(Boolean);
						if (call.exitCode !== undefined) meta.push("exit " + call.exitCode);
						if (call.durationMs !== undefined) meta.push(formatElapsed(call.durationMs));
						return h("li", { key: index },
							h("div", { className: "magi-tool-head" }, meta.join(" · ")),
							call.note !== "" ? h("div", { className: "magi-tool-note" }, "「" + call.note + "」") : null,
							call.summary !== "" ? h("div", { className: "magi-tool-summary" }, call.summary) : null,
							call.path !== "" ? h("div", { className: "magi-tool-path" }, call.path) : null,
							call.readout !== null
								? h(DesireReadout, { readout: call.readout })
								: (call.outputPreview !== "" ? h("pre", { className: "magi-tool-output" }, call.outputPreview) : null),
							call.error !== "" ? h("div", { className: "magi-tool-error" }, call.error) : null
						);
					}))
				));
			}
			if (view.opinion !== null && view.opinion.error !== undefined) {
				facts.push(h("div", { key: "er", className: "magi-facts magi-fact-error" }, "error: " + view.opinion.error));
			}
			if (view.opinion !== null && view.opinion.latencyMs !== undefined) {
				facts.push(h("div", { key: "lat", className: "magi-facts magi-muted" }, "latency " + formatElapsed(view.opinion.latencyMs)));
			}
			if (facts.length > 0) children.push(h("div", { key: "facts", className: "magi-facts" }, facts));

			const stance = view.stance;
			children.push(h(StanceBadge, { key: "stance", stance: stance }));
			if (stance !== null) children.push(h(ConfidenceBar, { key: "conf", value: view.confidence }));
			return h("section", {
				ref: unitRef,
				className: "magi-unit",
				"data-state": view.state,
				"aria-label": view.unit + " " + view.role,
			}, children);
		}

		function TallyBar(props) {
			const dots = UNIT_NAMES.map(function (name, index) {
				const stance = props.stances[index];
				return h("i", { key: name, "data-stance": stance === null ? "none" : stance, title: name + " " + (stance === null ? "待决" : stanceLabel(stance)) });
			});
			const children = [
				h("span", { key: "v", className: "magi-tally" }, "VOTE ", h("span", null, tallyText(props.tally))),
				h("span", { key: "d", className: "magi-dots" }, dots),
			];
			if (props.verdict !== null) {
				const label = verdictLabel(props.verdict);
				children.push(h("span", { key: "r", className: "magi-verdict", "data-verdict": props.verdict }, label.zh, h("small", null, "/ " + label.en)));
			}
			if (props.unanimity === true) children.push(h("span", { key: "u", className: "magi-chip", "data-kind": "unanimous" }, "UNANIMOUS " + tallyText(props.tally)));
			children.push(h("span", { key: "c", className: "magi-chip", "data-kind": "meta" }, "CONF AVG " + formatConfidence(props.confidenceAvg)));
			children.push(h("span", { key: "e", className: "magi-chip", "data-kind": "meta" }, "ELAPSED " + formatElapsed(props.elapsedMs)));
			return h("div", { className: "magi-summary" }, children);
		}

		function CriticalBar(props) {
			if (props.criticality !== "critical") return null;
			const keywords = asStringArray(props.matchedKeywords);
			return h("div", { className: "magi-alertbar", role: "alert" },
				h("span", { className: "magi-alertbar-dot", "aria-hidden": "true" }),
				h("span", null, "CRITICAL · 三票一致方可执行"),
				props.criticalitySource !== undefined ? h("span", { className: "magi-chip", "data-kind": "critical" }, "SOURCE " + String(props.criticalitySource)) : null,
				keywords.length > 0 ? h("span", { className: "magi-chip", "data-kind": "critical" }, "KEYWORDS " + keywords.join(",")) : null
			);
		}

		/* ------------------------------------------------------------------ *
		 * Header / composer                                                    *
		 * ------------------------------------------------------------------ */
		function MagiHeader(props) {
			return h("header", { className: "magi-header" },
				h("div", { className: "magi-header-left" },
					h("span", { className: "magi-system" }, "MAGI SYSTEM"),
					h("span", { className: "magi-muted magi-protocol" }, "DECISION PROTOCOL v1")
				),
				h("div", { className: "magi-header-right" },
					props.mode === undefined ? null : h(ModePick, { mode: props.mode, onChange: props.onMode }),
					h("span", { className: "magi-decision" }, decisionLabel(props.id)),
					props.criticality === "critical" ? h("span", { className: "magi-chip", "data-kind": "critical" }, "CRITICAL") : null,
					h("span", { className: "magi-timestamp" }, props.timestamp === "" ? "---------- --:--:--" : props.timestamp)
				)
			);
		}

		/** 通常 / 重要 档位选择；詳細与端末两套输入区共用。 */
		function CriticalityPick(props) {
			const pick = function (value) {
				return function () { props.onChange(value); };
			};
			return h("div", { className: "magi-seg", role: "group", "aria-label": "criticality" },
				h("button", { type: "button", "data-crit": "normal", "aria-pressed": props.value === "normal", onClick: pick("normal") }, "通常"),
				h("button", { type: "button", "data-crit": "critical", "aria-pressed": props.value === "critical", onClick: pick("critical") }, "重要")
			);
		}

		function MagiComposer(props) {
			const [question, setQuestion] = useState("");
			const [context, setContext] = useState("");
			const [contextOpen, setContextOpen] = useState(false);
			const [criticality, setCriticality] = useState("normal");

			const submit = function () {
				const trimmed = question.trim();
				if (trimmed === "" || props.busy === true) return;
				props.onSubmit({ question: trimmed, context: context.trim() === "" ? undefined : context, criticality: criticality });
			};
			const onKeyDown = function (event) {
				if (event.key !== "Enter") return;
				if (event.shiftKey === true) return;
				event.preventDefault();
				submit();
			};

			const runButton = h("button", {
				type: "button",
				className: "magi-btn",
				disabled: props.busy === true || question.trim() === "",
				onClick: submit,
			}, props.busy === true ? "表决中…" : "执行");
			const exitButton = props.onExitPanel !== undefined
				? h("button", { type: "button", className: "magi-btn", "data-variant": "ghost", onClick: props.onExitPanel }, "← 返回会话")
				: null;

			// 端末模式：单行输入，尽量不占版面
			if (props.compact === true) {
				return h("div", { className: "magi-composer magi-composer-compact" },
					h("div", { className: "magi-composer-row" },
						h("input", {
							className: "magi-textarea magi-input-line",
							type: "text",
							value: question,
							placeholder: "待决事项…（Enter 执行）",
							"aria-label": "议题",
							onChange: function (event) { setQuestion(event.target.value); },
							onKeyDown: onKeyDown,
						}),
						h(CriticalityPick, { value: criticality, onChange: setCriticality }),
						runButton,
						exitButton
					)
				);
			}

			return h("div", { className: "magi-composer" },
				h("label", { className: "magi-field" },
					h("span", null, "议题 / QUESTION"),
					h("textarea", {
						className: "magi-textarea",
						rows: 2,
						value: question,
						placeholder: "待决事项…（Enter 执行 / Shift+Enter 换行）",
						"aria-label": "议题",
						onChange: function (event) { setQuestion(event.target.value); },
						onKeyDown: onKeyDown,
					})
				),
				h("button", {
					type: "button",
					className: "magi-context-toggle",
					"aria-expanded": contextOpen === true,
					onClick: function () { setContextOpen(function (open) { return open !== true; }); },
				}, (contextOpen === true ? "▾ " : "▸ ") + "上下文 / CONTEXT" + (context.trim() === "" ? "" : " · 已填寫")),
				contextOpen === true
					? h("textarea", {
						className: "magi-textarea",
						rows: 3,
						value: context,
						placeholder: "背景、约束、已知数据…",
						"aria-label": "上下文",
						onChange: function (event) { setContext(event.target.value); },
					})
					: null,
				h("div", { className: "magi-composer-row" },
					h(CriticalityPick, { value: criticality, onChange: setCriticality }),
					h("div", { className: "magi-actions" }, exitButton, runButton)
				),
				h("div", { className: "magi-hint" }, props.hint)
			);
		}

		/* ------------------------------------------------------------------ *
		 * Board — the shared unit grid used by the panel and the tool card     *
		 * ------------------------------------------------------------------ */
		function buildViews(record) {
			const states = record.states;
			const texts = record.texts;
			const opinions = record.opinions;
			return UNITS.map(function (entry, index) {
				const opinion = opinions[index] !== undefined ? opinions[index] : null;
				const streaming = texts[entry.unit] !== undefined ? texts[entry.unit] : "";
				let state = states[entry.unit] !== undefined ? states[entry.unit] : "standby";
				let text = "";
				if (state === "error") {
					text = opinion !== null && opinion.error !== undefined ? opinion.error : streaming;
				} else if (opinion !== null) {
					text = opinion.reason;
					if (state === "standby" || state === "analyzing") state = "output";
				} else if (streaming !== "") {
					text = streaming;
					if (state === "standby" || state === "analyzing") state = "output";
				} else if (state === "output") {
					text = "";
				}
				return {
					unit: entry.unit,
					role: entry.role,
					state: state,
					text: text,
					opinion: opinion,
					stance: opinion !== null ? opinion.stance : null,
					confidence: opinion !== null ? opinion.confidence : null,
				};
			});
		}

		function MagiBoard(props) {
			const record = props.record;
			const reduced = props.reduced;
			const views = buildViews(record);
			const columns = views.map(function (view) {
				return h(UnitColumn, { key: view.unit, view: view, reduced: reduced, flash: props.flash });
			});
			const children = [h("div", { key: "units", className: "magi-units" }, columns)];
			if (record.verdict !== null) {
				children.push(h(TallyBar, {
					key: "tally",
					tally: record.tally,
					stances: views.map(function (view) { return view.stance; }),
					verdict: record.verdict,
					unanimity: record.unanimity,
					confidenceAvg: record.confidenceAvg,
					elapsedMs: record.elapsedMs,
				}));
			}
			if (record.notes.length > 0) {
				children.push(h("ul", { key: "notes", className: "magi-notes" }, record.notes.map(function (note, index) { return h("li", { key: index }, note); })));
			}
			return h("div", { className: "magi-body" }, children);
		}

		/* ------------------------------------------------------------------ *
		 * 端末模式（terminal）—— 参考原作的三盾三角盘面：                  *
		 * 蓝＝承認、红＝拒否、琥珀＝待決；橙色连线汇到中心的 MAGI。           *
		 * 这一模式**不输出理由**，只用颜色与判决词表示结果。                 *
		 * ------------------------------------------------------------------ */

		const TERM_TONE = {
			approve: { fill: "#5aa7dd", edge: "#cfe9fa", ink: "#082741", label: "承認" },
			reject: { fill: "#c1121f", edge: "#ff8a8a", ink: "#2b0407", label: "拒否" },
			pending: { fill: "#221d10", edge: "#ff8c00", ink: "#ffb347", label: "待決" },
			error: { fill: "#2a0f10", edge: "#ff2b2b", ink: "#ff9c9c", label: "故障" },
		};

		/**
		 * 三块面板的位置与外形（viewBox 600×460）：
		 * - 上面那台（BALTHASAR-2）是**平底盾形**：上边两个直角，下边两个角被削掉；
		 * - 下面两台是**缺一角的长方形**：缺的角朝上、朝内（对着上面那台）。
		 *
		 * 缺角的斜边方向**由三角形连线算出**（`notchRatio`）—— 所以相邻两块缺的角彼此平行、
		 * 对得起来，琥珀色连线正好从两两相对的缺口之间穿过。位置一改，斜边跟着改，不会各切各的 45°。
		 * 下面两台：MELCHIOR-1 在左下、CASPER-3 在右下。
		 */
		const TERM_CENTERS = {
			top: { x: 340, y: 160 },
			left: { x: 157, y: 320 },
			right: { x: 523, y: 320 },
		};
		/** 缺角斜边的「横 : 竖」比 = 上→下连线的斜率，故斜边与连线严格平行。 */
		const notchRatio = Math.abs(TERM_CENTERS.left.x - TERM_CENTERS.top.x) /
			Math.abs(TERM_CENTERS.left.y - TERM_CENTERS.top.y);

		const TERM_SHAPES = [
			{
				// 2：底边两个角切得更深，矩形（含切角前的那块）纵向拉长
				unit: "BALTHASAR-2", kind: "shield",
				cx: TERM_CENTERS.top.x, cy: TERM_CENTERS.top.y, hw: 138, hh: 74,
				cutV: 78, nameDy: -12, stanceDy: 30,
			},
			{
				// 1：矩形纵向拉长；位置整体上移
				unit: "MELCHIOR-1", kind: "rect", notch: "top-right",
				cx: TERM_CENTERS.left.x, cy: TERM_CENTERS.left.y, hw: 148, hh: 82,
				cutV: 76, nameDy: -4, stanceDy: 32,
			},
			{
				// 3：与 1 对称
				unit: "CASPER-3", kind: "rect", notch: "top-left",
				cx: TERM_CENTERS.right.x, cy: TERM_CENTERS.right.y, hw: 148, hh: 82,
				cutV: 76, nameDy: -4, stanceDy: 32,
			},
		];
		/**
		 * `MAGI` 标签落点：2 下移后它与下方两台的竖直空档只剩几像素，所以标签改放在
		 * 下方两台的**中央通道**里 —— 缺角让那里反而有 ~83px 空间，且正对连线交汇处。
		 */
		const TERM_CENTER = { x: 340, y: 274 };

		/** 各外形的顶点；缺角斜边的横边长度 = 竖边长度 × notchRatio（因此与连线平行）。 */
		const shapePoints = function (shape) {
			const { cx, cy, hw, hh } = shape;
			const t2 = shape.cutV;
			const t1 = t2 * notchRatio;
			if (shape.kind === "shield") {
				return [
					[cx - hw, cy - hh],           // 左上直角
					[cx + hw, cy - hh],           // 右上直角
					[cx + hw, cy + hh - t2],      // 右边直下
					[cx + hw - t1, cy + hh],      // 右下缺角
					[cx - hw + t1, cy + hh],      // 左下缺角
					[cx - hw, cy + hh - t2],      // 左边直上
				];
			}
			if (shape.notch === "top-left") {
				return [
					[cx - hw + t1, cy - hh],      // 缺掉的左上角
					[cx + hw, cy - hh],
					[cx + hw, cy + hh],
					[cx - hw, cy + hh],
					[cx - hw, cy - hh + t2],
				];
			}
			return [
				[cx - hw, cy - hh],
				[cx + hw - t1, cy - hh],        // 缺掉的右上角
				[cx + hw, cy - hh + t2],
				[cx + hw, cy + hh],
				[cx - hw, cy + hh],
			];
		};

		const pointsAttr = (shape) => shapePoints(shape)
			.map(function (point) { return point.join(","); })
			.join(" ");

		const toneOf = function (view) {
			if (view.state === "error") return TERM_TONE.error;
			if (view.stance === "approve") return TERM_TONE.approve;
			if (view.stance === "reject") return TERM_TONE.reject;
			return TERM_TONE.pending;
		};

		/** 左上「提訴」：把真实数据映射成原作那五行终端读数。 */
		function TermBrief(props) {
			const record = props.record;
			const digits = decisionDigits(record.id);
			const rows = [
				["CODE", digits === "" ? "----" : digits],
				["FILE", "MAGI_SYS"],
				["EXTENTION", tallyText(record.tally)],
				["EX_MODE", props.crt === true ? "ON" : "OFF"],
				["PRIORITY", record.criticality === "critical" ? "AAA" : "AA"],
			];
			return h("div", { className: "magi-term-brief" },
				h("div", { className: "magi-term-kanji" }, "提訴"),
				h("div", { className: "magi-term-rows" }, rows.map(function (row) {
					return h("div", { key: row[0], className: "magi-term-row" },
						h("span", { className: "magi-term-key" }, row[0] + " :"),
						h("span", { className: "magi-term-val" }, row[1])
					);
				})),
				record.question === "" ? null : h("div", { className: "magi-term-question" }, record.question)
			);
		}

		/** 右上「決議」：判决词，颜色即结论。 */
		function TermVerdict(props) {
			const record = props.record;
			const kind = record.verdict === "APPROVE" ? "approve" : (record.verdict === null ? "pending" : "reject");
			const tone = TERM_TONE[kind];
			return h("div", { className: "magi-term-verdict" },
				h("div", { className: "magi-term-kanji" }, "決議"),
				h("div", {
					className: "magi-term-slot",
					"data-kind": kind,
					style: kind === "pending"
						? { borderColor: tone.edge, color: tone.edge }
						: { borderColor: tone.edge, background: tone.fill, color: "#ffffff" },
				}, record.verdict === null ? "──" : verdictLabel(record.verdict).zh),
				h("div", { className: "magi-term-sub" },
					"VOTE " + tallyText(record.tally) + (record.unanimity === true ? " · 一致" : ""))
			);
		}

		function MagiTerminal(props) {
			const record = props.record;
			const views = buildViews(record);
			const byUnit = new Map(views.map(function (view) { return [view.unit, view]; }));
			const svg = [];
			const edges = [
				[TERM_SHAPES[0], TERM_SHAPES[1]],
				[TERM_SHAPES[1], TERM_SHAPES[2]],
				[TERM_SHAPES[2], TERM_SHAPES[0]],
			];
			for (const pair of edges) {
				svg.push(h("line", {
					key: pair[0].unit + pair[1].unit,
					x1: pair[0].cx, y1: pair[0].cy, x2: pair[1].cx, y2: pair[1].cy,
					stroke: "#ff8c00", strokeWidth: 5, strokeLinecap: "square",
				}));
			}
			svg.push(h("text", {
				key: "magi", x: TERM_CENTER.x, y: TERM_CENTER.y + 7,
				textAnchor: "middle", className: "magi-term-magi",
			}, "MAGI"));
			for (const shape of TERM_SHAPES) {
				const view = byUnit.get(shape.unit);
				const tone = toneOf(view);
				// 思考中：盾形底色在浅绿与黑之间高频闪烁（每台周期/相位不同 → 看起来随机不同步）
				const thinking = props.thinking === true && view.stance === null && view.state !== "error";
				const beat = thinking && props.beat !== undefined ? props.beat[shape.unit] : null;
				const interactive = typeof props.onUnitOpen === "function";
				svg.push(h("g", {
					key: shape.unit,
					className: "magi-term-unit" + (interactive ? " is-interactive" : ""),
					role: interactive ? "button" : undefined,
					tabIndex: interactive ? 0 : undefined,
					"aria-label": interactive ? "查看 " + shape.unit + " 的人格文件" : undefined,
					onClick: interactive ? function () { props.onUnitOpen(shape.unit); } : undefined,
					onKeyDown: interactive
						? function (event) {
							if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
								event.preventDefault();
								props.onUnitOpen(shape.unit);
							}
						}
						: undefined,
				}, [
					h("polygon", {
						key: "shape",
						points: pointsAttr(shape),
						fill: tone.fill, stroke: tone.edge, strokeWidth: 2,
						className: "magi-term-shape" + (thinking ? " is-thinking" : ""),
						style: beat === null || beat === undefined
							? undefined
							: { animationDuration: beat.duration + "ms", animationDelay: beat.delay + "ms" },
					}),
					h("text", {
						key: "name", x: shape.cx, y: shape.cy + (shape.nameDy === undefined ? -3 : shape.nameDy),
						textAnchor: "middle",
						className: "magi-term-name" + (thinking ? " on-flicker" : ""),
						fill: tone.ink,
					}, shape.unit),
					h("text", {
						key: "stance", x: shape.cx, y: shape.cy + (shape.stanceDy === undefined ? 28 : shape.stanceDy),
						textAnchor: "middle",
						className: "magi-term-stance" + (thinking ? " on-flicker" : ""),
						fill: tone.ink,
					}, thinking ? "思考中" : tone.label),
				]));
			}
			return h("div", { className: "magi-term" },
				h("div", { className: "magi-term-top" },
					h(TermBrief, { record: record, crt: props.crt }),
					h("div", { className: "magi-term-controls" },
						h(ModePick, { mode: props.mode, onChange: props.onMode }),
						h("button", {
							type: "button",
							className: "magi-term-histbtn",
							"data-magi-history-toggle": "true",
							title: "查看账本里的表决历史",
							onClick: props.onHistory,
						}, "历史" + (props.historyCount > 0 ? " " + props.historyCount : ""))
					),
					h(TermVerdict, { record: record })
				),
				h("div", { className: "magi-term-board" },
					h("svg", { viewBox: "0 62 680 364", preserveAspectRatio: "xMidYMid meet", className: "magi-term-svg" }, svg)
				)
			);
		}

		/** 詳細 / 端末 的显示模式开关（记住选择）。 */
		const MODE_KEY = "magi-panel-mode";

		function usePanelMode() {
			const [mode, setMode] = useState(function () {
				try {
					return window.localStorage.getItem(MODE_KEY) === "terminal" ? "terminal" : "detail";
				} catch (error) {
					return "detail";
				}
			});
			const change = useCallback(function (next) {
				setMode(next);
				try {
					window.localStorage.setItem(MODE_KEY, next);
				} catch (error) {
					// 隐私模式等场景下写不了就只在本次会话内有效
				}
			}, []);
			return [mode, change];
		}

		function ModePick(props) {
			return h("div", { className: "magi-seg magi-mode", role: "group", "aria-label": "显示模式" },
				h("button", { type: "button", "aria-pressed": props.mode === "detail", onClick: function () { props.onChange("detail"); } }, "詳細"),
				h("button", { type: "button", "aria-pressed": props.mode === "terminal", onClick: function () { props.onChange("terminal"); } }, "端末")
			);
		}

		/**
		 * 历史记录抽屉：账本摘要的逐条缩略列表。
		 * 点一条 → 由 MagiPanel 取回完整记录、切到詳細模式；清空需连点两次。
		 */
		function TermHistory(props) {
			const rows = Array.isArray(props.rows) ? props.rows : [];
			const busy = props.busy === true;
			const loading = props.loading === true;
			const children = [
				h("div", { key: "head", className: "magi-history-head" },
					h("span", { className: "magi-history-title" }, "历史记录"),
					h("span", { className: "magi-history-sub" }, "HISTORY · " + rows.length + " 条" + (loading ? " · 读取中" : "")),
					h("div", { className: "magi-history-tools" },
						h("button", {
							type: "button",
							className: "magi-history-btn",
							"data-danger": "true",
							"data-confirm": props.confirm === true ? "true" : "false",
							disabled: busy || loading || props.canClear !== true,
							title: props.canClear === true ? "删除账本里的全部表决记录（编号不回收）" : "表决进行中或没有记录，暂不能清空",
							onClick: props.onClear,
						}, props.confirm === true ? "确认清空？" : "清空历史"),
						h("button", { type: "button", className: "magi-history-btn", onClick: props.onClose }, "关闭")
					)
				),
			];
			if (typeof props.error === "string" && props.error !== "") {
				children.push(h(StatusBanner, { key: "err", className: "magi-history-error", role: "alert", text: props.error }));
			}
			if (typeof props.notice === "string" && props.notice !== "") {
				children.push(h(StatusBanner, { key: "notice", className: "magi-history-notice", role: "status", text: props.notice }));
			}
			children.push(h("div", { key: "list", className: "magi-history-list" },
				rows.length === 0
					? h("div", { className: "magi-history-empty" }, loading ? "正在读取账本…" : "暂无表决记录")
					: rows.map(function (row, index) {
						const key = typeof row.key === "string" && row.key !== ""
							? row.key
							: (typeof row.id === "string" && row.id !== "" ? row.id : String(index));
						const tally = row.tally !== null && typeof row.tally === "object" ? normalizeTally(row.tally) : null;
						const verdictKind = row.verdict === "APPROVE" || row.verdict === "REJECT" || row.verdict === "VETO" ? row.verdict : "PENDING";
						return h("button", {
							key: key,
							type: "button",
							className: "magi-history-row",
							disabled: busy,
							"aria-current": props.selectedKey === key ? "true" : "false",
							title: typeof row.question === "string" ? row.question : "",
							onClick: function () { props.onPick(row); },
						},
							h("span", { className: "magi-history-line" },
								h("span", { className: "magi-history-code" }, historyCode(row.id)),
								h("span", { className: "magi-history-verdict", "data-verdict": verdictKind }, row.verdict ? verdictLabel(row.verdict).zh : "──"),
								tally === null ? null : h("span", { className: "magi-history-meta" }, "VOTE " + tallyText(tally)),
								row.criticality === "critical" ? h("span", { className: "magi-history-meta", "data-kind": "critical" }, "CRITICAL") : null,
								h("span", { className: "magi-history-meta" }, shortTimestamp(row.createdAt))
							),
							h("span", { className: "magi-history-q" }, typeof row.question === "string" && row.question !== "" ? row.question : "（无议题）")
						);
					})
			));
			children.push(h("div", { key: "note", className: "magi-history-note" },
				"点击条目 → 载入该决议并查看三份意见全文。清空只删除记录与索引，决策编号继续递增，不回收。"));
			return h("div", {
				className: "magi-history",
				role: "dialog",
				"aria-modal": "true",
				"aria-label": "MAGI 表决历史记录",
				"data-magi-history": "open",
			}, children);
		}

		/**
		 * 人格文件弹层：查看 / 编辑某台单元的人格 md。
		 * 纯展示组件；取数、保存与编辑状态都由 MagiPanel 持有。
		 */
		function PersonaDialog(props) {
			const record = props.record !== null && typeof props.record === "object" ? props.record : null;
			const editing = props.editing === true;
			const saving = props.saving === true;
			const loading = props.loading === true;
			const dir = typeof props.dir === "string" ? props.dir : "";
			const draft = typeof props.draft === "string" ? props.draft : "";
			const unitName = record !== null ? record.unit : (typeof props.unit === "string" ? props.unit : "");
			const source = record !== null && record.source === "file" ? "file" : "builtin";
			const sourceLabel = loading === true
				? "读取中"
				: record === null
					? "未知"
					: (source === "file" ? "外部文件" : "内置默认");
			const pathText = record !== null && typeof record.path === "string" && record.path !== ""
				? record.path
				: record === null
					? (loading === true ? "正在定位人格文件…" : "未能读取人格文件。")
					: dir === ""
						? "未配置 personasDir，只能查看内置默认。"
						: "内置默认，尚未写入文件；保存后会写入 " + dir;
			const canEdit = record !== null && loading !== true && dir !== "";
			const children = [
				h("div", { key: "head", className: "magi-persona-head" },
					h("span", { className: "magi-persona-title" }, "人格文件"),
					h("span", { className: "magi-persona-unit" }, unitName === "" ? "----" : unitName),
					record !== null && typeof record.attribute === "string"
						? h("span", { className: "magi-persona-role" }, record.attribute)
						: null,
					h("span", { className: "magi-persona-src", "data-source": source }, sourceLabel),
					h("span", { className: "magi-persona-sub", title: pathText }, pathText)
				),
			];
			if (typeof props.error === "string" && props.error !== "") {
				children.push(h(StatusBanner, { key: "err", className: "magi-persona-error", role: "alert", text: props.error }));
			}
			if (typeof props.notice === "string" && props.notice !== "") {
				children.push(h(StatusBanner, { key: "notice", className: "magi-persona-notice", role: "status", text: props.notice }));
			}
			if (loading === true && record === null) {
				children.push(h("div", { key: "body", className: "magi-persona-body" },
					h("div", { className: "magi-persona-empty" }, "正在读取人格…")));
			} else if (editing === true) {
				children.push(h("div", { key: "body", className: "magi-persona-body" },
					h("textarea", {
						className: "magi-persona-edit",
						value: draft,
						spellCheck: false,
						autoFocus: true,
						"aria-label": unitName + " 人格文件",
						onChange: function (event) { props.onDraftChange(event.target.value); },
					})));
			} else {
				children.push(h("div", { key: "body", className: "magi-persona-body" },
					record === null
						? h("div", { className: "magi-persona-empty" }, "未找到该单元的人格文件")
						: h("pre", { className: "magi-persona-text" }, typeof record.prompt === "string" ? record.prompt : "")));
			}
			const hint = editing
				? "编辑中；保存后写入文件，下一次表决生效。"
				: dir === ""
					? "未配置 personasDir：只能查看内置默认，无法编辑保存。"
					: "人格文件每次表决现读；保存后下一次表决生效。";
			const buttons = [];
			if (editing) {
				buttons.push(h("button", {
					key: "discard",
					type: "button",
					className: "magi-persona-btn",
					disabled: saving,
					onClick: props.onCancelEdit,
				}, "不保存"));
				buttons.push(h("button", {
					key: "save",
					type: "button",
					className: "magi-persona-btn",
					"data-primary": "true",
					disabled: saving || draft.trim() === "",
					onClick: props.onSave,
				}, saving ? "保存中…" : "保存"));
			} else {
				buttons.push(h("button", {
					key: "close",
					type: "button",
					className: "magi-persona-btn",
					autoFocus: true,
					disabled: saving,
					onClick: props.onClose,
				}, "关闭"));
				buttons.push(h("button", {
					key: "edit",
					type: "button",
					className: "magi-persona-btn",
					"data-primary": "true",
					disabled: !canEdit || saving,
					title: canEdit ? "" : "未配置 personasDir，无法编辑",
					onClick: props.onEdit,
				}, "修改"));
			}
			children.push(h("div", { key: "foot", className: "magi-persona-foot" },
				h("div", { className: "magi-persona-hint" }, hint),
				buttons
			));
			return h("div", {
				className: "magi-persona",
				role: "dialog",
				"aria-modal": "true",
				"aria-label": (unitName === "" ? "MAGI" : unitName) + " 人格文件",
				"data-magi-persona": "open",
			}, children);
		}

		/** Live vote record driven by SSE; keeps partial text per unit. */
		function liveRecord(live, fallback) {
			if (live === null) return null;
			const opinions = [null, null, null];
			for (let index = 0; index < UNITS.length; index += 1) {
				const name = UNITS[index].unit;
				if (live.opinions[name] !== undefined && live.opinions[name] !== null) opinions[index] = normalizeOpinion(live.opinions[name], name);
			}
			const result = live.result !== null ? normalizeResult(live.result) : null;
			const finalOpinions = result !== null && result.opinions.length === 3 ? result.opinions : opinions;
			const tally = result !== null ? result.tally : tallyOf(finalOpinions.filter(Boolean));
			return {
				id: live.id !== "" ? live.id : result !== null ? result.id : fallback !== null ? fallback.id : "",
				createdAt: live.startedAt !== "" ? live.startedAt : result !== null ? result.createdAt : fallback !== null ? fallback.createdAt : "",
				criticality: result !== null ? result.criticality : live.criticality,
				criticalitySource: result !== null ? result.criticalitySource : live.criticalitySource,
				matchedKeywords: result !== null ? result.matchedKeywords : live.matchedKeywords,
				question: live.question !== "" ? live.question : result !== null ? result.question : "",
				states: live.states,
				texts: live.texts,
				opinions: finalOpinions,
				tally: tally,
				verdict: result !== null ? result.verdict : null,
				unanimity: result !== null ? result.unanimity : false,
				confidenceAvg: result !== null ? result.confidenceAvg : averageConfidence(finalOpinions.filter(Boolean)),
				elapsedMs: result !== null ? result.elapsedMs : live.elapsedMs,
				notes: result !== null ? result.notes : live.error !== "" ? ["// " + live.error] : [],
			};
		}

		function historyRecord(result) {
			if (result === null) return null;
			return {
				id: result.id,
				createdAt: result.createdAt,
				criticality: result.criticality,
				criticalitySource: result.criticalitySource,
				matchedKeywords: result.matchedKeywords,
				question: result.question,
				states: unitStateMap("output"),
				texts: {},
				opinions: result.opinions,
				tally: result.tally,
				verdict: result.verdict,
				unanimity: result.unanimity,
				confidenceAvg: result.confidenceAvg,
				elapsedMs: result.elapsedMs,
				notes: result.notes,
			};
		}

		const EMPTY_RECORD = {
			id: "",
			createdAt: "",
			criticality: "normal",
			criticalitySource: "default",
			matchedKeywords: [],
			question: "",
			states: unitStateMap("standby"),
			texts: {},
			opinions: [null, null, null],
			tally: emptyTally(),
			verdict: null,
			unanimity: false,
			confidenceAvg: 0,
			elapsedMs: 0,
			notes: [],
		};

		/* ------------------------------------------------------------------ *
		 * The main (root) panel                                                *
		 * ------------------------------------------------------------------ */
		function MagiPanel(props) {
			const options = props !== null && typeof props === "object" ? props : {};
			const ui = options.ui !== null && typeof options.ui === "object" ? options.ui : {};
			const crt = ui.crtEffects !== false;
			const reduced = useMemo(prefersReducedMotion, []);
			const [live, setLive] = useState(null);
			const [latest, setLatest] = useState(function () {
				// Optional seed (used by preview/host embedding); the ledger backfill below
				// is authoritative whenever it succeeds.
				return options.initialResult !== undefined ? normalizeResult(options.initialResult) : null;
			});
			const [error, setError] = useState("");
			const [flash, setFlash] = useState(0);
			const [mode, setMode] = usePanelMode();
			const [now, setNow] = useState(Date.now());
			// 端末模式的历史记录抽屉：摘要列表 + 最近一次完整记录（点条目时优先复用）
			const [historyOpen, setHistoryOpen] = useState(false);
			const [historyRows, setHistoryRows] = useState([]);
			const [historyItems, setHistoryItems] = useState([]);
			const [historyLoading, setHistoryLoading] = useState(false);
			const [historyBusy, setHistoryBusy] = useState(false);
			const [historyError, setHistoryError] = useState("");
			const [historyNotice, setHistoryNotice] = useState("");
			const [historyConfirm, setHistoryConfirm] = useState(false);
			const [historyTick, setHistoryTick] = useState(0);
			const [selectedHistoryKey, setSelectedHistoryKey] = useState("");
			const historyRequest = useRef(0);
			// 端末模式的人格文件弹层：三台盾形点击后查看 / 编辑对应 md
			const [personaOpen, setPersonaOpen] = useState(false);
			const [personaUnit, setPersonaUnit] = useState("");
			const [personaUnits, setPersonaUnits] = useState(null);
			const [personaDir, setPersonaDir] = useState("");
			const [personaLoading, setPersonaLoading] = useState(false);
			const [personaError, setPersonaError] = useState("");
			const [personaNotice, setPersonaNotice] = useState("");
			const [personaEditing, setPersonaEditing] = useState(false);
			const [personaDraft, setPersonaDraft] = useState("");
			const [personaSaving, setPersonaSaving] = useState(false);
			const personaRequest = useRef(0);
			const personaRecord = useMemo(function () {
				if (!Array.isArray(personaUnits)) return null;
				return personaUnits.find(function (entry) { return entry !== null && typeof entry === "object" && entry.unit === personaUnit; }) || null;
			}, [personaUnits, personaUnit]);

			const applyEvent = useCallback(function (event) {
				if (event === null || typeof event !== "object") return;
				const type = event.type;
				if (type === "vote") {
					setLive({
						id: typeof event.id === "string" || typeof event.id === "number" ? String(event.id) : "",
						question: asString(event.question),
						criticality: event.criticality === "critical" ? "critical" : "normal",
						criticalitySource: typeof event.criticalitySource === "string" ? event.criticalitySource : "default",
						matchedKeywords: asStringArray(event.matchedKeywords),
						startedAt: typeof event.startedAt === "string" ? event.startedAt : new Date().toISOString(),
						states: unitStateMap("standby"),
						texts: {},
						opinions: {},
						result: null,
						error: "",
						elapsedMs: 0,
					});
					setError("");
					return;
				}
				if (type === "unit") {
					setLive(function (prev) {
						if (prev === null) return prev;
						const states = Object.assign({}, prev.states);
						if (UNIT_STATES.indexOf(event.state) !== -1) states[event.unit] = event.state;
						return Object.assign({}, prev, { states: states });
					});
					return;
				}
				if (type === "unit-delta") {
					setLive(function (prev) {
						if (prev === null) return prev;
						const texts = Object.assign({}, prev.texts);
						const delta = typeof event.text === "string" ? event.text : "";
						texts[event.unit] = (texts[event.unit] !== undefined ? texts[event.unit] : "") + delta;
						const states = Object.assign({}, prev.states);
						if (states[event.unit] !== "error") states[event.unit] = "output";
						return Object.assign({}, prev, { texts: texts, states: states });
					});
					return;
				}
				if (type === "unit-reset") {
					setLive(function (prev) {
						if (prev === null) return prev;
						const texts = Object.assign({}, prev.texts);
						texts[event.unit] = "";
						return Object.assign({}, prev, { texts: texts });
					});
					return;
				}
				if (type === "unit-done") {
					setLive(function (prev) {
						if (prev === null) return prev;
						const opinions = Object.assign({}, prev.opinions);
						opinions[event.unit] = event.opinion;
						return Object.assign({}, prev, { opinions: opinions });
					});
					return;
				}
				if (type === "verdict") {
					const result = normalizeResult(event.result);
					setLive(function (prev) {
						if (prev === null) return prev;
						return Object.assign({}, prev, { result: event.result });
					});
					if (result !== null) setLatest(result);
					setFlash(function (value) { return value + 1; });
					// 账本刚追加了一条：抽屉开着时立刻刷新列表
					setHistoryTick(function (value) { return value + 1; });
					return;
				}
				if (type === "error") {
					const message = typeof event.message === "string" ? event.message : "unknown error";
					setError(message);
					setLive(function (prev) {
						if (prev === null) return prev;
						return Object.assign({}, prev, { error: message });
					});
				}
			}, []);

			// Initial backfill: the newest ledger entry, if any.
			useEffect(function () {
				let cancelled = false;
				const run = async function () {
					try {
						const payload = await requestJson("/magi/api/history?limit=1");
						const items = payload !== null && typeof payload === "object" && Array.isArray(payload.items) ? payload.items : [];
						if (!cancelled && items.length > 0) setLatest(normalizeResult(items[0]));
					} catch (cause) {
						if (!cancelled) setError("无法读取账本：" + describeError(cause));
					}
				};
				void run();
				return function () { cancelled = true; };
			}, []);

			// SSE: EventSource reconnects on its own, so no custom retry loop is needed.
			useEffect(function () {
				if (typeof window === "undefined" || typeof window.EventSource !== "function") {
					setError("此环境不支持 EventSource，SSE 已停用。");
					return undefined;
				}
				let source;
				try {
					source = new window.EventSource("/magi/api/events");
				} catch (cause) {
					setError("SSE 连接失败：" + String(cause));
					return undefined;
				}
				const onMessage = function (message) {
					const parsed = parseBlockText(message.data);
					if (parsed.ok && parsed.value !== null && typeof parsed.value === "object") applyEvent(parsed.value);
				};
				const onOpen = function () { setError(""); };
				const onError = function () { setError("SSE 连接中断，正在自动重连…"); };
				source.addEventListener("message", onMessage);
				source.addEventListener("open", onOpen);
				source.addEventListener("error", onError);
				return function () {
					source.removeEventListener("message", onMessage);
					source.removeEventListener("open", onOpen);
					source.removeEventListener("error", onError);
					source.close();
				};
			}, [applyEvent]);

			// Elapsed ticker while a vote is in flight.
			const running = live !== null && live.result === null && live.error === "";
			useEffect(function () {
				if (!running) return undefined;
				const handle = window.setInterval(function () { setNow(Date.now()); }, 500);
				return function () { window.clearInterval(handle); };
			}, [running]);

			const [busy, setBusy] = useState(false);
			const submit = useCallback(async function (request) {
				setBusy(true);
				setError("");
				try {
					const payload = await requestJson("/magi/api/vote", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							question: request.question,
							context: request.context,
							criticality: request.criticality,
						}),
					});
					if (payload !== null && typeof payload === "object" && (typeof payload.id === "string" || typeof payload.id === "number")) {
						const startedAt = typeof payload.startedAt === "string" ? payload.startedAt : new Date().toISOString();
						setLive(function (prev) {
							if (prev !== null && String(payload.id) === prev.id) return prev;
							return {
								id: String(payload.id),
								question: request.question,
								criticality: payload.criticality === "critical" ? "critical" : request.criticality === "critical" ? "critical" : "normal",
								criticalitySource: typeof payload.criticalitySource === "string" ? payload.criticalitySource : "explicit",
								matchedKeywords: [],
								startedAt: startedAt,
								states: unitStateMap("standby"),
								texts: {},
								opinions: {},
								result: null,
								error: "",
								elapsedMs: 0,
							};
						});
					}
				} catch (cause) {
					setError("表决请求失败：" + describeError(cause));
				} finally {
					setBusy(false);
				}
			}, []);

			/* ------------------------- 历史记录（HISTORY） ------------------------- */

			/** 读 /magi/api/history：摘要给列表，完整记录留给点选时直接复用。 */
			const loadHistory = useCallback(async function () {
				historyRequest.current += 1;
				const request = historyRequest.current;
				setHistoryLoading(true);
				setHistoryNotice("");
				try {
					const payload = await requestJson("/magi/api/history?limit=50");
					if (historyRequest.current !== request) return;
					const items = payload !== null && typeof payload === "object" && Array.isArray(payload.items)
						? payload.items.filter(function (item) { return item !== null && typeof item === "object"; })
						: [];
					let summary = payload !== null && typeof payload === "object" && Array.isArray(payload.summary)
						? payload.summary.filter(function (row) { return row !== null && typeof row === "object"; })
						: [];
					// 旧账本可能没有索引（或索引被删）：退回用完整记录压出同样形状的摘要
					if (summary.length === 0 && items.length > 0) {
						summary = items.map(function (item) {
							return {
								key: item.key,
								id: item.id,
								seq: item.seq,
								createdAt: item.createdAt,
								verdict: item.verdict,
								criticality: item.criticality,
								tally: item.tally,
								question: typeof item.question === "string" ? item.question.slice(0, 120) : "",
							};
						});
					}
					setHistoryItems(items);
					setHistoryRows(summary);
					setHistoryError("");
				} catch (cause) {
					if (historyRequest.current !== request) return;
					setHistoryError("无法读取历史：" + describeError(cause));
				} finally {
					if (historyRequest.current === request) setHistoryLoading(false);
				}
			}, []);

			const openHistory = useCallback(function () {
				setHistoryConfirm(false);
				setHistoryNotice("");
				setHistoryError("");
				setHistoryOpen(true);
			}, []);

			const closeHistory = useCallback(function () {
				setHistoryConfirm(false);
				setHistoryOpen(false);
			}, []);

			/** 点一条：优先用列表里已有的完整记录；没有就按 key 回查 /result。 */
			const pickHistory = useCallback(async function (row) {
				if (row === null || typeof row !== "object" || busy || running) return;
				const key = typeof row.key === "string" ? row.key : "";
				const id = typeof row.id === "string" ? row.id : "";
				let raw = historyItems.find(function (item) {
					if (item === null || typeof item !== "object") return false;
					if (key !== "" && item.key === key) return true;
					return id !== "" && String(item.id) === id;
				});
				setHistoryBusy(true);
				setHistoryError("");
				try {
					if (raw === undefined) {
						if (key === "") throw new Error("该条记录缺少 key，无法读取详情");
						raw = await requestJson("/magi/api/result?id=" + encodeURIComponent(key));
					}
					const record = normalizeResult(raw);
					if (record === null) throw new Error("记录格式无法解析");
					setSelectedHistoryKey(key !== "" ? key : id);
					setLive(null);
					setLatest(record);
					setHistoryOpen(false);
					setHistoryConfirm(false);
					setMode("detail");
				} catch (cause) {
					setHistoryError("无法读取该条历史：" + describeError(cause));
				} finally {
					setHistoryBusy(false);
				}
			}, [busy, historyItems, running, setMode]);

			/** 手动清空：第一次点击只把按钮切到确认态，5 秒内再点才真的删。 */
			const clearHistory = useCallback(async function () {
				if (busy || running || historyBusy) return;
				if (!historyConfirm) {
					setHistoryNotice("");
					setHistoryError("");
					setHistoryConfirm(true);
					return;
				}
				setHistoryConfirm(false);
				setHistoryBusy(true);
				setHistoryError("");
				try {
					const payload = await requestJson("/magi/api/history", { method: "DELETE" });
					const removed = payload !== null && typeof payload === "object" && typeof payload.removed === "number"
						? payload.removed
						: 0;
					historyRequest.current += 1; // 作废进行中的列表读取
					setHistoryLoading(false);
					setHistoryRows([]);
					setHistoryItems([]);
					setSelectedHistoryKey("");
					setHistoryNotice("已清空 " + removed + " 条历史；决策编号继续递增，不回收。");
					setLive(null);
					setLatest(null);
					setError("");
				} catch (cause) {
					setHistoryError("清空失败：" + describeError(cause));
				} finally {
					setHistoryBusy(false);
				}
			}, [busy, historyBusy, historyConfirm, running]);

			/* ------------------------- 人格文件弹层 ------------------------- */

			/**
			 * 打开某台单元的人格文件。首次点击才拉取 /magi/api/personas，
			 * 之后复用缓存；请求令牌保证「快速连点不同单元」时不会串台。
			 */
			const openPersona = useCallback(async function (unit) {
				if (typeof unit !== "string" || unit === "") return;
				setPersonaUnit(unit);
				setPersonaOpen(true);
				setPersonaEditing(false);
				setPersonaError("");
				setPersonaNotice("");
				setPersonaDraft("");
				if (Array.isArray(personaUnits)) {
					const found = personaUnits.find(function (entry) { return entry !== null && typeof entry === "object" && entry.unit === unit; });
					if (found !== undefined) setPersonaDraft(typeof found.prompt === "string" ? found.prompt : "");
					return;
				}
				personaRequest.current += 1;
				const request = personaRequest.current;
				setPersonaLoading(true);
				try {
					const payload = await requestJson("/magi/api/personas");
					if (personaRequest.current !== request) return;
					const units = payload !== null && typeof payload === "object" && Array.isArray(payload.units)
						? payload.units.filter(function (entry) { return entry !== null && typeof entry === "object"; })
						: [];
					setPersonaUnits(units);
					setPersonaDir(payload !== null && typeof payload === "object" && typeof payload.dir === "string" ? payload.dir : "");
					const found = units.find(function (entry) { return entry.unit === unit; });
					if (found === undefined) {
						setPersonaError("未找到 " + unit + " 的人格文件。");
					} else {
						setPersonaDraft(typeof found.prompt === "string" ? found.prompt : "");
					}
				} catch (cause) {
					if (personaRequest.current !== request) return;
					setPersonaError("无法读取人格文件：" + describeError(cause));
				} finally {
					if (personaRequest.current === request) setPersonaLoading(false);
				}
			}, [personaUnits]);

			const closePersona = useCallback(function () {
				if (personaSaving) return;
				personaRequest.current += 1;
				setPersonaLoading(false);
				setPersonaOpen(false);
				setPersonaEditing(false);
				setPersonaError("");
				setPersonaNotice("");
			}, [personaSaving]);

			const beginPersonaEdit = useCallback(function () {
				if (personaRecord === null || personaLoading === true || personaDir === "") return;
				setPersonaDraft(typeof personaRecord.prompt === "string" ? personaRecord.prompt : "");
				setPersonaEditing(true);
				setPersonaError("");
				setPersonaNotice("");
			}, [personaDir, personaLoading, personaRecord]);

			const cancelPersonaEdit = useCallback(function () {
				if (personaSaving) return;
				setPersonaDraft(personaRecord !== null && typeof personaRecord.prompt === "string" ? personaRecord.prompt : "");
				setPersonaEditing(false);
				setPersonaError("");
				setPersonaNotice("未保存，已恢复原文。");
			}, [personaRecord, personaSaving]);

			const savePersona = useCallback(async function () {
				if (personaSaving || personaRecord === null) return;
				if (personaDraft.trim() === "") {
					setPersonaError("人格内容不能为空。");
					return;
				}
				setPersonaSaving(true);
				setPersonaError("");
				setPersonaNotice("");
				try {
					const payload = await requestJson("/magi/api/persona", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ unit: personaUnit, text: personaDraft }),
					});
					const data = payload !== null && typeof payload === "object" ? payload : {};
					const prompt = typeof data.prompt === "string" ? data.prompt : personaDraft.trim();
					const savedUnit = typeof data.unit === "string" ? data.unit : personaUnit;
					setPersonaUnits(function (prev) {
						if (!Array.isArray(prev)) return prev;
						return prev.map(function (entry) {
							if (entry === null || typeof entry !== "object" || entry.unit !== savedUnit) return entry;
							return Object.assign({}, entry, {
								source: "file",
								path: data.path,
								sha256: data.sha256,
								chars: data.chars,
								prompt: prompt,
							});
						});
					});
					setPersonaDraft(prompt);
					setPersonaEditing(false);
					setPersonaNotice("已保存；下一次表决生效。");
				} catch (cause) {
					// 404 说明宿主半还是旧版本，没有 /magi/api/persona 路由；草稿仍在编辑框里。
					const message = cause !== null && typeof cause === "object" && cause.status === 404
						? "宿主半尚未重载：请完全退出并重开 DSH 后再保存（草稿仍在编辑框里）。"
						: describeError(cause);
					setPersonaError("保存失败：" + message);
				} finally {
					setPersonaSaving(false);
				}
			}, [personaDraft, personaRecord, personaSaving, personaUnit]);

			// 抽屉打开或账本新增一条时刷新列表
			useEffect(function () {
				if (!historyOpen) return undefined;
				void loadHistory();
				return undefined;
			}, [historyOpen, historyTick, loadHistory]);

			// 确认态 5 秒后自动复位，避免误触后隔很久才点第二下
			useEffect(function () {
				if (!historyConfirm) return undefined;
				const handle = window.setTimeout(function () { setHistoryConfirm(false); }, 5000);
				return function () { window.clearTimeout(handle); };
			}, [historyConfirm]);

			// Esc = 关闭抽屉
			useEffect(function () {
				if (!historyOpen || personaOpen) return undefined;
				const onKeyDown = function (event) {
					if (event.key === "Escape") {
						setHistoryConfirm(false);
						setHistoryOpen(false);
					}
				};
				window.addEventListener("keydown", onKeyDown);
				return function () { window.removeEventListener("keydown", onKeyDown); };
			}, [historyOpen, personaOpen]);

			// 人格弹层：查看态 Esc 关闭；编辑态不响应，避免误丢修改
			useEffect(function () {
				if (!personaOpen) return undefined;
				const onKeyDown = function (event) {
					if (event.key !== "Escape" || personaEditing === true || personaSaving === true) return;
					setPersonaOpen(false);
					setPersonaError("");
					setPersonaNotice("");
				};
				window.addEventListener("keydown", onKeyDown);
				return function () { window.removeEventListener("keydown", onKeyDown); };
			}, [personaOpen, personaEditing, personaSaving]);

			const LAYOUT_NOW = layoutFace();
			// 已经在 MAGI 面板里，所以这个按钮的作用是「回到会话」：selectPanel(null)
			const exitPanel = LAYOUT_NOW !== null
				? function () {
					try {
						LAYOUT_NOW.selectPanel(null);
					} catch (cause) {
						setError("无法返回会话视图：" + String(cause));
					}
				}
				: undefined;

			const record = useMemo(function () {
				const built = liveRecord(live, latest);
				if (built !== null) {
					if (built.elapsedMs === 0 && running) {
						const started = Date.parse(built.createdAt);
						built.elapsedMs = Number.isNaN(started) ? 0 : Math.max(0, now - started);
					}
					return built;
				}
				if (latest !== null) return historyRecord(latest);
				return EMPTY_RECORD;
			}, [live, latest, now, running]);

			const empty = record.id === "" && record.verdict === null && record.question === "";
			const terminal = mode === "terminal";
			// 思考闪烁的节拍：每次表决换一组随机周期与相位，三台因此各闪各的
			// 一个周期内有 4 次颜色切换；220–440ms 一个周期 ≈ 每秒 9–18 次切换。
			// 再快（<150ms）会糊成一片，看不出在闪，所以下限留在 220ms。
			const beat = useMemo(function () {
				const out = {};
				for (const name of UNIT_NAMES) {
					out[name] = {
						duration: 220 + Math.round(Math.random() * 220),
						delay: -Math.round(Math.random() * 440),
					};
				}
				return out;
			}, [record.id, record.createdAt]);
			const thinking = running === true || busy === true;

			/** 两种模式共用同一层外壳；端末模式只多一个 data-mode。 */
			const panelShell = function (children, terminalMode) {
				return h("div", {
					className: "magi-panel",
					role: "region",
					"aria-label": "MAGI",
					"data-mode": terminalMode === true ? "terminal" : undefined,
					"data-crt": crt === true ? "on" : "off",
					"data-reduced": reduced === true ? "true" : "false",
				}, children);
			};

			if (terminal) {
				// 端末模式：只有提訴／決議两块 + 三角盘面 + 单行输入，不输出理由
				const termChildren = [
					h(MagiTerminal, {
						key: "term",
						record: record,
						crt: crt,
						mode: mode,
						onMode: setMode,
						thinking: thinking,
						beat: beat,
						historyCount: historyRows.length,
						onHistory: openHistory,
						onUnitOpen: openPersona,
					}),
				];
				if (error !== "") termChildren.push(h("div", { key: "err", className: "magi-error", role: "alert" }, error));
				termChildren.push(h(MagiComposer, {
					key: "composer",
					compact: true,
					busy: busy || running,
					onSubmit: submit,
					onExitPanel: exitPanel,
				}));
				if (historyOpen) {
					termChildren.push(h(TermHistory, {
						key: "history",
						rows: historyRows,
						loading: historyLoading,
						busy: historyBusy,
						canClear: historyRows.length > 0 && !(busy || running || historyBusy),
						confirm: historyConfirm,
						error: historyError,
						notice: historyNotice,
						selectedKey: selectedHistoryKey,
						onPick: pickHistory,
						onClear: clearHistory,
						onClose: closeHistory,
					}));
				}
				if (personaOpen) {
					termChildren.push(h(PersonaDialog, {
						key: "persona",
						unit: personaUnit,
						record: personaRecord,
						dir: personaDir,
						loading: personaLoading,
						error: personaError,
						notice: personaNotice,
						editing: personaEditing,
						draft: personaDraft,
						saving: personaSaving,
						onClose: closePersona,
						onEdit: beginPersonaEdit,
						onCancelEdit: cancelPersonaEdit,
						onSave: savePersona,
						onDraftChange: setPersonaDraft,
					}));
				}
				return panelShell(termChildren, true);
			}

			const panelChildren = [
				h(MagiHeader, {
					key: "header",
					id: record.id,
					timestamp: formatTimestamp(record.createdAt),
					criticality: record.criticality,
					mode: mode,
					onMode: setMode,
				}),
				h(CriticalBar, {
					key: "critical",
					criticality: record.criticality,
					criticalitySource: record.criticalitySource,
					matchedKeywords: record.matchedKeywords,
				}),
			];
			if (record.question !== "") {
				panelChildren.push(h("div", { key: "q", className: "magi-question" }, record.question));
			}
			if (empty) {
				panelChildren.push(h("div", { key: "empty", className: "magi-empty" }, "SYSTEM STANDBY — 输入议题以召请三贤人"));
			} else {
				panelChildren.push(h(MagiBoard, { key: "board", record: record, reduced: reduced, flash: flash }));
			}
			if (error !== "") panelChildren.push(h("div", { key: "err", className: "magi-error", role: "alert" }, error));
			panelChildren.push(h(MagiComposer, {
				key: "composer",
				busy: busy || running,
				onSubmit: submit,
				onExitPanel: exitPanel,
				hint: "三台单元独立表决，通常事项多数决（critical 需三票一致）。Enter 执行 / Shift+Enter 换行。",
			}));

			return panelShell(panelChildren, false);
		}

		/* ------------------------------------------------------------------ *
		 * The tool-call card: compact board, or the raw text as a fallback     *
		 * ------------------------------------------------------------------ */
		function MagiVoteCard(props) {
			const options = props !== null && typeof props === "object" ? props : {};
			const block = options.block !== null && typeof options.block === "object" ? options.block : null;
			const raw = block !== null && typeof block.text === "string" ? block.text : "";
			const parsed = useMemo(function () { return parseBlockText(raw); }, [raw]);
			// 两种回落分支共用同一条标题栏，只有正文不同。
			const rawCard = function (body) {
				return h("div", { className: "magi-card", "data-magi-card": "raw" },
					h("div", { className: "magi-card-title" },
						h("span", null, "MAGI SYSTEM"),
						h("span", { className: "magi-spacer" }),
						h("span", { className: "magi-chip", "data-kind": "meta" }, "magi_vote")),
					body);
			};

			if (parsed.ok !== true) {
				return rawCard(raw === "" ? h("div", { className: "magi-muted" }, "（无输出）") : h("pre", { className: "magi-pre" }, raw));
			}

			const result = pickResult(parsed.value);
			if (result === null) {
				return rawCard(h("pre", { className: "magi-pre" }, JSON.stringify(parsed.value, null, 2)));
			}

			const record = historyRecord(result);
			const views = buildViews(record);
			const verdict = verdictLabel(result.verdict);
			return h("div", { className: "magi-card", "data-magi-card": "result", role: "group", "aria-label": "MAGI 表决結果" },
				h("div", { className: "magi-card-title" },
					h("span", null, "MAGI SYSTEM"),
					h("span", { className: "magi-decision" }, decisionLabel(result.id)),
					h("span", { className: "magi-spacer" }),
					result.criticality === "critical" ? h("span", { className: "magi-chip", "data-kind": "critical" }, "CRITICAL") : null,
					h("span", { className: "magi-verdict", "data-verdict": result.verdict }, verdict.zh, h("small", null, "/ " + verdict.en))
				),
				result.question !== "" ? h("div", { className: "magi-card-q" }, result.question) : null,
				h("div", { className: "magi-card-units" }, views.map(function (view) {
					return h("div", { key: view.unit, className: "magi-card-unit", "data-state": view.state },
						h("b", null, view.unit),
						h(Lamp, { state: view.state }),
						h(StanceBadge, { stance: view.stance }),
						h(ConfidenceBar, { value: view.confidence }),
						view.opinion !== null && view.opinion.tool_calls.length > 0
							? h("div", { className: "magi-conf" },
								h("span", null, "AUX"),
								h("span", null, view.opinion.tool_calls.map(function (call) {
									return toolBadge(call.tool) + (call.engine !== "" ? "/" + call.engine : "");
								}).join(" · ")))
							: null,
						h("div", { className: "magi-card-reason" }, view.text)
					);
				})),
				h(TallyBar, {
					tally: result.tally,
					stances: views.map(function (view) { return view.stance; }),
					verdict: result.verdict,
					unanimity: result.unanimity,
					confidenceAvg: result.confidenceAvg,
					elapsedMs: result.elapsedMs,
				}),
				result.notes.length > 0 ? h("ul", { className: "magi-notes" }, result.notes.map(function (note, index) { return h("li", { key: index }, note); })) : null,
				h("div", { className: "magi-card-foot" },
					h("span", null, "TS " + formatTimestamp(result.createdAt)),
					h("span", null, "SOURCE " + result.criticalitySource)
				)
			);
		}

		/* ------------------------------------------------------------------ *
		 * Entry point: DSH has NO built-in main-panel switcher (verified in   *
		 * dsh-client-ui-layout: panels are only retained and switched through *
		 * ctx.layout.selectPanel), so a panel must offer its own way in.       *
		 * This button lives in the conversation composer dock; the panel itself*
		 * offers the way back via selectPanel(null).                          *
		 * ------------------------------------------------------------------ */
		function MagiDockButton() {
			const layout = layoutFace();
			if (layout === null) return null;
			const open = function () {
				try {
					layout.selectPanel("magi");
				} catch (error) {
					// 主面板未注册（例如客户端半未加载）时静默失败，不要把会话搞崩
				}
			};
			return h("button", {
				type: "button",
				className: "magi-dock",
				title: "召请 MAGI 三贤人（主视图面板）",
				"aria-label": "召请 MAGI 三贤人",
				onClick: open,
			}, h("i", { className: "magi-dock-dot" }), "MAGI");
		}

		/* ------------------------------------------------------------------ *
		 * Sidebar entry: the sidebar's panel list is NOT derived from the      *
		 * `main` slot — it is built from the `sidebar.panellist` slot          *
		 * (list/root), where options.id is passed straight to selectPanel()   *
		 * and options.label is the visible title; the component draws only the *
		 * glyph. Three bars = MELCHIOR / BALTHASAR / CASPER.                   *
		 * ------------------------------------------------------------------ */
		function MagiSidebarGlyph(props) {
			const size = typeof props?.size === "number" ? props.size : 18;
			const active = props?.active === true;
			const bars = [
				{ x: 1, height: 9 },
				{ x: 6.75, height: 15 },
				{ x: 12.5, height: 6 },
			];
			return h("svg", {
				width: size,
				height: size,
				viewBox: "0 0 18 18",
				"aria-hidden": "true",
				focusable: "false",
				style: { display: "block", color: active ? "#39ff14" : "currentColor" },
			}, bars.map((bar, index) => h("rect", {
				key: index,
				x: bar.x,
				y: 15 - bar.height,
				width: 3.5,
				height: bar.height,
				fill: "currentColor",
			})).concat([
				h("rect", { key: "base", x: 1, y: 15.8, width: 15, height: 1.2, fill: "currentColor" }),
			]));
		}

		/* ------------------------------------------------------------------ *
		 * Registration                                                         *
		 * ------------------------------------------------------------------ */
		const inject = ["slots"];

		/** 逐个注册并互相隔离：任何一处注册失败都不该把其他注册一起回滚（cordis 会回滚 apply 的副作用）。 */
		function safeRegister(label, fn) {
			try {
				fn();
			} catch (error) {
				try {
					console.warn("[magi] 槽位注册失败（" + label + "）：", error);
				} catch (ignored) {
					// console 不可用时忽略
				}
			}
		}

		function apply(ctx) {
			HOST_CTX = ctx;
			layoutFace();

			// 1) 主视图面板
			safeRegister("main", () => ctx.slots.inject("main", () =>
				ctx.slots.register({ name: "main", key: "magi" }, MagiPanel)));

			// 2) 对话内的工具卡片
			safeRegister("tool.call.toolview", () => ctx.slots.inject("tool.call.toolview", function* () {
				yield ctx.slots.register({ name: "tool.call.toolview", key: "magi_vote" }, MagiVoteCard);
			}));

			// 3) 左侧栏的面板入口（这才是「打开面板」的正规入口）
			safeRegister("sidebar.panellist", () => ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register({
					name: "sidebar.panellist",
					id: "magi",
					order: 100,
					label: "MAGI 三贤人",
				}, MagiSidebarGlyph)));

			// 4) 会话输入区的快捷入口
			safeRegister("conversation.input.dock", () => ctx.slots.inject("conversation.input.dock", function* () {
				yield ctx.slots.register({ name: "conversation.input.dock", id: "magi", order: 20 }, MagiDockButton);
			}));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.MagiPanel = MagiPanel;
		exports.MagiVoteCard = MagiVoteCard;
		exports.MagiDockButton = MagiDockButton;
		exports.MagiSidebarGlyph = MagiSidebarGlyph;
		return module.exports;
	}
});
