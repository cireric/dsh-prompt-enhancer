# 从想法起草：关键假设的正文交接

本评估只确认并修复一个可复现缺口：模型把执行默认值写进 `assumptions` 而没有落实到 `body` 时，原解析器会接受并缓存该稿；复制、应用和模板增强只交付正文，默认值随之丢失。修复要求假设引用正文原句，缺失时沿用既有候选回退与诊断重试，不把可能冲突的元数据自动补进正文。

**结论限于本地交接校验。真实模型出稿、真实下游执行及总体质量提升均待验证。** 用户明确选择合成样本与离线回放，没有使用真实用户案例、凭证、网络或付费调用。无法据此判断这个缺口在真实使用中的发生频率，或证明它是所有问题中影响最大的一个。

## 基线与原始证据

- 日期：2026-11-19，Asia/Shanghai；提交：`677f3bcaf949bd5041a9c0d1c07a8257c92b7409` **加当时未提交的工作区状态**，不是纯 HEAD。
- [baseline.json](baseline.json) 记录相关文件 SHA256、完整初始工作区状态、差异统计及客户端/类型相关差异；[baseline-ai.patch](baseline-ai.patch) 保存基线 `ai.ts` 相对 HEAD 的既有改动。原 `draft.ts` 与 HEAD 相同。原请求路由/预算/缓存重构作为固定条件，未纳入本次修复。
- [environment.json](environment.json)：Node v26.13.0，`@deepseek-ai/dsh-llm` 0.2.2-rc.3；依赖来自现有安装，没有安装或升级。
- 一手依据为本地原始源码。`src/host/ai.ts` 的 `DRAFT_SYSTEM` 要求影响执行的默认值写入正文，但原末行只有待补材料/核实步骤的逐字契约；`src/host/draft.ts#parseDraftResult` 原来不校验假设与正文的关系。
- `PromptDraftForm.tsx` 单独展示假设，`AIPolishButton.tsx` 的 `onCopy`、`onApply`、`onEnhance` 使用 `draftSession.body`。检查还收到 `generatedFrom`，但其中没有本稿的 `assumptions`。因此并非所有后续入口都“只有正文”，但都不能依赖假设侧栏。
- 本轮没有需要外部事实核查的主张。产品 A/B、路径 `/repo`、日志、访谈与 CSV 都是合成材料；来源核查案例测试的是指令保留，没有核实真实产品或价格。

实际基线回放片段（`skipped-permission`）：

```json
{"idea":"查构建慢的原因。","executor":"可读仓库的编程代理；没有修改、提交权限。","answers":[{"question":"是否允许修改配置？","answer":""}]}
```

脚本模型原始回复：

```json
{"kind":"draft","body":"分析构建日志，列出三个瓶颈和证据。","assumptions":["只读分析，不修改文件，不提交。"]}
```

基线接受、缓存并交付这段没有权限边界的正文。候选版拒绝首轮；相同回放队列的第二条回复把“只读分析，不修改文件，不提交。”写入正文后才接受。完整请求参数、原始回复、最终正文、缓存记录和阶段事件分别在 [baseline-results.json](baseline-results.json) 与 [candidate-results.json](candidate-results.json)，没有把人工写出的第二条回复称为真实模型恢复。

## 框架审计、假设与推翻条件

没有名为 Researcher 的可用技能；使用 research 技能做独立源码审计，按目标与判据、证据链、替代解释、反例和可证伪预测组织。

| 解释 | 可观察预测/推翻条件 | 结果 |
|---|---|---|
| 解析层漏验假设与正文的交接 | 若 parser 会拒绝仅元数据中的默认值，或客户端会合并这些默认值，则诊断不成立 | 实际旧 parser 接受；复制/应用未合并，支持诊断 |
| 客户端传递丢失 | 若宿主已返回完整正文、客户端却删掉默认值，则应修客户端 | 请求/原始回复/最终正文对照显示漏项已在宿主边界被接受，未选择此解释 |
| 模型缺少正文要求 | 若实际请求完全没有要求默认值进入正文，应先补需求表达 | 请求已有自然语言要求，但输出契约与机械校验不完整；只收紧此处交接契约 |

最初考虑的“直接追加假设”被反例推翻：正文要求 Python 标准库、禁止第三方依赖，错误假设却写“允许安装 requests”。追加会把错误许可带入原本合格的正文。同义措辞也是压力测试：正文已有只读限制，不应再追加冗余版本。最终采用拒绝并重试，允许模型只把假设栏改为引用正文原句。

## 冻结判据与同条件对照

[cases.json](cases.json) 在生产修改前冻结，SHA256 为 `03970afb38c6f976e6300c0710693d8f7da1ef5c5cee0733ee5d52e3020c9c9a`。每案保留原始想法、澄清/跳过、执行环境、资料、改写反馈、全部脚本回复及硬性失败/允许变化；不适用项在请求中省略，不代表材料已具备。

七例用于调优回放，两个完整验收回放在候选实现后首次运行。保留案例与负向单元测试覆盖同类错误（CSV 默认值和冲突假设），所以这是完整请求层面的保留验收，不是未知错误类型或独立分布的泛化验证。

