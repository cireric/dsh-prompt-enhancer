# AI 模型排障

## 检查、改稿、增强或起草长时间没有正文

先检查 `$DSH_HOME/prompt-enhancer/log/review-YYYY-MM-DD.jsonl`（日期按 UTC；未设置 `DSH_HOME` 时用 `~/.dsh`）。按请求 `id` 关联事件。`routing-start` 和首条 `stream-start` 可以核对是否优先调用了设置中的模型。

- `firstReasoningMs` 有值：模型已经开始返回推理。
- 流结束时 `textChars: 0`：未返回正文。
- `finish: "max-tokens"`：输出耗尽 token 预算。
- `deadlineAborted: true`：插件计时到期。

对于这些结构化请求，插件优先使用模型声明的 `off` 档位。日志中的 `reasoningEffort: "off"` 只说明插件选择了该档位。宿主适配器仍需把它转成网关认识的字段。

## `@deepseek-ai/dsh-llm-pi-ai` 配置案例

下列是既有验证环境的配置案例，不是插件内置模型清单。使用该适配器和 ModelScope 时，在 Web profile 的 `cordis.patch.yml` 中给现有 `config.providers.modelscope.models` 条目补字段，保留其余配置：

```yaml
- id: deepseek-ai/DeepSeek-V4-Pro-0813
  compat:
    thinkingFormat: deepseek
    supportsDeveloperRole: false
  reasoningEfforts:
    off: null
    high: high
- id: Qwen/Qwen3.8-Flash-Next
  compat:
    thinkingFormat: qwen
    supportsDeveloperRole: false
  reasoningEfforts:
    off: null
    high: high
```

这两个模型使用 `system` 消息。选择 `off` 时，适配器分别发送 `{"thinking":{"type":"disabled"}}` 和 `{"enable_thinking":false}`。这两个组合先前通过了 ModelScope 流式检查和模板增强，不代表当前网关、其他模型或所有 AI 操作均已验证。

如果 `config.providers.wb.models` 下的 `deepseek-v4.1-flash` 已配置 `reasoningEfforts.off: null`，可在同一模型条目中加 `compat.thinkingFormat: deepseek` 以使用对应的显式关闭字段。

由用户修改 profile 并重启 `dsh web`。用临时草稿分别跑检查和模板增强，在同一请求的日志中核对首选模型、`reasoningEffort`、返回正文及 `candidate-accepted`。如需确认适配器发送的字段，应另核对适配器版本及请求；单看插件日志不能证明网关采纳了参数。
