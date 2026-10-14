# dsh-plugin-magi — MAGI（三贤人）

把《新世纪福音战士》里的 **MAGI 决策系统**做成 DeepSeek Harness 插件：一件待决事项输入进去，
三台**独立且互不可见**的决策单元各自给出「同意 / 不同意」与理由 —— **必须选边，没有弃权、没有保留** —— 再按规则计票。

| 单元 | 人格属性 | 判断视角 |
| --- | --- | --- |
| `MELCHIOR-1` | 科学家 | 事实、数据、可验证性、技术可行性、风险概率 |
| `BALTHASAR-2` | 母亲 | 安全、保护、长期后果、伦理、不可逆损害 |
| `CASPER-3` | 女人 | 直觉、情感、欲望、自我实现、关系动力学 |

## 计票规则（两档）

| 档位 | 规则 | 结果 |
| --- | --- | --- |
| `normal`（默认） | 多数决 | 2 票赞成 → `承認(APPROVE)`；2 票反对 → `拒否(REJECT)`；3 票齐否决 → `否決(VETO)` |
| `critical`（敏感/重要） | **必须三票一致** | 3:0 全票赞成才 `承認`；**任一票反对即 `否決`（哪怕 2:1 多数赞成）** |

**判决只有三种**：`承認 / 拒否 / 否決`。单元只能投 `approve` 或 `reject`，所以 3 票必然是 2:1 或 3:0 ——
**不存在平票，也就没有「保留 / 交还人类」这种悬置结果**。单元调用失败时按保守默认记为**拒否**（并在结果里注明）；
三台全失败则整次表决直接报错，不会伪造一个判决。

**档位怎么定**：调用方显式传 `criticality` 优先；没传时按**敏感词表**自动升级（删除、不可逆、密钥、
隐私、资金、上传/外发、第三方、发布/上线、生产环境、医疗……），并在结果里写明命中了哪些词。
敏感事项不会被默认的多数决悄悄放过。

## 用法

### 作为工具（agent 调用）

```
magi_vote(question, context?, criticality?, label?)
magi_history(limit?, key?)
magi_personas(action?, force?)
```

`magi_vote` 返回完整结构：三份原始意见（含 stance / confidence / reason / key_factors / risks / caveats）、
计票、判决、耗时，以及**每台生效人格的来源与 sha256**。示例：

```
magi_vote(question="要不要删除生产库里的旧表", criticality="critical")
→ VETO（否決）  1:2
  MELCHIOR-1  reject「缺少可验证的数据支撑：没有量化收益、没有失败概率、也没有回滚方案」
  BALTHASAR-2 reject 「一旦出错，受损的一方没有能力拒绝，也拿不回选择权」
  CASPER-3    approve「我想要它，而且我看不出自己会后悔」
```

### 三台的人格可以随时改（不用重启）

人格提示词**默认内置**；把它导出成外部文件后，**每次表决现读**，改完下一次表决即生效：

```bash
magi_personas(action="export")     # 导出到 personasDir：melchior.md / balthasar.md / casper.md / contract.md
magi_personas(action="show")       # 看当前生效的是内置还是文件，以及哈希、字数
```

| 文件 | 内容 |
| --- | --- |
| `melchior.md` / `balthasar.md` / `casper.md` | 三台各自的人格档案：我是谁 / 我怎样判断 / 我的毛病 / 我会这样说 / 本单元字段写法 |
| `contract.md` | **公共输出契约**：JSON 结构、说话方式的硬要求（反 AI 腔）、判定规则 —— 改这里等于同时改三台的说话方式 |

| 行为 | 说明 |
| --- | --- |
| 优先级 | 文件存在且非空 → 用文件；否则用内置默认 |
| 文件不存在 | 视为「未自定义」，静默使用内置（不是错误） |
| 读取失败 / 内容为空 | 回退内置并**显式告警**（不会让某台机器变成空人格） |
| 生效时机 | 下一次表决；**不需要重启、不需要重载** |
| 可追溯 | 每票结果与账本都记 sha256（人格与契约各一份）；人格被改动时结果 `notes` 里写明哪台从哪个哈希变到哪个哈希 |
| 退回内置 | 删掉对应的 `.md` 文件即可 |