两版使用相同请求、相同回复队列、相同实际宿主能力与上下文。模型为 **scripted `synthetic-draft-v1`**，不是真实模型；provider=`replay`，temperature=0.4，maxTokens=4096，reasoningEffort=`off`，无 seed/top_p/外部工具。宿主结构化请求总预算 215s、单次上限 180s，回放立即返回，没有测量真实延迟。消息 id 由宿主生成，不影响模型正文。唯一实验因素是“假设必须引用正文”的请求契约及其对应解析校验；[change.patch](change.patch) 可反向恢复这两处基线源码，并核对原始 SHA256。

每案开始清空路由/结果缓存；首次均未命中，重复同输入均命中成功结果，未发生额外流式调用。候选版七例从 1 次变为 2 次调用，其余两例保持 1 次。回复队列第二项是预先手写的合规回复，这些数字不能估计真实恢复概率。

| 案例 | 分组 | 基线字面判据 | 候选字面判据 | 基线缺口/对照目的 |
|---|---|---|---|---|
| direct | 调优 | 通过 | 通过 | 无默认值，保留直接出稿 |
| clarify | 调优 | 通过 | 通过 | 必要澄清，不默认授权发送 |
| missing-material | 调优 | 失败 | 通过 | 仅据逐字稿的范围在元数据中 |
| skipped-permission | 调优 | 失败 | 通过 | 只读/不修改/不提交未进入正文 |
| external-evidence | 调优 | 失败 | 通过 | 默认地区、币种未进入正文 |
| rewrite | 调优 | 失败 | 通过 | 不运行命令仅在元数据中 |
| paraphrase | 调优 | 通过 | 通过 | 同义元数据通过重试改为原句，正文没有重复 |
| holdout-csv | 保留验收 | 失败 | 通过 | 首次记录保留策略未进入正文 |
| holdout-conflict | 保留验收 | 通过 | 通过 | 错误假设不自动追加，正文不引入 requests 许可 |

机械计数 **4/9 → 9/9**，保留验收 **1/2 → 2/2**。仅在预写恢复回复的这些回放里未见终态硬性失败退化。新契约确实会拒绝原先可接受的“正文正确、假设为同义解释”的原始回复；模型若不纠正，最终会返回 `schema-mismatch`，不是无损兼容。

语义按冻结判据审阅匿名 A/B 正文，见 [blind-review.md](blind-review.md)、原始 [blind-packet.json](blind-packet.json) 和解盲 [blind-key.json](blind-key.json)。独立子代理没有看到源码或版本标签；明确支持三例正文改善，对“访谈来源唯一性”和“是否采用不运行命令默认值”保留分歧。不能把五项字面改善全部说成无争议的语义改善，更不能外推到真实下游产物。

## 验证与复跑

在项目根目录、现有依赖安装可用的环境运行：

```sh
node evaluations/draft-assumptions/replay.mjs --variant baseline
node evaluations/draft-assumptions/replay.mjs --variant candidate
node --test tests/draft-assumptions.test.mjs tests/ai-errors-route.test.mjs
npm run verify
git diff --check
```

基线回放会在临时目录复制当前 `src`，反向应用 `change.patch`，检查两个文件与冻结基线 SHA256 一致，再运行真实 `draftPromptCore`；不会修改当前源码或 `$DSH_HOME/profiles`。回放结果默认覆盖同目录的对应结果 JSON。基线存在预期失败，脚本正常结束；候选任一字面判据失败则断言报错。未来源码变化导致补丁或指纹不符时，应使用本轮文件状态复跑，不能静默把新源码当旧基线。

- 初始 `npm run verify`：542 项测试通过，typecheck/build/smoke 通过，见 [baseline-verify.txt](baseline-verify.txt)。
- 最终 `npm run verify`：546 项测试通过，typecheck/build/smoke 通过，见 [candidate-verify.txt](candidate-verify.txt)。`lib` 已重建。
- 新回归测试在旧实现上先红；局部测试 40/40 通过。
- [mutations.json](mutations.json) 保存变异差异、命令及失败记录：移除假设校验，4 项失败；恢复旧请求契约，对应请求测试失败。第一次请求断言过宽而存活，收紧后重新验证，两处源码均已恢复。
- 代码独立审阅覆盖五轴、调用点、冻结指纹、请求与缓存记录，未发现本次范围内的阻塞缺陷；原有工作区改动保留，未提交、推送或安装插件。

## 未验证范围

`downstreamExecution` 在两份结果中明确为 null；没有下游执行产物，不用脚本生成的“成功结果”冒充下游模型执行。浏览器接线没有活体验收，结论来自源码核对。模型若遗漏整个假设、在正文和假设中同时给出错误约束、或以否定句包含相同字面串，这个校验不能判断语义正确性，也不证明忠实于用户意图。新增重试的真实延迟、费用与成功率，以及既有 `missingInputs/toVerify` 的追加策略不在本轮修复或质量声明范围内。
