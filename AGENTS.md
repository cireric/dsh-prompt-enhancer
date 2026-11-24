# AGENTS.md — dsh-prompt-enhancer

本文件只补充本项目特有的约束。全局 `~/.dsh/AGENTS.md` 全部适用，本文件不得削弱其任何规则。

## 权威来源

- **设计与接口**：改动前查 [架构文档](docs/architecture.md)；新增设计决策写入其 §6。硬约束以本文件为准，实现现状以代码为准。
- **历史与提案**：`docs/proposals/` 和已归档的早期规格只用于追溯，不是施工依据。

## 硬约束

1. **客户端模块 id 必须等于包名**：从 `package.json.name` 派生，禁止在 `scripts/build.mjs` 或源码中硬编码。
2. **systemPrompt section 数恒为 0**：本插件不注册任何 section。这是产品承诺，不是遗漏，不得「顺手补上」。
3. **只用官方插槽**：禁止 MutationObserver、DOM 注入等 hack（`docs/architecture.md` §2）。
4. **`react` / `react/jsx-runtime` / `@deepseek-ai/*` 一律 external**，由宿主在运行时解析，禁止打包。
5. **不引入规格外依赖与能力**：尤其不得引入 `js-yaml`；不得引入 WebSocket、人格/SOUL、技能反向导入、活同步引擎。
6. **上游 MIT 署名不可删**：`LICENSE` 的 `master1Sun` 行与 README 的来源声明必须保留。
7. **`lib/` 纳入版本控制**（与上游一致，使仓库可直接安装）；`*.map` 与 `.build-meta.json` 忽略。
8. **npm 缓存必须留在工作区内**：`npm install --cache .npm-cache`。缓存落在用户目录会被沙箱拒绝（EPERM），不得为此提权。
9. **`$DSH_HOME/profiles/` 对本会话沙箱不可写**：安装插件、重启 `dsh web` 由用户执行，不得绕过。
10. **`src/` 必须是可擦除 TS**：测试直接导入 `.ts`。不得使用 `enum` / `namespace` / 参数属性等需要代码生成的语法（`erasableSyntaxOnly` 校验）。
11. **`src/` 内部相对导入必须写显式 `.ts` 后缀**（如 `from "./paths.ts"`）：Node 直跑 TS 不做 `.js`→`.ts` 重映射；esbuild 与 tsc（`allowImportingTsExtensions`）都接受。
12. **`src/host/store.ts` 不得 import 宿主能力**（cordis / 任何服务）：存储层必须能脱离 `dsh` 单测，宿主能力一律留在别的模块。
13. **存储层的测试隔离靠环境变量，不得加 test-only API**：测试在自己的进程里把 `DSH_HOME` 指向临时目录；`paths.ts` 全部为调用期求值。
14. **db 结构变更必须走 `MIGRATIONS` + 升 `SCHEMA_VERSION`**：迁移要幂等（先探测再 `ALTER`，不要「执行失败就吞掉」）。
15. **可测判定不进 `.tsx`**：判定、映射和归一化下沉到不依赖 React 或真实宿主、可直接用 `node --test` 验证的模块。组件只做接线；不加 react-dom / jsdom，接线行为在 DSH 现场验收。

## 命令与完成标准

- 每项任务结束时运行 `npm run verify`，提交前四道门（typecheck、test、build、smoke）必须全绿。单项命令见 [`package.json`](package.json)。
- 测试放 `tests/*.test.mjs`。新增负样本用变异验证：临时改坏实现 → 对应用例失败 → 复原。
- 一个任务一次提交，格式为 `<type>: <scope> <what>`。

## Agent skills

### Issue tracker

本地 Markdown 工单，位于 `.scratch/<feature-slug>/`。见[工单约定](docs/agents/issue-tracker.md)。

### Triage labels

状态写在 issue 文件的 `Status:` 行，沿用五个默认角色。见[标签角色映射](docs/agents/triage-labels.md)。

### Domain docs

Single-context：`GLOSSARY.md` + [架构与决策](docs/architecture.md)。见[域文档入口](docs/agents/domain.md)。
