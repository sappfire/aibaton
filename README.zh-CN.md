<div align="center">

# `aibaton`

**用一条命令,把上下文从一个 AI 编程会话交接到下一个。**

[![npm](https://img.shields.io/npm/v/aibaton.svg)](https://www.npmjs.com/package/aibaton)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](#环境要求)

[English](./README.md) · 中文

</div>

---

一个小巧的 CLI,专门解决这种时刻:AI 编程会话被打断 —— 笔记本合上、上下文窗口快满、换工具 —— 而下一次会话需要从你停下来的地方接着干。

`aibaton` 在一次会话结束时写一张结构化的交接卡(`.baton/<时间戳>.md`),在下一次会话开始时把它再打印出来。**支持按任务隔离**,所以两个并行会话不会互相覆盖状态。无云端、无后台进程、无 LLM 调用 —— 卡片内容由你已经在用的 AI 工具来写。

```sh
npx aibaton init      # 在仓库里初始化 .baton/
aibaton save          # 会话结束时存一张交接卡
aibaton resume        # 下一次会话开始时打印出来
```

兼容任何能读 markdown 的 AI 工具 —— Claude Code、Cursor、Codex、Aider、Cline、opencode、Continue 等。

---

## 什么时候有用

- 你刚结束一段两小时的 Cursor / Claude Code 会话,改到一半 —— 想让明天的会话不用再从头解释那 50 个 commit。
- 上下文窗口快被自动压缩了,你宁可自己钉住状态,也不愿被一个有损摘要决定丢掉哪些细节。
- 你经常**在同一个仓库里同时开两个 AI 会话做不同的事情** —— `--task billing-refactor` 让它们的状态不互相覆盖。
- 你在多台机器(笔记本 ↔ 台式机)、协作者、分支之间切换工作,希望"在飞中的思路"能跟着代码一起走。

## 什么时候不适合

装之前请诚实评估:

- **你每次只跑一个 AI 会话,且时间都很短。** 内置的 `/compact` 和工具自带的 memory 已经够用。
- **你想要全自动化。** `aibaton` 是显式设计 —— 由你(或你让 AI)主动决定什么时候写卡。如果你想要 hooks 自动保存,[`claude-mem`](https://github.com/thedotmack/claude-mem) 是更好的选择。
- **你不愿把 `.baton/` 提交到 git。** 这个工具的核心价值就是让交接随仓库流动。如果你的工作流不允许这点,这个工具不适合你。

## 安装

```sh
npm install -g aibaton
# 或者按需运行
npx aibaton <command>
```

需要 Node ≥ 18。

## 快速上手

```sh
# 1. 在任何仓库里执行一次:
aibaton init
cat .baton/AGENT.md >> CLAUDE.md      # 或者写到 .cursor/rules/、AGENTS.md 等

# 2. AI 编程会话结束时,对你的 AI 说:
#    "保存一份交接卡。按 .baton/HANDOVER_TEMPLATE.md 的格式写,
#     然后通过 `aibaton save --stdin` 提交。"

# 3. 下一次会话开始时:
aibaton resume                         # AI 读取它,从你停下的地方接着干
```

就这么简单。

### 并行任务

当你同一个仓库里同时开两个 AI 会话做不同的事时,给每个任务起个名字,它们就不会互相打架了:

```sh
# 会话 A
echo "<billing 交接>" | aibaton save --stdin --task billing-refactor

# 会话 B(另一个终端、不同的问题、同一个仓库)
echo "<api 交接>" | aibaton save --stdin --task api-rewrite

# 看看现在有哪些活跃任务
aibaton list --tasks
#   billing-refactor   2026-05-07 11:05
#     → 重构 BillingService 到 PricingV2
#   api-rewrite        2026-05-07 11:08
#     → 把 REST 层重写成 gRPC

# 恢复指定任务
aibaton resume --task billing-refactor

# 任务做完后归档,这样以后 resume 不会再拉到陈旧的状态:
aibaton done --task billing-refactor
```

如果你只做一个任务,完全可以忽略 `--task` —— 一切默认走 `default` 任务,行为和 v0.1 完全一致。

## 它是怎么工作的

`aibaton` 刻意保持极简,整个 CLI 只做五件事:

1. **`init`** —— 在仓库里写入 `.baton/`,放进 `HANDOVER_TEMPLATE.md`、`AGENT.md` 和一个简短的 `README.md`。
2. **`save [--task <name>]`** —— 写一个带时间戳的卡片(如 `.baton/2026-05-06-202705.md`)、更新对应任务的指针 `.baton/current/<task>.md`,并刷新 `.baton/CURRENT.md`(全局"任意任务的最近一次"的镜像,为向后兼容保留)。
3. **`resume [--task <name>]`** —— 把 `.baton/CURRENT.md`(或 `.baton/current/<task>.md`)打印到 stdout,加上一段简短前缀提示 AI 接力。如果有多个任务在活跃,会附加一行提示,避免你无声地拿到错的卡。
4. **`done [--task <name>]`** —— 把已完成任务归档到 `.baton/done/`。
5. **`list [--tasks]`** —— 列历史卡片或活跃任务。

没有 LLM 调用、没有守护进程、没有数据库、没有网络。**写卡的工作由你已经在用的 AI 工具完成** —— `aibaton` 只是给它们一套协议和一个落脚点。

## 交接卡格式

```markdown
# Handover · 2026-05-06 23:42

## Goal
重构 BillingService,使其使用 PricingV2 引擎

## Done ✅
- 把 BillingService 迁移到 PricingV2(commit a3f2b1)
- 增加分级计费的单元测试(commit 9c8e44)

## In Progress 🚧
- Webhook 处理器在产出新的事件结构(约 60%)

## Decisions
- PricingV2 构造函数采用函数式选项(否决了类继承的方案)
- V1 事件向后兼容 30 天

## Rejected
- 自定义重试层;改用 sidekiq 自带的

## Open Questions
- 是否要让 V1 webhooks 早于 30 天就下线?

## Next
1. 接通 webhook 签名校验
2. 针对 staging 环境的 stripe sandbox 加集成测试
```

八个章节,不多不少。喜欢手改也行 —— 它就是普通 markdown。

## `.baton/` 目录布局

```
.baton/
├── HANDOVER_TEMPLATE.md
├── AGENT.md                    # 给 AI 工具看的接入说明
├── README.md
├── CURRENT.md                  # 任意任务的最近一次卡片(向后兼容)
├── current/                    # 每个活跃任务一个指针
│   ├── default.md
│   └── billing-refactor.md
├── done/                       # 已归档(完成)任务
│   └── billing-refactor-2026-05-07-110530.md
└── 2026-05-07-110530.md        # 历史卡(append-only)
```

## 为什么不用 [现有方案]?

| | 它能做什么 | 缺什么 |
|---|---|---|
| `/compact`(内置) | 有损的自动摘要 | 会丢早期决策;不解决跨会话 |
| `/resume` `--continue` | 重新加载完整历史 | token 爆炸;更快撞上限 |
| `CLAUDE.md`(内置) | 项目级长期事实 | 不是会话级状态 |
| [`claude-mem`](https://github.com/thedotmack/claude-mem) | 自动 hooks、完整流水线 | 隐式;绑死 Claude Code hooks |
| 云端 SaaS(如 ContextPool) | 持久化的服务端记忆 | 要登录、要联网、要付费 |
| 自己撸 `MEMORY.md` + 斜杠命令 | 能用 | 每个人都在重复造轮子 |

`aibaton` 走的是另一条路:

- **显式,而非自动。** 由你决定什么时候交接。
- **结构化。** 每次都是同一套八字段。
- **跨工具。** 任何能读 markdown 的工具都能用。
- **按任务隔离。** `--task` 让并行会话不互相覆盖。
- **Git 原生。** `.baton/` 就在你的仓库里,可以跨机器、跨分支、跨同事。
- **零云端、零 API key、零 LLM 调用。** 写卡的工作交给你已有的 AI 工具,`aibaton` 只提供一个写的地方。

## 各工具的接入方式

### Claude Code

```sh
aibaton init --tool claude-code
cat .baton/AGENT.md >> CLAUDE.md
```

之后在任何会话里说一句 *"保存交接卡"*,Claude 就会生成卡片并执行 `aibaton save --stdin`。

### Cursor

```sh
aibaton init --tool cursor
```

这条命令会自动写出 `.cursor/rules/aibaton.mdc`(Cursor 会自动加载)。然后在 Cursor 里按 `Cmd+L` 切到 **Agent 模式**,会话结束时说一句 *"save handover"*,新会话开始时说一句 *"resume"* 即可。完整步骤(含 Auto-run 配置、多任务交接)见 [`docs/cursor-guide.md`](docs/cursor-guide.md)。

### Codex CLI / Aider / 通用

```sh
aibaton init --tool generic
cat .baton/AGENT.md >> AGENTS.md
```

## 命令一览

```sh
aibaton init [--force] [--tool <name>]
aibaton save [--task <name>] [--stdin] [--file <path>] [--note "<oneline>"] [--no-editor]
aibaton resume [--task <name>] [--list-tasks] [--copy] [--raw] [--index <n>] [--print-path]
aibaton done [--task <name>]
aibaton list [--tasks] [--json] [--limit <n>]
```

更多细节请看 `aibaton --help`。

## 常见问题

**这不就是一个我手写的 markdown 文件吗?**
是。`aibaton` 就是围绕这个文件的一层薄协议。CLI 的存在是为了:(a) 每张卡都用同一套字段,(b) 两个并行会话不会无声覆盖对方的状态(v0.2 的 `--task` 工作),(c) 你的 AI 工具有一个明确命名的命令可以调用,而不是每次重新发明 prompt。

**`claude-mem` 不是已经能做这件事了吗?**
如果你想要靠 hooks 完全自动化,`claude-mem` 很棒。`aibaton` 适合那些你**想自己掌握节奏**的场景:在一个有意义的边界上,主动写下一张干净、命名清晰的交接卡,而不是被动地记录每一次按键。每次会话产出一张卡,也比不断演化的自动存储更容易审阅和编辑。

**为什么不顺手做自动保存 / hooks?**
v0.3 也许会以**可选开启**的方式加上。当前的范围是有意保持小:markdown 协议 + 五条命令。

**我没用 Claude Code 也行吗?**
卡片就是普通的 markdown。任何能读 markdown 又能跑 shell 命令的 AI 工具都能写它、读它。各工具的接入说明只是帮你把规则文件放对位置。

**`.baton/` 要提交到仓库吗?**
要。这正是它的意义所在。让交接随代码一起跨机器、跨分支、跨同事流动。如果某一张卡涉及敏感内容(安全问题、个人笔记),单独 gitignore 那一张即可。

**这个卡片格式算标准吗?**
算半个吧。字段(Goal/Done/InProgress/Decisions/Rejected/OpenQ/Next)沿用了 [Claude Code #54254](https://github.com/anthropics/claude-code/issues/54254) 中的提案。希望它能成为一种社区惯例,让任何工具都能读懂另一个工具写的卡。

**我并行开了几个会话,但忘了加 `--task` 怎么办?**
`aibaton` 没法读心,但只要有多个任务在活跃,`resume` 一定会在末尾追加一行 "Note: N other tasks active" 提示,而且打包好的 AGENT.md 会要求你的 AI 在不确定时先 `aibaton list --tasks` 并问你一声。目标是:**绝不无声地加载错的交接卡**。

## 路线图

- **v0.1** —— `init`、`save`、`resume`、`list`。
- **v0.2**(当前) —— `--task` 任务隔离,`aibaton done` 归档,`resume` 附加多任务提示。
- **v0.3** —— 可选启用的 pre-commit / `SessionEnd` hooks;为 Claude Code 和 Cursor 提供更智能的 `resume` 注入。
- **v0.4** —— VS Code / Cursor 扩展:在 AI 聊天面板上加一个一键"保存交接"按钮。
- **v0.5** —— 通过 git 实现跨机器的 `.baton/` 同步(无云端)。

## 参与贡献

欢迎提 PR。整个 CLI 大约 600 行。非小改动请先开 issue 讨论。

```sh
git clone https://github.com/sappfire/aibaton
cd aibaton
npm install
npm run build
node dist/cli.js --help
bash test/smoke.sh
```

## 环境要求

- Node.js ≥ 18
- 任意能读取 markdown 的 AI 编程工具(Claude Code、Cursor、Codex、Aider、Cline 等)

## 许可证

MIT —— 详见 [LICENSE](LICENSE)。

---

<div align="center">

如果 `aibaton` 帮你少向 AI 重复解释一次"上次干到哪了",欢迎到 [GitHub](https://github.com/sappfire/aibaton) 给它一个 ⭐。

</div>
