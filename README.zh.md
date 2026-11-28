<div align="center">

🇨🇳 **中文** | [🌐 English](./README.md)

</div>

# dsh-prompt-enhancer

DSH（DeepSeek Harness）Web 插件：在聊天输入框旁管理、优化和复用提示词。

## 功能

- **词库管理**：从输入框旁的词库选择器或侧栏打开管理面板。支持新建、编辑、搜索、排序、标签分组和使用次数统计；也可保存选中文字或当前草稿、从回收站恢复条目、导出 JSON 备份或在导入前预览。
- **复用与模板**：输入 `#` 查找提示词，或在词库选择器中选择追加、覆盖或插入并发送。插入前可填入 `{{变量名}}` 的值。模板支持变量说明和默认值，词库可按模板记住填值。
- **上下文推荐**：当前草稿的关键词决定哪些条目可推荐，最近三条用户消息辅助排序，最多推荐五条。匹配在浏览器内完成，不调用模型。
- **AI 优化**：轻度润色生成可编辑的优化稿；增强为模板生成可编辑的模板和可选建议。试填不改变模板，也可以把模板另存到词库。
- **检查提示词**：检查输入框里的草稿，查看问题、勾选建议并生成可编辑的改稿。应用到输入框不会发送消息，也不会写入词库。
- **从想法起草**：空输入框也可起草。按需补充执行环境或参考资料；如有澄清问题，可回答或跳过。出稿后可编辑正文、查看假设和待补材料，或增强为模板；也可把起草检查的一条建议带回反馈框，自行决定是否发起改写。
- **词库回滚**：已存条目保留 AI 优化前原文时，可在词库详情双向切换原文和优化稿。这不是输入框撤销。
- **技能导出**：导出到 `$DSH_HOME/skills/<name>/SKILL.md`，可预览文件并用 AI 补全名称与描述。导出内容过期时可手动重导，不会自动更新或反向导入词库。
- **设置**：选择 AI 模型、管理面板尺寸、入口显隐、输入框按钮标签、`#` 触发、上下文推荐、选中捕获和词库条数上限。

插件注册 **零个 `systemPrompt` section**，不向会话注入提示词、角色或技能。

## 安装

本项目未发布到 npm。从本地检出安装到已有的 DSH Web profile；仓库自带运行产物，安装前无需构建。运行 DSH 需使用 Node.js 22.19 或更高版本。`DSH_HOME` 未设置时使用 `~/.dsh`。

```sh
node "${DSH_HOME:-$HOME/.dsh}/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add /path/to/dsh-prompt-enhancer
```

使用 `link:` 安装后，profile 直接读取本地仓库。源码改动后运行 `npm run build`，再重启 `dsh web`，无需复制文件。用以下命令确认已安装到对应 profile：

```sh
node "${DSH_HOME:-$HOME/.dsh}/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config | grep -A2 'dsh-prompt-enhancer'
```

## 使用提示

- `#` 候选浮层显示时，先关闭它，再用键盘打开词库选择器。关闭选择器不会自动恢复 `#` 候选。
- 变量填窗关闭或卸载时，进行中的输入值会丢失，与词库已记住的模板填值无关。
- JSON 备份包含词库中未删除的提示词和标签，不含回收站、记住的模板填值或已导出的技能文件。确认导入会替换本地同 ID 条目，包括回收站中的同 ID 项。
- 生成类 AI 操作使用 DSH 配置的模型服务。「从想法起草」的来源搜索由用户单独触发，只向 DSH 搜索服务提交关键词；返回链接是线索，不是已核实的事实。检查、改稿、增强或起草长时间无正文时，见 [AI 模型排障](docs/troubleshooting-ai.md)。

## 开发

开发建议与 CI 使用相同的 Node 24。本地全量验证需要初始化过的 DSH profile 提供宿主包；`link-dsh-deps` 将它们链接到本检出的 `node_modules`。

```sh
npm install --cache .npm-cache
npm run link-dsh-deps
npm run verify
```

`npm run verify` 执行类型检查、全量 Node 测试、构建和产物冒烟检查。源码变更与重建后的 `lib/` 产物一同提交。

GitHub Actions 运行无需 DSH 的测试子集，并检查重建产物与版本库一致，不替代本地全量验证或 DSH Web 现场验收。可在干净的检出中复跑：

```sh
npm ci --cache .npm-cache
npm run verify:ci
```

`npm ci` 会替换 `node_modules`。如果开发目录已链接 DSH 包，请另用干净的检出。宿主服务、插槽、存储和设计决策见[架构文档](docs/architecture.md)；项目规则和验收要求见 [AGENTS.md](AGENTS.md)。

## 来源与许可

本项目衍生自 [`master1Sun/dsh-prompt-library`](https://github.com/master1Sun/dsh-prompt-library) v0.16.0（MIT）。上游 MIT 全文和 `Copyright (c) master1Sun` 声明保留于 [`LICENSE`](LICENSE)。
