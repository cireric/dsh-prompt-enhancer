# AGENTS.md — dsh-prompt-enhancer

本文件只补充本项目特有的约束。全局 `~/.dsh/AGENTS.md` 全部适用，本文件不得削弱其任何规则。

## 权威来源

- **设计与接口**：改动前先查[架构文档](docs/architecture.md)的相关章节，再以源码和测试核实现行行为。新增设计决策记入架构 §6；硬约束以本文件为准。
- **安装与复跑**：见[中文 README](README.zh.md)。历史提案、归档规格和离线评估只作追溯，不作为现行契约或验收结果。

## 硬约束

1. **客户端模块 id 必须等于包名**：从 `package.json.name` 派生，禁止在 `scripts/build.mjs` 或源码中硬编码。
2. **systemPrompt section 数恒为 0**：本插件不注册任何 section。这是产品承诺，不是遗漏，不得「顺手补上」。
3. **只用官方插槽**：禁止 MutationObserver、DOM 注入等 hack（`docs/architecture.md` §2）。
4. **宿主依赖一律 external**：`react`、`react/jsx-runtime`、`react-dom` 和 `@deepseek-ai/*` 由宿主解析。构建只允许打包本仓 `src/` 的输入。
5. **不引入规格外依赖与能力**：尤其不得引入 `js-yaml`；不得引入 WebSocket、人格/SOUL、技能反向导入、活同步引擎。
6. **上游 MIT 署名不可删**：`LICENSE` 的 `master1Sun` 行与 README 的来源声明必须保留。
7. **`lib/index.js` 和 `lib/client.js` 随源码提交**，使检出可直接安装；`*.map` 与 `.build-meta.json` 不提交。
8. **npm 安装缓存留在工作区**：`npm install` / `npm ci` 使用 `--cache .npm-cache`。
9. **DSH profile 由用户操作**：不写入 `$DSH_HOME/profiles/`；安装插件和重启 `dsh web` 由用户执行。
10. **`src/` 必须是可擦除 TS**：测试直接导入 `.ts`。不得使用 `enum` / `namespace` / 参数属性等需要代码生成的语法（`erasableSyntaxOnly` 校验）。
11. **`src/` 内部相对导入必须写显式 `.ts` 后缀**（如 `from "./paths.ts"`）：Node 直跑 TS 不做 `.js`→`.ts` 重映射；esbuild 与 tsc（`allowImportingTsExtensions`）都接受。
12. **`src/host/store.ts` 不得 import 宿主能力**（cordis / 任何服务）：存储层必须能脱离 `dsh` 单测，宿主能力一律留在别的模块。
13. **存储层的测试隔离靠环境变量，不得加 test-only API**：测试在自己的进程里把 `DSH_HOME` 指向临时目录；`paths.ts` 全部为调用期求值。
14. **db 结构变更必须走 `MIGRATIONS` + 升 `SCHEMA_VERSION`**：迁移要幂等（先探测再 `ALTER`，不要「执行失败就吞掉」）。
15. **可测判定不进 `.tsx`**：判定、映射和归一化下沉到不依赖 React 或真实宿主、可直接用 `node --test` 验证的模块。组件只做接线；不加 react-dom / jsdom，接线行为在 DSH 现场验收。

## 命令与完成标准

- 每项任务结束时运行 `npm run verify`；提交前类型检查、全量测试、构建与 smoke 必须全绿。`verify:ci` 只覆盖无需 DSH 的子集和跟踪产物复现，不替代本地全量门禁。改动 HTTP 路由时更新 [`tests/api.test.mjs`](tests/api.test.mjs) 的覆盖账本；改动插槽或注入顺序时核对 [`scripts/smoke.mjs`](scripts/smoke.mjs) 的对应断言。
- 测试放 `tests/*.test.mjs`。新增负样本用变异验证：临时改坏实现 → 对应用例失败 → 复原。
- 一个任务一次提交，格式为 `<type>: <scope> <what>`。

## Agent skills

### Issue tracker

本地 Markdown 工单，位于 `.scratch/<feature-slug>/`。见[工单约定](docs/agents/issue-tracker.md)。

### Triage labels

状态写在 issue 文件的 `Status:` 行，沿用五个默认角色。见[标签角色映射](docs/agents/triage-labels.md)。

### Domain docs

Single-context：`GLOSSARY.md` + [架构与决策](docs/architecture.md)。见[域文档入口](docs/agents/domain.md)。
