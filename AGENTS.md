# AGENTS.md — dsh-prompt-enhancer

本文件只补充本项目特有的约束。全局 `~/.dsh/AGENTS.md` 全部适用，本文件不得削弱其任何规则。

## 权威来源

- 设计规格 `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md` **已定稿**，是范围与契约的唯一权威。
- 实施计划 `docs/superpowers/plans/` 与规格冲突时**以规格为准**，并回头修正计划。
- `.tmp/dsh-prompt-library/` 是上游参考项目（v0.16.0），**只读**：禁止修改；一切修复落在本项目侧。

## 硬约束

1. **客户端模块 id 必须等于包名**：从 `package.json.name` 派生，禁止在 `scripts/build.mjs` 或源码中硬编码。
2. **systemPrompt section 数恒为 0**：本插件不注册任何 section。这是产品承诺，不是遗漏，不得「顺手补上」。
3. **只用官方插槽**：禁止 MutationObserver、DOM 注入等 hack（规格 §7.3）。
4. **`react` / `react/jsx-runtime` / `@deepseek-ai/*` 一律 external**，由宿主在运行时解析，禁止打包。
5. **不引入规格外依赖与能力**：尤其不得引入 `js-yaml`；不得引入 WebSocket、人格/SOUL、技能反向导入、活同步引擎。
6. **上游 MIT 署名不可删**：`LICENSE` 的 `master1Sun` 行与 README 的来源声明必须保留。
7. **`lib/` 纳入版本控制**（与上游一致，使仓库可直接安装）；`*.map` 与 `.build-meta.json` 忽略。
8. **npm 缓存必须留在工作区内**：`npm install --cache .npm-cache`。缓存落在用户目录会被沙箱拒绝（EPERM），不得为此提权。
9. **`$DSH_HOME/profiles/**` 对本会话沙箱不可写**：安装插件、重启 `dsh web` 属用户执行步骤，不得绕过。

## 命令与完成标准

```sh
npm run typecheck   # tsc --noEmit
npm run build       # lib/index.js + lib/client.js
npm run smoke       # 真实执行 client bundle，校验注册 id 与导出形状
```

- 每个任务结束时 `typecheck` / `build` / `smoke` 必须全绿；`npm test` 从 P2 起纳入。
- 提交粒度：一个任务一次提交，message 用 `<type>: <scope> <what>`。

## 测试

测试框架为 Node 内置 `node --test`（无第三方 runner），用例放 `tests/*.test.mjs`。P1 尚无 `test` 脚本；P2 建 `tests/` 时同步加入 `"test": "node --test"`。

## 本机环境

计划文档写于 Windows + PowerShell 环境，本机为 **macOS**：命令等价改用 bash；`scripts/link-dsh-deps.mjs` 的 `symlink(..., "junction")` 在 macOS 上退化为普通目录符号链接，属预期行为。
