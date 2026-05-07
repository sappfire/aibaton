# 在 Cursor 中使用 aibaton

> 完整流程：从安装到日常使用，5 分钟跑通。

Cursor 和 Claude Code 在协议层是一样的，但接入方式有 3 个差异：

1. **Rules 用 `.cursor/rules/*.mdc`**（不是 `CLAUDE.md`）
2. **AI 必须在 Agent 模式下才能跑终端命令**（Chat 模式只回答不执行）
3. **跑 shell 默认会问"Run / Skip"**，要免点击得开 Auto-run

下面按"一次性配置 → 日常使用 → 进阶"三段走。

---

## Step 0 · 安装 aibaton

```sh
npm install -g aibaton
# 或在仓库内不装全局：用 npx aibaton <cmd> 也行
```

确认：

```sh
aibaton --version
# 0.1.0
```

---

## Step 1 · 在仓库里一次性初始化（30 秒）

进入你正在用 Cursor 开发的项目根目录：

```sh
cd ~/your-project
aibaton init --tool cursor
```

这一条命令会做 3 件事：

1. 在仓库根建 `.baton/` 目录，写入 `HANDOVER_TEMPLATE.md` / `AGENT.md` / `README.md`
2. 在仓库根建 `.cursor/rules/aibaton.mdc` —— 这是 Cursor 的 rule 文件，让 Cursor agent 自动学会 aibaton 协议
3. 打印下一步建议

之后 commit 这两个目录到 git，团队里其他人 pull 下来就直接能用。

```sh
git add .baton .cursor && git commit -m "chore: enable aibaton handovers"
```

> **关于 `.cursor/rules/aibaton.mdc`**：里面用 `alwaysApply: true` 让这条规则对每次会话都生效。你可以把 `alwaysApply` 改成 `false` 加上 `globs: [".baton/**"]`，那样只在 AI 触碰 `.baton/` 文件时才加载。看你偏好。

---

## Step 2 · 切到 Cursor 的 Agent 模式

打开 Cursor，按 `Cmd+L` 唤出右侧面板，把模式切到 **Agent**（不是 Ask、不是 Edit）。

Agent 模式三个特征：
- 可以读写多个文件
- 可以在内置终端执行 shell 命令
- 默认每条命令都会弹一个 "Run / Skip" 让你确认

> 如果你只见到 "Chat" 一个选项，说明你的 Cursor 版本太老。升级到 0.42+ 即可。

### 推荐打开 Auto-run（可选但很爽）

`Settings → Cursor Settings → Beta → Auto-run mode (formerly YOLO mode) → Enable`

打开后 Cursor agent 跑 `aibaton save --stdin` 不会再弹确认。**仅在你信任 agent + 仓库里没有破坏性脚本时再开**。如果不开，每次 save 多点一下 "Run" 即可。

---

## Step 3 · 日常使用：每天就两个动作

### 3.1 会话结束时 — Save Handover

在 Agent 面板里直接说一句中文/英文都行：

> **"save handover"** 或 **"把这次会话存一张交接卡"**

Cursor agent 会按 `.cursor/rules/aibaton.mdc` 的指令做这些事（你不用记）：

1. 读取最近改过的文件 + `git log --oneline -10`
2. 生成一份结构化 markdown（Goal / Done / In Progress / Decisions / Rejected / Open Q / Next）
3. 在内置终端跑：

   ```sh
   aibaton save --stdin <<'EOF'
   # Handover · 2026-05-07 18:30
   ## Goal
   ...
   EOF
   ```

4. 终端打印：

   ```
   ✓ saved handover → .baton/2026-05-07-183024.md
   ```

   同时 `.baton/CURRENT.md` 自动指向这张最新卡。

如果 Auto-run 没开，你看到 "Run / Skip" 弹窗时点 **Run** 即可。

### 3.2 新会话开始时 — Resume

新开一个 Agent 会话（Cmd+L → 新建 chat）。**第一句直接说**：

> **"resume"** 或 **"接上次的会话继续"**

因为 `.cursor/rules/aibaton.mdc` 里有"At session start"指令，agent 会先读 `.baton/CURRENT.md` 然后给一句确认：

> *"Resuming from BillingService → PricingV2 refactor. Last left off at: webhook signature verification."*

接着你说"continue"或者直接给新指令，它就从 Next 那一节继续。

### 3.3 万一 agent 没主动读 — 给它一个 nudge

如果你新建会话后 agent 没有自己读 CURRENT.md（少数情况），你直接说一句：

> "Read `.baton/CURRENT.md` first, then continue."

或者：

> "Run `aibaton resume` and pick up from there."

它就会乖乖跑了。

---

## Step 4 · 三种触发模式按场景选