### 作为界面（Web GUI）—— 四个入口

| 入口 | 位置 | 说明 |
| --- | --- | --- |
| **侧栏面板行** ★ | 左侧栏「面板」列表里的 **MAGI 三贤人**（三竖条图标） | **主要入口**。点击切到主视图面板；侧栏收起时是图标 + 悬停提示 |
| 主视图面板 | 由上面那个入口进入 | **两种显示模式**（见下）：詳細＝三列单元逐字理由；端末＝三盾三角盘面，只给颜色与判决 |
| 对话内卡片 | 每次 `magi_vote` 调用后出现在对话流里 | 紧凑版盘面：三台结论徽标 + 票数 + 判决 + notes |
| 输入区按钮 | 会话输入框附近的黑绿「MAGI」小按钮 | 快捷切到面板（取不到 layout 服务时不渲染） |

> 面板是**主视图级**的：进入后对话区被占满，用面板里的「← 返回会话」回来。

### 两种显示模式：詳細 / 端末

面板上的 `詳細 | 端末` 开关随时切换（选择会被记住）。

| | 詳細（默认） | 端末 |
| --- | --- | --- |
| 盘面 | 三列单元竖栏 + 逐字打印理由 + key_factors/risks/caveats + 置信度 | **三盾三角盘面**：蓝＝承認、红＝拒否、琥珀＝待決，橙色连线汇到中心 MAGI |
| 输出 | 理由全文 | **不输出理由**，只有颜色与判决词 |
| 顶部 | `MAGI SYSTEM / DECISION PROTOCOL v1` + 编号 + 时间戳 | 左上「提訴」（CODE / FILE / EXTENTION / EX_MODE / PRIORITY）+ 右上「決議」判决框 |
| 输入 | 完整表单（议题 + 上下文 + 档位） | 单行输入条 |

端末模式的五行读数是**真实数据**：`CODE` = 决策编号、`EXTENTION` = 本次计票比、`EX_MODE` = 扫描线开关、
`PRIORITY` = `AAA`（critical，需三票一致）/ `AA`（normal）。

端末模式下按下「执行」后，三块盾形会在**浅绿 ↔ 黑**之间高频闪烁表示思考（三台的周期与相位各自随机，
所以是乱闪而非整齐呼吸），某一台出结果即定格成结果色（蓝＝承認 / 红＝拒否）。
詳細模式保持原样（`ANALYZING` 状态灯 + 橙色渐变），不加闪烁。
配色规范与几何细节见设计文档 `MAGI-界面实现规范.md` §5.1 / §5.2（本机开发工作区 `docs\`，不随仓库分发）。

### 文案与术语约定

界面文案**以中文为主**。只有下面这些刻意保留原作写法（它们是这套界面的辨识度来源）：

| 保留 | 含义 | 为什么保留 |
| --- | --- | --- |
| `承認` / `拒否` / `否決` | APPROVE / REJECT / VETO | 三贤人判决词，动画字幕的标志性写法 |
| `MAGI SYSTEM`、`DECISION PROTOCOL v1` | 标题条 | 原作终端标题 |
| `VOTE` / `CONF` / `ELAPSED` / `UNANIMOUS` / `CRITICAL` / `SOURCE` / `KEYWORDS` | 计票与状态读数 | CRT 终端风格 |
| `STANDBY` / `ANALYZING` / `OUTPUT` / `ERROR` | 单元状态灯 | 同上 |
| `MELCHIOR-1` / `BALTHASAR-2` / `CASPER-3`、`母亲` / `女人` | 单元名与属性 | 专有名词 |

其余一切都已中文化：按钮（`执行`）、返回（`← 返回会话`）、输入提示（`待决事项…`、`背景、约束、已知数据…`）、
状态提示（`表决中…`、`── 待决 ──`、`状态: …`）、空态（`输入议题以召请三贤人`）、
侧栏入口（`MAGI 三贤人`）、以及各种 aria-label 与 tooltip。

### HTTP / SSE 接口（面板与卡片用的就是这些）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/magi/api/vote` | 发起表决，立即返回 `202 {id, displayId, criticality, ...}`；结果走 SSE |
| `GET` | `/magi/api/events` | SSE 事件流：`vote` / `unit` / `unit-delta` / `unit-done` / `verdict` / `error` |
| `GET` | `/magi/api/history?limit=20` | 最近若干次表决（含完整意见）；无 `limit` 默认 20 |
| `GET` | `/magi/api/result?id=<key>` | 单次表决的完整记录 |
| `GET` | `/magi/api/config` | 当前生效配置（不含敏感词表） |
| `GET` | `/magi/api/debug` | **只读诊断**：loader 行状态、客户端模块图收录情况、解析缓存 —— 排查「界面不显示」时用 |

