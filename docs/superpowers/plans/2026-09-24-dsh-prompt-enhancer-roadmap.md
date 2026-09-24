# dsh-prompt-enhancer 实施计划总览（路线图）

> **面向 Agent 执行者：** 必需子技能：使用 superpower-subagent-driven-development（推荐）或 superpower-executing-plans 按任务逐项执行。每个计划独立执行，逐任务评审。

**目标：** 把 `dsh-prompt-enhancer`（聚焦提示词的 DSH 插件）的规格拆成 8 份可独立执行、可独立验证的实施计划。

**规格：** `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`（**已定稿，唯一权威**；本路线图与各计划均以其为准）

## 路径约定

**本文档与全部计划中的路径一律为「项目根相对路径」**，项目根即本仓库根目录（`dsh-prompt-enhancer/`）：

- 项目根写作 `.`；所有命令默认**以项目根为当前工作目录**，因此不再出现 `cd` 到绝对路径
- 仓库内路径用正斜杠，如 `src/host/store.ts`、`docs/superpowers/plans/`
- 仓库外但同工作区的路径用 `../` 相对表达，如 `../.npm-cache`
- 宿主侧路径（DSH 主目录、profile 目录）用**环境变量**表达，不写死盘符或用户目录：`$DSH_HOME`

## 为什么拆分

规格覆盖 8 个里程碑、约 5,500 行、跨 host/client 双入口与 6 个插槽座位，且依赖关系分层清晰（平台契约 → 存储 → API → UI）。单份计划会让执行者无法在一个上下文内推理，也无法在早期锁定最高风险假设。故按**可独立交付**的边界拆为 8 份。

## 计划清单

| 计划 | 文件 | 交付物（可运行可测试） | 依赖 | 对应里程碑 |
| --- | --- | --- | --- | --- |
| **P1** | `2026-09-24-p1-skeleton-and-build.md` | 一个**能被 dsh web 加载**的空插件：双产物构建 + 产物形状校验 + 安装到 profile | 无 | M1 |
| **P2** | `2026-09-24-p2-store.md` | 可测试的 SQLite 存储库：4 表 + 全部存储函数 + `node --test` 单测全绿 | P1 | M2 |
| **P3** | `2026-09-24-p3-host-api-and-ai.md` | 可用的 HTTP API：约 22 条路由 + AI 6 导出 + 技能写盘；curl 全部返回合法信封 | P2 | M3 |
| **P4** | `2026-09-24-p4-composer-and-reuse.md` | 复用闭环：词库按钮 + `#` 触发 + 插入/覆盖/插入并发送 + `{{变量}}` 模板 | P3 | M4 |
| **P5** | `2026-09-24-p5-ai-polish-and-rollback.md` | AI 优化按钮 + 一键完善 + 「原文 ↔ 优化稿」双向切换 | P4 | M5 |
| **P6** | `2026-09-24-p6-capture-and-manage.md` | 管理面板 + 沉淀三入口 + 标签 + 回收站 + 导入导出 | P5 | M6 |
| **P7** | `2026-09-24-p7-skill-export.md` | 技能导出 + 左侧入口 + 根级浮层 + 过期徽标 | P6 | M7 |
| **P8** | `2026-09-24-p8-recommend-settings-docs.md` | 上下文推荐 + 设置页 + i18n 键集收口 + README | P7 | M8 |

## 已知的跨计划衔接点（执行时勿遗漏）

| 衔接点 | 约定 |
| --- | --- |
| **i18n 基础设施** | 规格 §7.4 的 i18n 命名空间与首版字典在 **P4** 建立（P4 起就有 UI 文案），**P8 只做键集收口与校验**，不新建 |
| **设置项读写** | 设置的**存储**在 P2（settings.yaml 的 `prompt-enhancer` 命名空间）；**读取**从 P4 起按需使用；**设置页 UI** 在 P8 |
| **`usageCount` 统计** | `POST /prompts/:id/use` 在 P3 落地；P4 的插入/覆盖/发送与 P8 的推荐条都必须调用它 |
| **`shell.overlay` 弹窗宿主** | 在 **P7** 引入；P6 的管理面板在此之前先用组件内联渲染，P7 迁移到 root 浮层 |
| **`smoke.mjs` 的 fakeRequire** | P4 首次引入 `react/jsx-runtime` 后，smoke 的 `fakeRequire` 必须为 `react` 与 `@deepseek-ai/*` 返回桩模块，否则会在加载期抛错 |
| **acceptance 序号** | 规格 §9.3 的验收项 1–19 分别落在 P1(1,14) / P4(2,3,4) / P5(5,6,13) / P6(7,8,9,10) / P7(15,16,17,18) / P8(11,12,19) |

## 全局约定（所有计划共同遵守）

1. **规格优先**：计划与规格冲突时以规格为准，并回头修正计划。
2. **每份计划结束都要绿**：`npm run typecheck`、`npm test`（P2 起）、`npm run smoke` 全部通过。
3. **频繁提交**：每个任务结束提交一次，message 用 `<type>: <scope> <what>`。
4. **路径**：见上方「路径约定」——一律项目根相对路径 + 正斜杠；命令默认 CWD 为项目根；宿主侧路径用 `$DSH_HOME`。
5. **Shell**：本机为 Windows + PowerShell，命令用 PowerShell 惯用写法（正斜杠在 PowerShell 中同样有效）。
6. **不引入规格外的依赖**：尤其**不得**引入 `js-yaml`（D8 明确不需要）。
7. **不引入规格外能力**：无 systemPrompt section、无 WebSocket、无人格/技能反向导入/活同步。

## 环境事实（实测，所有计划适用）

| 项 | 值 |
| --- | --- |
| 项目根 | `.` —— 所有命令的默认当前工作目录 |
| Node / npm / pnpm | v24.19.0 / 12.0.2 / 11.7.0 |
| `DSH_HOME` | 由环境变量 `$DSH_HOME` 提供（未设置时 dsh 回退到 `~/.dsh`） |
| profile 目录 | `$DSH_HOME/profiles/web` |
| `dsh` CLI | **不在 PATH**；用 `node "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js"`（v0.1.5-rc.2） |
| **npm 缓存** | 默认缓存在用户目录（工作区外）→ 沙箱返回 **EPERM**。**必须**加 `--cache .npm-cache`（项目内相对路径）；已实测该写法可成功 install |
| **profile 不可写** | `$DSH_HOME/profiles/web` 对本会话沙箱**不可写** → `dsh plugin add` / 重启 `dsh web` 属**用户执行**步骤（或提权为 `danger-full-access` 的一次性重试） |
| `node:sqlite` | 可用（`DatabaseSync` / `StatementSync` / `backup`） |
| GUI | `http://127.0.0.1:3080`（改动需重启 `dsh web` 生效） |
