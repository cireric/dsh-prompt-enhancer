<div align="center">

🇨🇳 **中文** | [🌐 English](./README.md)

</div>

# dsh-prompt-enhancer

DSH（DeepSeek Harness）提示词增强插件：只做**提示词本身**的事——在聊天输入栏旁管理与复用提示词、AI 优化、沉淀与持续改进。

本项目基于 [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0（MIT）裁剪而来，见下方「来源与许可」。

## 功能范围

**做：**

- 词库管理：增删改查（标题 + 正文 + 标签）、搜索、排序、标签分组、使用次数统计
- 双入口：输入框旁按钮 + 左侧下方（设置按钮旁）入口，均可打开管理面板
- 复用：插入（追加）/ 覆盖 / 插入并发送；输入 `#` 触发浮层实时筛选
- 模板变量：`{{变量名}}` 占位，插入时填充弹窗并记忆上次填值
- AI 优化：正文润色（可保留变量）、一键完善（标题/标签/摘要/正文）、用途摘要
- 可回滚：保留 AI 优化前原文，支持「原文 ↔ 优化稿」双向切换
- 沉淀三入口：管理面板新建/编辑、选中文字浮出「存为提示词」、当前草稿存为提示词
- 标签管理、回收站（软删除 + 恢复 + 永久删除 + 清空）
- 导入导出：JSON 备份，导入含预览与确认
- 上下文推荐：草稿非空时按「当前输入 + 最近 3 条用户消息」关键词匹配推荐（最多 5 条）
- 设置页：AI 模型、面板尺寸、按钮显隐、`#` 触发开关、推荐开关、选中捕获开关、存储上限
- 技能导出：一键把提示词导出为官方 DSH Skill（`$DSH_HOME/skills/<name>/SKILL.md`）；提示词改动后显示「技能已过期」并支持一键重新导出

**不做**（明确排除）：

- 人格（SOUL）系统、按工作区/会话的作用域绑定
- 会话级技能注入（往 system prompt 注入提示词）、DSH Skill 反向导入、harness 技能开关
- 技能与提示词的活同步引擎（改为显式单向导出 + 过期提示）
- systemPrompt 注入 —— 本插件的 systemPrompt section 数**恒为 0**
- 自学习 / 自动捕获、版本历史表、WebSocket 推送、插件推荐/市场、公告、成就、看板、自动更新、斜杠命令

## 开发状态

当前为 **P1（骨架与构建契约）**：host/client 双产物构建、类型检查、产物形状校验已跑通，插件可被 `dsh web` 加载，**尚不含任何业务功能**。功能按 8 份计划（P1–P8）逐项交付，见 `docs/superpowers/plans/`。

## 安装

本项目尚未发布到 npm。本地安装到 DSH profile（`dsh` CLI 不在 PATH 时用其入口脚本）：

```sh
node "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add /path/to/dsh-prompt-enhancer
```

`link:` 方式安装意味着 profile 直接解析本项目目录，因此后续只需 `npm run build` 并**重启 `dsh web`**（结束当前进程后重新启动），无需复制文件。用 `--dump-config` 可确认 profile 层已挂上：

```sh
node "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config | grep -A2 'dsh-prompt-enhancer'
```

## 开发

```sh
npm install --cache .npm-cache   # 缓存必须落在工作区内（沙箱只允许写工作区）
npm run link-dsh-deps            # 把 profile 的 @deepseek-ai/* 类型包链进 node_modules，供 tsc 解析
npm run typecheck                # tsc --noEmit（含 i18n 键集校验）
npm run build                    # 生产构建：lib/index.js + lib/client.js
npm run build:dev                # 开发构建：额外打印加载日志
npm run smoke                    # 产物形状校验：真实执行 client bundle 验证注册 id 与导出
npm test                         # node --test（P2 起可用）
```

技术栈：TypeScript（`noEmit`，仅类型检查）+ esbuild（双入口打包）+ Node 内置 `node --test`；运行时依赖 `node:sqlite`（Node ≥ 22.19，实测 v24）。构建契约见 `docs/superpowers/specs/`。

## 目录结构

```
src/index.ts           host 入口（Node ESM）
src/client/index.ts    client 入口（浏览器，__ModuleLoader__ 模块格式）
scripts/build.mjs      esbuild 双产物构建
scripts/smoke.mjs      产物形状校验
scripts/link-dsh-deps.mjs  DSH 类型包链接
docs/                  设计规格与实施计划
lib/                   构建产物（纳入版本控制）
```

## 来源与许可

本项目是 [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0（MIT）的**衍生物**：

- **移植**：SQLite 存储层（4 表的 schema 与存储语义）、AI 模块（LLM 路由解析、提示词模板、输出后处理）、通用 UI 组件与模板变量逻辑、导入导出格式（与上游同构，旧插件导出可直接导入）
- **剔除**：人格系统、会话级技能注入、DSH 技能反向导入与活同步、WebSocket 层、DOM 注入入口、死代码
- **新增**：可回滚（原文 ↔ 优化稿）、上下文推荐的显式触发语义、技能导出的过期提示、官方插槽替代 DOM 注入

上游 MIT 全文与 `Copyright (c) master1Sun` 声明保留于 `LICENSE`。