数据模型见设计文档 `MAGI-数据模型.md`（本机 `docs\`）。

## 配置

在 `cordis.patch.yml` 的插入行里改（**本插件不导出 `Config`**，所以配置是手工校验的：
类型不对或超范围会回落到默认值并在日志里给出 `[magi] 配置提示：…`）。

> ⚠️ **覆盖配置时要把整份 `config` 重写一遍。** 这是 Loader 补丁层的规则：
> 后应用的层按行胜出，而且 **patch 替换目标行的整个 `config` 值，不做按键深合并**
> （见 [打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish) 的「加载顺序」一节）。
> 所以你在 profile 的 `cordis.patch.yml` 里写 `id: magi` 覆盖时，只写要改的那一项会让其余项全部丢失、回落默认。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `provider` / `model` | `''` / `''` | 留空 = 沿用会话默认模型（推荐）。两者必须成对，只给一个会被忽略 |
| `timeoutMs` | `90000` | 单个单元的超时；超时按保守默认记为**拒否**，不影响整次表决 |
| `maxTokens` | `2000` | 每个单元的输出上限 |
| `passTemperature` | `false` | 是否把 `temperature`（0.2 / 0.5 / 0.9 差异化）传给运行时 —— 安装后确认支持再打开 |
| `useWeights` / `weights` | `false` / `1:1:1` | 加权计票（默认关闭，保持原设定的简单多数）。加权票数相等时按保守默认判**拒否**。权重键支持 `melchior` 短名或 `MELCHIOR-1` 单元名 |
| `criticalKeywords` | 内置敏感词表 | 命中即升级为 `critical` |
| `llmMode` | `live` | `stub` = 用桩模型离线自检（不调用任何模型） |
| `stubDelayMs` | `18` | 桩模型的逐字延迟，测试时可设 0 |
| `ledgerDir` | `.magi` | 账本目录（相对进程工作目录），内含 `ledger.jsonl` / `ledger.index.json` / `counter.json` |
| `personasDir` | `''` | 人格提示词的外部目录（`melchior.md` / `balthasar.md` / `casper.md`）；空 = 只用内置默认。改文件下一次表决生效 |
| `historyLimit` | `50` | 默认读取的历史条数 |
| `ui.crtEffects` / `ui.sound` / `ui.bootSequence` | `true` / `false` / `false` | 界面动效开关（音效与开机自检**已实现但默认关闭**；本轮不做设置卡片，只能改配置） |

## 快速开始（不用记命令）

> **本仓库 = 插件包本身**（仓库根就是 `package.json` 所在目录），所以下面都用**仓库内相对路径**。
> 开发时的一些便利脚本（`magi-preview.cmd` / `magi-check.cmd` / `magi-sync.cmd` / `magi-pack.cmd`）
> 与设计文档 `docs/` 放在**本机开发工作区**里，不随仓库分发；仓库内的等价命令就是 `node tools\…`。

DSH 桌面版**不会**把 `node` 放进 PATH，所以在自己的 cmd/PowerShell 里直接敲 `node ...`
会报「'node' 不是内部或外部命令」。用 DSH 自带运行时即可（示例，把 `<你>` 换成你的用户名）：

```bat
"C:\Users\<你>\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" ^
  tools\magi-dev-server.mjs --port 8790
