# AGENTS.md — dsh-prompt-enhancer

本文件只补充本项目特有的约束。全局 `~/.dsh/AGENTS.md` 全部适用，本文件不得削弱其任何规则。

## 权威来源

- `docs/architecture.md` 是**设计意图与架构事实的活文档**（运行时结构、数据不变量、接口面、决策台账、已知取舍）。与本文件冲突时以本文件为准（本文件是硬规则），否则以它为准。
- 其余 `docs/` 子目录是历史资料，**不是施工依据**：`superpowers/specs/`（定稿规格与 §13 自检收敛记录，已冻结）· `superpowers/plans/`（P1–P8 计划与活体验收记录）· `analysis-dsh-prompt-library/`（上游 v0.16.0 参考分析）· `proposals/`（待定，已挂起）。目录角色见 `docs/README.md`。
- 新增设计决策写进 `docs/architecture.md` 的 §6 台账；大段历史不进活文档。

## 硬约束

1. **客户端模块 id 必须等于包名**：从 `package.json.name` 派生，禁止在 `scripts/build.mjs` 或源码中硬编码。
2. **systemPrompt section 数恒为 0**：本插件不注册任何 section。这是产品承诺，不是遗漏，不得「顺手补上」。
3. **只用官方插槽**：禁止 MutationObserver、DOM 注入等 hack（`docs/architecture.md` §2）。
4. **`react` / `react/jsx-runtime` / `@deepseek-ai/*` 一律 external**，由宿主在运行时解析，禁止打包。
5. **不引入规格外依赖与能力**：尤其不得引入 `js-yaml`；不得引入 WebSocket、人格/SOUL、技能反向导入、活同步引擎。
6. **上游 MIT 署名不可删**：`LICENSE` 的 `master1Sun` 行与 README 的来源声明必须保留。
7. **`lib/` 纳入版本控制**（与上游一致，使仓库可直接安装）；`*.map` 与 `.build-meta.json` 忽略。
8. **npm 缓存必须留在工作区内**：`npm install --cache .npm-cache`。缓存落在用户目录会被沙箱拒绝（EPERM），不得为此提权。
9. **`$DSH_HOME/profiles/**` 对本会话沙箱不可写**：安装插件、重启 `dsh web` 属用户执行步骤，不得绕过。
10. **`src/**` 必须是「可擦除 TS」**：不得使用 `enum` / `namespace` / 参数属性等需要代码生成的语法（tsconfig 的 `erasableSyntaxOnly` 会在编译期拦住）。原因：测试直接 `import` `.ts` 源码运行。
11. **`src/` 内部相对导入必须写显式 `.ts` 后缀**（如 `from "./paths.ts"`）：Node 直跑 TS 不做 `.js`→`.ts` 重映射；esbuild 与 tsc（`allowImportingTsExtensions`）都接受。
12. **`src/host/store.ts` 不得 import 宿主能力**（cordis / 任何服务）：存储层必须能脱离 `dsh` 单测，宿主能力一律留在别的模块。
13. **存储层的测试隔离靠环境变量，不得加 test-only API**：测试在自己的进程里把 `DSH_HOME` 指向临时目录；`paths.ts` 全部为调用期求值。
14. **db 结构变更必须走 `MIGRATIONS` + 升 `SCHEMA_VERSION`**：迁移要幂等（先探测再 `ALTER`，不要「执行失败就吞掉」）。
15. **可测判定不进 `.tsx`**：本仓库无 react-dom / jsdom（硬约束 5 禁装），`node --test` 读不了组件文件 ⇒ 判定 / 映射 / 归一化一律下沉到零依赖纯模块，组件只做接线；没有自动化断言的接线行为归活体验收（`docs/architecture.md` §4.3、§7）。

## 命令与完成标准

```sh
npm run typecheck   # tsc --noEmit
npm test            # node --test（43 个用例文件、448 条用例，覆盖 host 与 client 纯模块）
npm run build       # lib/index.js + lib/client.js
npm run smoke       # 真实执行 client bundle，校验注册 id 与导出形状
```

- 每个任务结束时四项必须全绿；新增的负样本必须先用变异验证「它真的能抓到对应缺陷」（临时改坏实现 → 用例必须失败 → 复原）。
- 提交粒度：一个任务一次提交，message 用 `<type>: <scope> <what>`。

## 测试

测试框架为 Node 内置 `node --test`（无第三方 runner），用例放 `tests/*.test.mjs`。测试直接 `import` `src/**/*.ts` 源码运行（Node 24 类型擦除），因此硬约束 10/11 必须遵守。

## 本机环境

计划文档写于 Windows + PowerShell 环境，本机为 **macOS**：命令等价改用 bash；`scripts/link-dsh-deps.mjs` 的 `symlink(..., "junction")` 在 macOS 上退化为普通目录符号链接，属预期行为。

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`cireric/dsh-prompt-enhancer`, via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles use their default strings (`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`); 分类沿用 GitHub 默认 `bug` / `enhancement`，缺失的状态标签按用即建。See `docs/agents/triage-labels.md`.

### Domain docs

single-context: root `GLOSSARY.md` + `docs/adr/`, created lazily. See `docs/agents/domain.md`.

**现状（2026-10-03）**：两者都还不存在。**不要预先创建它们**——域词汇与 ADR 只在术语/决策真正被解决时才补，架构事实与决策台账的当前落点是 `docs/architecture.md`（§6 台账、§9 术语表）。
