# GLOSSARY

## AI 候选执行

**候选路由（candidate route）** — 一次能力可用的一个 provider + model 组合。一次能力按候选顺序轮询，候选清单由目录和模型元数据决定。见 `src/host/ai.ts` 的 `AiRoute`。

**候选执行模块（candidate-execution module）** — 逐候选发起调用并决定「接受 / 拒绝」的模块（`ai.ts#attemptAllCandidates`）。单次候选调用的结果：拿到文本记接受；传输失败或**内容验收不通过**记拒绝。拒绝后同轮尝试下一个候选；整轮扫完全部失败，本轮才算失败。

**内容验收（content validation）** — 对候选返回文本的解析与结构校验，判定标准是各能力的解析器（如技能描述符的 `parseSkillJson`：非 JSON 或无 `name` 即不合格）。只有通过内容验收才记 `candidate-accepted`；不合格记 `candidate-rejected` 并带错误码（解析失败属 `schema-mismatch`）。

**候选接受（candidate-accepted）** / **候选拒绝（candidate-rejected）** — 请求追踪里单次候选调用的结束状态事件。接受 = 传输成功且内容验收通过；拒绝 = 传输失败或内容不合格，事件带失败 code。

**轮（round）** — 一次完整扫过候选清单的执行过程。技能描述符最多三轮；轮内按候选回退，轮间重试（描述符不叠加诊断注入重试）。一次能力的全部轮次、候选与排队共享同一个总预算（`AiBudget`）。

**技能描述符（skill descriptor）** — AI 为提示词生成的 `{ name, description, whenToUse? }` 三字段产物，全部落盘，写回类操作，不接结果缓存。