```

| 仓库内命令 | 作用 |
| --- | --- |
| `node tools\magi-dev-server.mjs --port 8790` | 离线开发服务器（桩模型，**不联网**）+ 预览页；关掉进程即停服 |
| `node test\magi.test.mjs` / `test\api.test.mjs` / `test\personas.test.mjs` | 三套单测（41 + 9 + 8） |
| `node tools\sse-smoke.mjs --port 8790 --question "…"` | 协议冒烟：HTTP + SSE 帧序列 + 计票复核 + 账本一致性 |
| `node tools\make-snapshot.mjs` | 用样例账本重新生成静态快照 `preview\snapshot.html` |

实测：DSH 自带的是 **node 24.18.1**，无 npm（要发布时见下文「发布」）。

## 打包（官方 bundle 形态）

本插件本身就是官方意义上的 **bundle**：`package.json` 声明 `dsh.bundle.patch` 指向 `cordis.patch.yml`，
补丁用 Loader 方言插入插件行；客户端半在 `package.json` 的 `dsh.client` 里声明。
按官方规范打一个可安装的包：

```bash
node tools\pack-plugin.mjs        # 或双击 D:\MAGI\magi-pack.cmd
```

| 产物 | 用途 |
| --- | --- |
| `dist\dsh-plugin-magi\` | **可直接安装**的包目录（`install_bundle` 的 `target`） |
| `dist\dsh-plugin-magi-<版本>.tgz` | 归档 / 分发（输出含 sha256） |

打包前会按官方规范自检清单（对照内置技能 `cordis-plugin-development`）：

| 项 | 要求 |
| --- | --- |
| `type` | `"module"`（宿主半是 ESM） |
| `exports` | 必须有 `"."`（宿主入口）、`"./client"`（客户端入口）、`"./package.json"`、`"./locale/*.json"` |
| `dsh.bundle.patch` | 补丁文件路径；`- insert:` 段里的行要有 `id` 与 `name`（**官方安装下 `name` 用包名，而不是路径**） |
| `dsh.client` | `platform: "web"`；`immediately: true`（启动即加载，侧栏入口才一定在面板列表里）；`inject` 列出所用槽位所属的客户端包 |
| `icon` | 顶层字符串、相对清单目录、SVG/PNG/JPEG/WebP、≤256 KiB |
| `locale/<lang>.json` | `meta.title` / `meta.description` —— 插件管理页与设置页靠它显示，**不会激活插件** |
| `files` | 只含运行期文件（本插件排除 `test/`、`tools/`、`preview/` 与源码地图） |
| 依赖 | **不声明** `dependencies`：随 dsh 发行的包按官方约定由 dsh 安装目录解析 |

## 安装（官方方式）

> 官方指南明确要求：**不要手写 profile 的 `package.json` / `cordis.patch.yml`**，
> 也不要在 profile 目录里自己跑包管理器 —— 这些应由 `install_bundle` 完成。

1. 打包 → `D:\MAGI\dist\dsh-plugin-magi`
2. 在应用内调用插件管理工具（本会话未启用该工具行，需在启用它的会话里做）：

```jsonc
plugin_manager { "action": "install_bundle", "target": "D:\\MAGI\\dist\\dsh-plugin-magi" }
```

   它负责把包装进 profile、插入插件行、选择 bundle；返回的 `application` / `warnings` 才代表是否生效。
3. **CLI 备选**（必须先**完全退出**桌面应用）：

```bash
D:\DSH\resources\runtime\cli\bin\dsh.cmd plugin --profile desktop add "D:\MAGI\dist\dsh-plugin-magi"
```

   该命令本质是「profile 目录内的 pnpm」；另有 `allow-version` / `version-exemptions` 用于版本兼容豁免。

**卸载**：`plugin_manager remove_bundle`，或 `dsh plugin --profile desktop remove dsh-plugin-magi`；
账本 `~\.dsh\profiles\desktop\.magi\` 需手动删除。

### 本机当前状态

本机是**手工投放 + 绝对路径行**装的（当时裸包名在客户端模块图里解析失败，见本机 `docs\安装记录.md` §1.5）。
那是官方指南不建议的做法，但功能等价、已验证可用：想迁到官方方式时按上面重装一次即可，迁移前先备份 profile 补丁。

### 与官方教程《打包与安装插件》的逐条对照

教程：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish>

| 教程要求 | 本包 |
| --- | --- |
| bundle = 声明 `dsh.bundle.patch` 的 npm 包；patch 是 YAML 数组，行按**包名**引用插件 | ✅ 包内 `cordis.patch.yml` 用 `name: dsh-plugin-magi`（绝对路径只出现在 profile 那层的 patch 里） |
| `patch` 也接受**有序文件列表**，相对路径按文件自身解析 | ✅ 只用单文件，不需要 |
| 需与宿主共享实例的 dsh 包要**同时**进 `peerDependencies` 与 `devDependencies`；无状态工具包进 `dependencies` | ✅ 三个 dsh 包已同时声明（peer 供宿主解析、dev 供类型检查与独立测试）；第三方依赖：无 |
| 后应用的层按行胜出，且 **patch 替换整份 `config`，不做深合并** | ⚠️ 已把这条写进上面的「配置」提示 —— 用户覆盖时必须重述每一项 |
| 内置组合包从 dsh 安装目录解析，可以放心依赖 `@deepseek-ai/dsh-base` 存在 | ✅ 未声明任何内置 bundle 依赖 |
| git 安装只拉源码；TypeScript 包必须给 `prepare`，且用户要为构建脚本授权（`allowBuilds`） | ✅ **本包是纯 JS：无构建步骤、无 `prepare`/`postinstall` 等生命周期脚本** → git 安装不需要任何授权 |
| 不想让用户授权就分发构建产物：发布预构建的 npm 包，或交付 `pnpm pack` 的 tarball | ✅ `--publish` 产出的 `.npm.tgz` 就是 npm 格式（`package/` 前缀），等同 `pnpm pack` |
| 安装用 `dsh plugin --profile <名> add <规格>`；层序 = profile bundles → profile patch → home patch → `--patch` | ✅ 未新增或篡改任何层，插件只贡献一个 insert 行 |

## 发布

`install_bundle` 的 `target` 接受四种规格（来自宿主的 `parseInstallSpec`）：

| 规格形式 | 例子 | 前提 |
| --- | --- | --- |
| npm 包名 | `dsh-plugin-magi` / `@你/dsh-plugin-magi` | 已发布到 registry |
| git | `github:你/dsh-plugin-magi`（也支持 `gitlab:` / `git@` / 仓库 URL） | 有可访问的仓库 |
| tarball 直链 | `https://…/dsh-plugin-magi-0.1.0.tgz` | 任意 HTTP 托管（Release、静态站） |
| 绝对路径 | `D:\MAGI\dist\dsh-plugin-magi` | 本机目录 |