| 场景 | 你说的话 | aibaton 命令 |
|------|----------|--------------|
| 会话很完整、想存一张工整的卡 | "save handover" | `aibaton save --stdin` |
| 临时只想留一句备忘（不想等 agent 拼卡） | "save a quick note: <一句话>" | `aibaton save --note "<...>"` |
| 自己手写卡，纯靠模板 | 终端跑 `aibaton save`（无参数） | 用 `$EDITOR` 打开模板让你编辑 |
| 新会话第一件事 | "resume" | `aibaton resume`（agent 自动读 CURRENT.md） |
| 想看历史 | "show me past handovers" | `aibaton list` |
| 想要次新的卡 | "load the second-most-recent handover" | `aibaton resume --index 1` |

---

## Step 5 · 进阶：3 个有用的小技巧

### 5.1 把卡贴进 Cursor Chat 模式（无 agent 也能用）

如果你某次只用 Chat 模式（速度快、不消耗 agent token），自己手动跑：

```sh
aibaton resume --copy   # 内容复制到剪贴板
```

然后到 Cursor Chat 第一条粘贴。剪贴板里已经带了 "Resuming from previous session..." 引导段，AI 会立刻识别。

### 5.2 多机器协作

把 `.baton/` commit 进 git。在公司机器 save，在家里 git pull 后开 Cursor，agent 直接接得上。**这是 ContextPool 类 SaaS 永远做不到的体验**。

### 5.3 团队结对

A 同学下班前 `save handover` 写一张卡，commit 推上去。B 同学接班 pull 后开 Cursor，第一句 "resume"，立刻知道 A 走到哪、决定了什么、什么没解决 —— **AI 帮你做了班次交接**。

---

## 常见问题

**Q：我按了 "Run" 但终端报 `aibaton: command not found`。**
A：`npm install -g aibaton` 没生效或 PATH 没刷。试 `npx aibaton save --stdin` 替代，或重启 Cursor。

**Q：Cursor agent 给我说 "I cannot run shell commands"。**
A：你在 Chat 模式或 Edit 模式下。切到 Agent 模式（Cmd+L → 顶栏选 Agent）。

**Q：每次 save 都要点 "Run"，能不能跳过？**
A：Settings → Beta → Auto-run mode 开启即可。

**Q：`.cursor/rules/aibaton.mdc` 里的 `alwaysApply: true` 会不会把上下文撑爆？**
A：rule 本身只占 ~50 行 / ~1.5K token，可以忽略。如果非常在意，把它改成：

```yaml
---
description: aibaton handover protocol — used at session start/end
globs:
  - ".baton/**"
alwaysApply: false
---
```

那样只在 AI 涉及 `.baton/` 文件时才加载。代价是它不会主动在新会话第一句去读 CURRENT.md，得你 nudge 一句。

**Q：Cursor 的 "Memories" 功能不是已经做了类似的事吗？**
A：Cursor Memories 是工具内置的、不透明的、跨项目的小笔记。aibaton 是显式的、结构化的、跟代码一起 commit 的、跨工具的。两者可以共存：Memories 记"我喜欢哪种 import 风格"，aibaton 记"上一次会话做到哪"。

**Q：能跟 claude-mem 一起用吗？**
A：可以。`claude-mem` 是 lifecycle hooks 自动捕获，`aibaton` 是显式手动接力。两者写不同 文件夹，互不冲突。常见组合：日常用 `claude-mem` 全自动，遇到关键里程碑（功能完成、PR 提交）用 `aibaton save` 留一张工整的"高保真卡"。

---

## 一图流程图

```
┌──────────────────────────────────────────────────────────┐
│                 Cursor 项目根目录                        │
│                                                          │
│  .baton/                  ← aibaton 管理                 │
│   ├── CURRENT.md         ← 最新 handover                 │
│   ├── 2026-05-07-...md   ← 历史卡                        │
│   ├── HANDOVER_TEMPLATE.md                               │
│   └── AGENT.md           ← 协议说明                      │
│                                                          │
│  .cursor/                                                │
│   └── rules/                                             │
│       └── aibaton.mdc    ← Cursor agent 自动加载         │
│                                                          │
└──────────────────────────────────────────────────────────┘

      session N (今天下午)
   ┌──────────────────┐
   │ Cursor Agent     │
   │ "save handover"  │──► aibaton save --stdin
   └──────────────────┘                │
                                       ▼
                              .baton/CURRENT.md
                                       │
                                       ▼
   ┌──────────────────┐    auto-read on start
   │ Cursor Agent     │◄──────────────┘
   │ session N+1      │
   │ (明天早上)       │
   └──────────────────┘
```

---

需要更多细节看仓库根的 [`README.md`](../README.md)，或本地查看：

```sh
aibaton --help
cat .baton/AGENT.md           # 协议全文
cat .cursor/rules/aibaton.mdc # Cursor 专属 rule
```
