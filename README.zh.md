<div align="center">

🇨🇳 **中文** | [🌐 English](./README.md)

</div>

# dsh-prompt-enhancer

DSH（DeepSeek Harness）提示词增强插件：只做**提示词本身**的事——在聊天输入栏旁管理与复用提示词、AI 优化、沉淀与持续改进。

本项目基于 [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0（MIT）裁剪而来，见下方「来源与许可」。

## 功能范围

**做**（11 项已交付能力，按规格顺序）：

1. **词库管理**：增删改查（标题 + 正文 + 标签）、搜索、排序、标签分组、使用次数统计；**双入口**——输入框旁按钮 + 左侧下方（设置按钮旁）入口，均可打开管理面板
2. **复用**：插入（追加）/ 覆盖 / 插入并发送；输入 `#` 触发浮层实时筛选
3. **模板变量**：`{{变量名}}` 占位，插入时填充弹窗并记忆上次填值
4. **AI 优化**：正文润色（可保留变量）、一键完善（标题/标签/摘要/正文）、用途摘要
5. **可回滚**：保留 AI 优化前原文，支持「原文 ↔ 优化稿」双向切换
6. **沉淀三入口**：管理面板新建/编辑、选中文字浮出「存为提示词」、当前草稿存为提示词
7. **标签管理**、**回收站**（软删除 + 恢复 + 永久删除 + 清空）
8. **导入导出**：JSON 备份，导入含预览与确认
9. **上下文推荐**：草稿非空时按「当前输入 + 最近 3 条用户消息」关键词匹配推荐（最多 5 条）
10. **设置页**：AI 模型、面板尺寸、按钮显隐、`#` 触发开关、推荐开关、选中捕获开关、存储上限
11. **技能导出**：把提示词一键导出为官方 DSH Skill（`$DSH_HOME/skills/<name>/SKILL.md`）；提示词改动后显示「技能已过期」并支持一键重新导出

**不做**（明确排除）：

- 人格（SOUL）系统、按工作区/项目/会话的作用域绑定
- 会话级技能注入（往 system prompt 注入提示词）、DSH Skill 反向导入、harness 技能开关与软控制注入
- 技能与提示词的活同步引擎（改为显式单向导出 + 过期提示）
- 项目级技能根（`<project>/.dsh/skills`）导出
- systemPrompt 注入 —— 本插件注册的 systemPrompt section 数为 **0**
- 自学习 / 自动捕获（无阈值判定，改为手动三入口）
- 版本历史表与任意版本回退
- WebSocket 推送、插件推荐/市场、公告、成就、看板、桌面宠物、QQ 机器人
- 自动更新 / 版本检查、定时备份
- 斜杠命令

## 开发状态

八个里程碑（M1–M8）**已全部交付**：

| 里程碑 | 已交付 |
| --- | --- |
| **M1 骨架可加载** | host/client 双产物构建、`tsc --noEmit`、产物形状校验；插件可被 `dsh web` 加载 |
| **M2 数据层** | 4 张 SQLite 表与全部存储函数，由 `tests/store.test.mjs` 覆盖 |
| **M3 API 面** | HTTP 路由 + 移植的 AI 模块 |
| **M4 复用闭环** | 词库按钮、`#` 触发、插入 / 覆盖 / 插入并发送、模板变量 |
| **M5 AI + 回滚** | AI 优化按钮、一键完善、原文 ↔ 优化稿切换 |
| **M6 沉淀 + 管理** | 管理面板、三入口捕获、标签管理、回收站、导入导出 |
| **M7 技能导出（D8）** | `skills.ts` 导出、`generateSkillDescriptor`、`SkillExportModal`、过期徽标 |
| **M8 收尾** | 上下文推荐、设置页、i18n 收口、文档与许可 |

施工按 `docs/superpowers/plans/` 下的 8 份计划（P1–P8）推进；设计契约见 `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`。

## 已知限制

以下都是施工期**显式留档的取舍，不是缺陷**——没有设计决策前请勿「顺手修」（规格 §13.10-五、§13.11-五）：

1. **`#` 浮层在屏时，非指针激活打不开词库面板**（规格 §13.10-五-1）：闸门按**激活通道**分叉——`event.detail === 0` 的激活（键盘 Enter/空格、`element.click()`、部分辅助技术）仅在浮层不在屏时放行，真实指针点击（`detail > 0`）一律放行。非指针激活**不置位**面板打开状态，浮层消失后需**再激活一次**。指针路径完全不受影响，含 down→up 间隔 0ms 的极短点击。
2. **变量填窗的逐字输入随卸载丢失**（规格 §13.10-五-2）：`values` 是 `TemplateVariablesDialog` 的组件局部 state，面板一关即卸载；只有「已选提示词 + 待执行动作」能保住。
3. **组件接线无自动化断言**（规格 §13.10-五-3）：本仓库无 react-dom / jsdom（硬约束 5 禁装），「渲染门是否真的用了派生值」这类不变量只能由活体验收覆盖。变异证据：把 `panelOpen` 降级为 `open`，整套测试仍全绿。
4. **输入 `#` 后关闭词库面板，`#` 浮层不会自己回来**（P8 裁决 TBD-P8-6）：程序化 focus + Range 恢复无效，只有真实键入才重新在屏。属**取舍**，非缺陷。
5. **AI 结果面板在几何上覆盖 composer**（P8 裁决 TBD-P8-6）：它的落点与对应设置项属浮层落点 / 面板尺寸的设计范畴；本里程碑**显式记档、不修**。

## systemPrompt 占用面

**本插件注册的 systemPrompt section 数为 0**（验收 14）。任何提示词都不会被注入 system prompt：每一次写入都是用户显式触发、落到输入框里的插入。section 数为 0 是**产品承诺，不是遗漏**（规格 §2.2、硬约束 2）。

上游注册了 `deployment:persona` section 而本插件没有，因此**移除上游的 `deployment:persona` section 后，宿主内置的全局 `deployment:persona` 槽位会重新生效**。这属**预期行为**，不是回归——见规格 §0.1 末行与 §12。

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
npm test                         # node --test
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