```bash
node tools\pack-plugin.mjs --publish      # 生成 npm 格式包 + 联网核对名字/版本占用
```

它会去掉 `private`、为 scoped 名补 `publishConfig.access`，产出 `dist\<名>-<版本>.npm.tgz`
（`package/` 前缀，可直接 `npm publish <该文件>`），并打印上面的四条安装规格。

### 发布前必须确认的三件事

1. **`peerDependencies` 就是兼容性闸门。** 宿主只在**声明了** `peerDependencies` 时才检查，
   且只检查 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 条目：把 **DSH 运行时版本**拿去和范围做 semver 比对
   （`includePrerelease: true`），任何一条不满足 → 安装被**直接拒绝**（`incompatible-version`），
   用户只能显式接受风险：`dsh plugin --profile <名> allow-version <包@版本> --dsh-version <精确版本> --accept-risk`。
   本包当前声明的是开发时对应的 `0.2.0-rc.2`；**DSH 升版后要同步放宽范围**，否则老用户装不上。
2. **`version` 不可覆盖。** npm 不允许重发同一版本，改动后先升版本号再打包（打包器会联网挡下这种情况）。
3. **名字与检索。** 生态惯例是 `dsh-plugin-*` 前缀 + `keywords` 里带 `dsh-plugin`
   （社区市场与检索工具按它发现插件）。打包器会自动核对 registry，名字被占会提示改用 scoped 名。

### 用 npm 发布（需要本机有 npm）

DSH 自带的 node 运行时**不含 npm**（`dependencies\node\bin` 下只有 node），所以三选一：

- 装一份官方 Node.js（含 npm）后：`npm login && npm publish "D:\MAGI\dist\dsh-plugin-magi-0.1.0.npm.tgz"`
- 交给有 npm 的机器/CI：把 `.npm.tgz` 拷过去执行同一条命令
- **GitHub Actions + npm Trusted Publishing（OIDC）** —— 社区插件的主流做法，
  免 token、免本机 npm：推 tag 触发 workflow 即可（生态里多数包都是这么发的）

发布之后，别人在插件管理页填 `dsh-plugin-magi` 就能装；**不发布也能分发**：
把仓库推上 GitHub 让人填 `github:你/dsh-plugin-magi`，或把 `dist\*.tgz` 挂到 Release 让人填直链。

## 离线验证（不需要安装）

在仓库根目录执行（`$NODE` 换成 DSH 自带运行时；在 PATH 里有 node 时直接写 `node` 即可）：

```bash
NODE=C:\Users\<你>\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe

# 1) 纯逻辑 + 端到端单测（41 项）：两档计票、加权、敏感词升级、配置归一化、
#    JSON 抽取、弃权折算、真实 chunk 形态、账本、总线、桩模型端到端、失败降级
& $NODE test\magi.test.mjs

# 2) 路由级单测（9 项）：history 默认值/夹紧、result 404、vote 405/跨站 403、非法 JSON
& $NODE test\api.test.mjs

# 3) 人格外部文件层单测（8 项）：优先级、缓存失效、空文件/读取失败回退+告警、导出不覆盖
& $NODE test\personas.test.mjs

# 4) 起离线开发服务器（桩模型，不联网、不调用模型）
& $NODE tools\magi-dev-server.mjs --port 8790

# 5) 协议冒烟：SSE 帧序列完整性、判决复核、账本一致性（normal / critical 各跑一次）
& $NODE tools\sse-smoke.mjs --port 8790 --question "要不要删除生产库里的旧表"
& $NODE tools\sse-smoke.mjs --port 8790 --question "这个变量名要不要改短一点"
```

（在**没有沙箱限制**的普通终端里也可以直接 `npm test`，即 `node --test test/`。）

### 三个预览页

> 预览页要用的 React（`preview\vendor\react-magi-umd.js`）**不随仓库分发**（它是从本机 DSH 的
> `app.asar` 里切出来的副本，MIT）。克隆仓库后先跑 `node tools\extract-host-react.cjs`
> 从本机 app.asar 现场生成，预览页即可离线使用。

| 页面 | 用途 |
| --- | --- |
| `preview/index.html` | **完全离线自播演示**：脚本化的事件序列驱动面板，不联网、不依赖服务器，双击即可看 |
| `preview/live.html` | **连线模式**：用真实的 `fetch`/`EventSource` 直连开发服务器，检定客户端与宿主半协议是否真对得上 |
| `preview/snapshot.html` | **静态快照**：把一次真实表决的结果内联进页面，确定性渲染，用于无头截图验收 |

生成静态快照（默认取 `preview/fixtures/ledger.sample.jsonl`，同页展示 critical 与 normal 各一次）：

```bash
& $NODE $PKG\tools\make-snapshot.mjs [--from <ledger.jsonl>]
```

预览页需要一份 React 18 UMD。已随包固化 `preview/vendor/react-magi-umd.js`
（用 `tools/extract-host-react.cjs` 从本机 DSH 前端产物里**原样切出**，与宿主 GUI 同源）；
若该文件缺失，也可用 `tools/fetch-preview-react.mjs` 从 npm registry 取官方 UMD 作回落。

### 本轮实测结果

| 项目 | 结果 |
| --- | --- |
| `node --check`（全部 `.js`/`.mjs`） | 13/13 通过 |
| 纯逻辑 / 端到端单测 | **40/40 通过** |
| 路由级单测 | **9/9 通过** |
| SSE/HTTP 协议冒烟 | normal 与 critical 两份**均通过** |
| 无头浏览器渲染（Edge headless） | 通过，界面验收图见本机 `docs\assets\magi-panel.png` |
| 真实 critical 案例 | 议题「要不要删除生产库里的旧表」命中敏感词 `删除, 生产库` → 升级 critical → 任一反对即 `否決(VETO)` |


## 装完之后：已验证 vs 仍未验证

### 已在真实环境验证通过（2026-10-11 实装）

| 项 | 结论 |
| --- | --- |
| `defineTool` 从包顶层 `import` | ✅ 可用（工具已出现在 agent 工具列表并可调用） |
| `ctx.llm.stream()` 的 `messages` 形态 | ✅ 官方 `createUserMessage` 经动态 `import` 取到并可用 |
| **chunk 形态** | ✅ 判别字段是 **`type`**（`text-delta` / `reasoning-delta` / `block-end` / `usage` / `finish`），`finish.reason` 是对象 `{ kind }` |
| **provider/model 解析** | ✅ `agentDefaultModel` 必须写进 `inject`（未注入时访问**会抛错**，不是 undefined）；另有 `ctx.get` 兜底 |
| `sessionId` 是否必填 | ✅ **非必填**（HTTP 路径不传也能正常表决） |
| `/magi/api/*` 是否需要鉴权头 | ✅ **不需要**（精确路由可直接访问） |
| 客户端 `require("react")` | ✅ 无需在 `dsh.client.inject` 里声明 |
| 宿主半改动能否免重启 | ❌ **不能**（ESM 模块缓存）—— 改 `index.js` / `lib/*.js`（除 client）必须重启 |
| 客户端产物改动 | ✅ 文件轮询热重载（约 0.5 秒），**不需要重启也不需要刷新** |
| 客户端模块图如何收录本包 | ✅ **行名必须用绝对路径**（裸包名解析失败会被缓存成 `null` 并永久跳过） |
| 面板入口 | ✅ 必须额外注册 `sidebar.panellist`（`main` 槽只决定渲染谁，不含入口） |

### 仍未验证

| 项 | 说明 |
| --- | --- |
| `passTemperature` | 运行时是否接受额外 `temperature` 字段未测；默认**关闭**，三台仍靠提示词区分 |
| 加权模式 | `useWeights` 在真实模型下的表现未测（默认关闭） |
| 浅色主题 / 极窄侧栏 | 只在深色 + 常规宽度下目视确认过 |

> 安装踩过的两个真坑（裸包名解析、侧栏入口槽）记录在本机 `docs\安装记录.md`。

## 设计文档

下面这些**不在仓库里**（它们是本机开发工作区 `D:\MAGI\docs\` 的内容），列出仅为说明设计依据：

- `README.md` —— 文档索引
- `MAGI-设计核心.md` —— 决策协议、人格映射、UI 还原规范、合规边界
- `MAGI-人格提示词.md` —— 三段完整人格提示词、内在张力设计与反同质化措施
- `MAGI-数据模型.md` —— 表决/意见/判决结构、账本、配置、降级策略
- `MAGI-界面实现规范.md` —— 客户端契约、四个槽位、样式令牌、两种显示模式、时序与闪烁规范
- `MAGI-实施计划.md` —— 已确证的 DSH 契约、阶段状态、安装与回滚、验证记录
- `安装记录.md` —— 实装过程、踩过的两个真坑（裸包名解析 / 侧栏入口槽）、诊断手段

## 合规

MAGI / NERV / 三贤人 的名称与人设属**致敬性引用**；本插件不含任何官方图像、字体、音频或模型素材，
界面全部用 CSS/SVG 自绘（含音效也是 Web Audio 现场合成）。

## 许可

MIT
