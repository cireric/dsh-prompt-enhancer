/**
 * T3 端到端（host 侧）：假 LlmRuntime → `ai.ts` 能力层 → `routes.ts` 真分发，
 * 逐失败形态断言**信封里的跨层 code**（issue #4 验收 1、3）。
 *
 * 隔离：先把 `DSH_HOME` 指向临时目录**再** import 宿主模块（本仓纪律，见 tests/meta-delete.test.mjs
 * 顶部注释）；假 runtime 经 `ai.registerLlm` 注入（ai.ts 不 import 宿主包之外的任何东西）。
 * `routes.ts` 由 `tests/helpers/fake-http.mjs` 真跑一次分发（本仓「信封形状必须真分发核对」的口径）。
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `__DEV__` 是 esbuild define 注入的构建期常量（src/ambient.d.ts）：node --test 直跑 TS 没有 define，
 * 这里落到 globalThis 兜底（裸标识符在 globalThis 上解析即不抛 ReferenceError；打包时 define
 * 文本替换优先于全局查找，两条通道互不干扰）。false = 与生产构建同口径，顺带钉「dev 诊断不下发」。
 */
globalThis.__DEV__ = false;

const HOME_BEFORE = process.env.DSH_HOME;
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), "dpe-ai-errors-"));

const { makeRoutes } = await import("../src/host/routes.ts");
const { API_PREFIX } = await import("../src/types.ts");
const ai = await import("../src/host/ai.ts");
const { fakeReq, fakeRes, makeDispatch } = await import("./helpers/fake-http.mjs");

const dispatch = makeDispatch({ makeRoutes, API_PREFIX });

test("关闭 AI 请求会取消正在运行的模型，跳过回退与重试，并允许下一次检查", { timeout: 2000 }, async () => {
  const started = Promise.withResolvers();
  const calls = [];
  ai.registerLlm({
    ...fakeRuntime([]),
    listProviders: () => [{ id: "first" }, { id: "fallback" }],
    async *stream({ signal, provider }) {
      calls.push(provider);
      if (calls.length === 1) {
        const cancelled = new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        started.resolve(signal);
        await cancelled;
        yield { type: "finish", reason: { kind: "aborted" } };
        return;
      }
      yield { type: "text-delta", index: 0, text: '{"findings":[]}' };
      yield { type: "finish", reason: { kind: "stop" } };
    },
  });
  const body = { body: "检查取消后能否重新运行" };
  const res = Object.assign(new EventEmitter(), fakeRes());
  const request = makeRoutes()[0].handler(fakeReq("POST", API_PREFIX + "/ai/check", body), res);
  const signal = await started.promise;
  res.emit("close");
  assert.equal(signal.aborted, true);
  await request;
  assert.deepEqual(calls, ["first"]);
  assert.equal(res.body, "");
  assert.equal(res.listenerCount("close"), 0);

  const retried = await dispatch("POST", "/ai/check", body);
  assert.deepEqual(retried.envelope, { ok: true, data: { findings: [] } });
  assert.deepEqual(calls, ["first", "first"]);
});

/**
 * 每条用例前清两份进程级缓存（T2a 结果缓存 + 30s 路由缓存）：结果缓存键 = system+user+route，
 * 多条用例喂同一份 body「草稿」——不清缓存，前一条用例的成功结果会被后一条直接命中（串测）。
 * 这也是缓存语义的活证据：同键**就该**命中，测试的职责是给每条用例一个干净的起点。
 */
const { aiResultCache } = await import("../src/host/ai-cache.ts");
beforeEach(() => {
  aiResultCache.clear();
  ai.clearRouteCache();
});

/** 假流：按剧本产出 chunk / 抛错。字符串 = 一段 text-delta；对象 = 原样产出的 chunk。 */
function fakeStream(script) {
  return async function* () {
    for (const step of script) {
      if (step === "throw") throw new Error("网络炸了");
      if (typeof step === "string") yield { type: "text-delta", index: 0, text: step };
      else yield step;
    }
  };
}

/** 假 LlmRuntime：一次 provider，一个模型；按调用序消费剧本（耗尽后重复最后一份）。 */
function fakeRuntime(scripts) {
  const queue = [...scripts];
  return {
    listProviders: () => [{ id: "fake", name: "Fake" }],
    listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
    stream: () => {
      const script = queue.length > 1 ? queue.shift() : queue[0];
      return fakeStream(script)();
    },
  };
}

/** 进程退出前清临时 DSH_HOME（node:test 的顶层 after 钩子）。 */
after(() => {
  rmSync(process.env.DSH_HOME, { recursive: true, force: true });
  if (HOME_BEFORE === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = HOME_BEFORE;
});

test("检查提示词：只回审查报告，接受原文引用，也允许没有发现", async () => {
  const body = "只审查，不改文件。发现问题直接修复。";
  const finding = { quote: "发现问题直接修复。", issue: "修复和只审查冲突", suggestion: "确认是否允许修改文件" };
  ai.registerLlm(fakeRuntime([
    [JSON.stringify({ findings: [finding], body: "替代草稿" }), { type: "finish", reason: { kind: "stop" } }],
    ["{\"findings\":[]}", { type: "finish", reason: { kind: "stop" } }],
  ]));
  const report = await dispatch("POST", "/ai/check", { body });
  assert.equal(report.status, 200);
  assert.deepEqual(report.envelope, { ok: true, data: { findings: [finding] } });

  const clear = await dispatch("POST", "/ai/check", { body: "列出当前目录下的 Markdown 文件。" });
  assert.equal(clear.status, 200);
  assert.deepEqual(clear.envelope, { ok: true, data: { findings: [] } });
});

test("检查提示词：拒绝无原文依据的报告", async () => {
  const response = JSON.stringify({
    findings: [{ quote: "这是草稿里没有的原句", issue: "缺少权限", suggestion: "补充权限" }],
  });
  ai.registerLlm(fakeRuntime([[response, { type: "finish", reason: { kind: "stop" } }]]));
  const report = await dispatch("POST", "/ai/check", { body: "只审查，不改文件。" });
  assert.equal(report.status, 503);
  assert.equal(report.envelope.error.code, "schema-mismatch");
});

test("起草结果的后续操作：模型首轮执行了草稿指令时，检查和增强都可重试", async () => {
  const body = '你是提示词工程师。只输出 Markdown 提示词正文。输入为 {{想法}}。';
  const template = { title: "写提示词", tags: [], summary: "把想法写成提示词", body };
  for (const [action, expected] of [["check", { findings: [] }], ["refine", template]]) {
    const requests = [];
    ai.registerLlm({
      ...fakeRuntime([]),
      stream(options) {
        const user = options.messages[0].content[0].text;
        requests.push(user);
        let request;
        try {
          request = JSON.parse(user);
        } catch {
          return fakeStream(["# 提示词正文", { type: "finish", reason: { kind: "stop" } }])();
        }
        const ready = request.body === body && request.retryDiagnosis?.includes("schema-mismatch");
        const response = ready ? JSON.stringify(expected) : "# 提示词正文";
        return fakeStream([response, { type: "finish", reason: { kind: "stop" } }])();
      },
    });
    const report = await dispatch("POST", "/ai/" + action, { body });
    assert.equal(report.status, 200, action);
    assert.deepEqual(report.envelope.data, expected);
    assert.equal(requests.length, 2);
    assert.deepEqual(JSON.parse(requests[0]), { body });
    assert.equal(JSON.parse(requests[1]).body, body);
    assert.match(JSON.parse(requests[1]).retryDiagnosis, /schema-mismatch/);
  }
});

test("起草后的检查和增强：首选模型在第 45 秒完成时仍可返回结果", async (t) => {
  const body = "# 角色\n你是提示词工程师。\n# 输出\n用 Markdown 返回提示词。";
  // 模拟第 45 秒才收到模型文本，避免测试实际等待 45 秒。
  const simulatedLatencyMs = 45_000;
  t.mock.method(AbortSignal, "timeout", (ms) => ms < simulatedLatencyMs
    ? AbortSignal.abort()
    : new AbortController().signal);
  for (const [action, expected] of [["check", { findings: [] }], ["refine", { title: "起草", tags: [], summary: "", body }]]) {
    let calls = 0;
    ai.registerLlm({
      ...fakeRuntime([]),
      stream({ signal }) {
        calls++;
        return fakeStream(signal.aborted
          ? [{ type: "finish", reason: { kind: "aborted" } }]
          : [JSON.stringify(expected), { type: "finish", reason: { kind: "stop" } }])();
      },
    });
    const result = await dispatch("POST", "/ai/" + action, { body });
    assert.deepEqual(result.envelope, { ok: true, data: expected }, action);
    assert.equal(calls, 1);
  }
});

test("检查、增强和起草对所有候选使用 180 秒上限，并扣除已用预算", async (t) => {
  const body = "检查并起草一份有明确验收标准的提示词。";
  const time = t.mock.method(Date, "now", () => 100_000);
  const timeouts = [];
  t.mock.method(AbortSignal, "timeout", (ms) => {
    timeouts.push(ms);
    return new AbortController().signal;
  });
  const settings = { aiProvider: "preferred", aiModel: "fake-chat" };
  const scenarios = [
    [() => ai.checkPromptCore(body, settings), { findings: [] }, 180_000, 35_000],
    [() => ai.refinePromptCore(body, settings), { title: "起草", tags: [], summary: "", body }, 0, 180_000],
    [() => ai.draftPromptCore({ idea: body, answers: [] }, settings),
      { kind: "draft", body, assumptions: [] }, 180_000, 35_000],
  ];
  for (const [run, expected, elapsed, fallbackTimeout] of scenarios) {
    timeouts.length = 0;
    const providers = [];
    ai.registerLlm({
      listProviders: () => [{ id: "fallback" }, { id: "preferred" }],
      listModels: async () => [{ id: "fake-chat" }],
      stream({ provider, maxTokens }) {
        providers.push(provider);
        if (provider === "preferred") {
          assert.equal(maxTokens, 8192);
          time.mock.mockImplementation(() => 100_000 + elapsed);
          return fakeStream([{ type: "finish", reason: { kind: "aborted" } }])();
        }
        return fakeStream([JSON.stringify(expected), { type: "finish", reason: { kind: "stop" } }])();
      },
    });
    time.mock.mockImplementation(() => 100_000);
    assert.equal((await run()).ok, true);
    assert.deepEqual(providers, ["preferred", "fallback"]);
    assert.deepEqual(timeouts, [180_000, fallbackTimeout]);
  }
});

test("检查与增强：首选模型仅输出推理时，下一候选关闭推理并返回结果", async () => {
  const body = "只读检查配置，列出发现的问题。";
  for (const [action, expected] of [["check", { findings: [] }], ["refine", { title: "检查配置", tags: [], summary: "", body }]]) {
    const calls = [];
    ai.registerLlm({
      listProviders: () => [{ id: "preferred" }, { id: "fallback" }],
      listModels: async () => [{ id: "fake-chat" }],
      async resolveModelInfo(provider) {
        return provider === "fallback" ? { reasoning: { efforts: [{ id: "off" }, { id: "high" }] } } : {};
      },
      stream({ provider, reasoningEffort, maxTokens }) {
        calls.push({ provider, reasoningEffort, maxTokens });
        return fakeStream(provider === "fallback" && reasoningEffort === "off"
          ? [JSON.stringify(expected), { type: "finish", reason: { kind: "stop" } }]
          : [
              { type: "reasoning-delta", index: 0, text: "模型用尽输出预算前一直在推理" },
              { type: "finish", reason: { kind: "max-tokens" } },
            ])();
      },
    });
    const result = await dispatch("POST", "/ai/" + action, { body });
    assert.deepEqual(result.envelope, { ok: true, data: expected }, action);
    assert.deepEqual(calls.map(({ provider, reasoningEffort }) => [provider, reasoningEffort]),
      [["preferred", undefined], ["fallback", "off"]]);
    assert.ok(calls[0].maxTokens > 4096, "无法关闭推理的模型需要同时容纳推理和正文");
  }
});

test("生产诊断区分模型侧超时、插件超时和输出校验失败，日志不包含草稿或返回原文", async (t) => {
  const logDir = join(process.env.DSH_HOME, "prompt-enhancer", "log");
  rmSync(logDir, { recursive: true, force: true });
  const draft = "PRIVATE_DRAFT_CANARY";
  const response = "PRIVATE_MODEL_TEXT_CANARY";
  const error = "PRIVATE_PROVIDER_ERROR_CANARY";
  const upstream = { type: "finish", reason: { kind: "error", failure: { code: "TIMEOUT", status: 504, message: error } } };
  ai.registerLlm(fakeRuntime([[upstream]]));
  const upstreamResult = await dispatch("POST", "/ai/check", { body: draft });
  assert.deepEqual(upstreamResult.envelope, { ok: false, error: { code: "timeout" } });

  const timeout = t.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  ai.registerLlm({
    ...fakeRuntime([]),
    stream() {
      return fakeStream([response, { type: "finish", reason: { kind: "stop" } }])();
    },
  });
  const invalid = await dispatch("POST", "/ai/refine", { body: draft });
  assert.equal(invalid.envelope.error.code, "schema-mismatch");

  let controller;
  timeout.mock.mockImplementation(() => {
    controller = new AbortController();
    return controller.signal;
  });
  ai.registerLlm({
    ...fakeRuntime([]),
    async *stream() {
      yield { type: "reasoning-delta", index: 0, text: response };
      controller.abort();
      yield { type: "finish", reason: { kind: "aborted", failure: { code: "ABORTED", message: error } } };
    },
  });
  const deadline = await dispatch("POST", "/ai/check", { body: draft });
  assert.equal(deadline.envelope.error.code, "timeout");

  const logs = readdirSync(logDir).filter((name) => /^review-.*\.jsonl$/.test(name))
    .map((name) => readFileSync(join(logDir, name), "utf8")).join("");
  for (const secret of [draft, response, error]) assert.ok(!logs.includes(secret));
  const events = logs.trim().split("\n").map((line) => JSON.parse(line));
  const starts = events.filter(({ event }) => event === "request-start");
  assert.deepEqual(starts.map(({ operation }) => operation), ["check", "refine", "check"]);
  assert.equal(new Set(starts.map(({ id }) => id)).size, 3);
  const records = starts.map(({ id }) => events.filter((entry) => entry.id === id));
  const [upstreamEvents, invalidEvents, deadlineEvents] = records;
  assert.ok(upstreamEvents.some((e) => e.event === "stream-end" && e.finish === "error" &&
    e.failureCode === "TIMEOUT" && e.providerStatus === 504 && !e.deadlineAborted));
  assert.ok(invalidEvents.some((e) => e.event === "candidate-rejected" && e.code === "schema-mismatch" && e.round === 2));
  assert.ok(deadlineEvents.some((e) => e.event === "attempt-deadline" && Number.isFinite(e.firstReasoningMs)));
  assert.ok(deadlineEvents.some((e) => e.event === "stream-end" && e.deadlineAborted && e.failureCode === "ABORTED"));
  for (const request of records) assert.equal(request.at(-1).httpStatus, 503);
});

test("正式构建的润色、起草、搜索和技能描述符均记录请求级诊断", async () => {
  const logDir = join(process.env.DSH_HOME, "prompt-enhancer", "log");
  rmSync(logDir, { recursive: true, force: true });
  const body = "PRIVATE_INPUT_CANARY";
  const stop = { type: "finish", reason: { kind: "stop" } };
  ai.registerLlm(fakeRuntime([
    ["PRIVATE_POLISH_CANARY", stop],
    [JSON.stringify({ kind: "draft", body: "PRIVATE_DRAFT_RESPONSE_CANARY", assumptions: [] }), stop],
    ["无效的描述符", stop],
    [JSON.stringify({ name: "example", description: "Example" }), stop],
  ]));
  for (const [path, input] of [
    ["polish", { body }], ["polish", { body }], ["draft", { idea: body }],
    ["draft/search", { query: body }], ["skill-descriptor", { body }],
  ]) {
    const result = await dispatch("POST", "/ai/" + path, input);
    assert.equal(result.status, 200, path);
  }
  assert.equal((await dispatch("GET", "/ai/providers")).status, 200);
  const log = readdirSync(logDir).filter((name) => /^review-.*\.jsonl$/.test(name))
    .map((name) => readFileSync(join(logDir, name), "utf8")).join("");
  assert.doesNotMatch(log, /PRIVATE_/);
  const events = log.trim().split("\n").map((line) => JSON.parse(line));
  const starts = events.filter(({ event }) => event === "request-start");
  assert.deepEqual(starts.map(({ operation }) => operation),
    ["polish", "polish", "draft", "draft/search", "skill-descriptor", "providers"]);
  const requests = starts.map(({ id }) => events.filter((entry) => entry.id === id));
  for (const request of requests) assert.equal(request.at(-1).httpStatus, 200);
  assert.ok(requests[0].some((e) => e.event === "stream-start" && e.messageCount === 1 && e.temperature === 0.4));
  assert.ok(requests[1].some((e) => e.event === "cache-hit"));
  assert.ok(requests[1].every((e) => e.event !== "stream-start"));
  assert.ok(requests[2].some((e) => e.event === "validation-end" && e.result === "draft"));
  assert.ok(requests[3].some((e) => e.event === "search-end" && e.status === "unavailable"));
  assert.ok(requests[4].some((e) => e.event === "validation-end" && e.round === 1 && e.code === "schema-mismatch"));
  assert.ok(requests[4].some((e) => e.event === "stream-start" && e.round === 2));
  assert.ok(requests[5].some((e) => e.event === "provider-models" && e.models === 1));
});

test("从想法起草：可直接出稿，也可在一轮澄清后带回答或跳过", async () => {
  const direct = { kind: "draft", body: "只读分析构建耗时，列出瓶颈和证据。", assumptions: [] };
  const question = "是否允许修改配置？";
  const clarify = { kind: "clarify", questions: [{ question, options: ["只分析", "允许修改"] }] };
  const skipped = { ...direct, assumptions: ["权限未明确，按只读分析起草。"] };
  const called = [];
  const runtime = fakeRuntime([direct, clarify, direct, skipped].map((value) => [
    JSON.stringify(value), { type: "finish", reason: { kind: "stop" } },
  ]));
  ai.registerLlm({
    ...runtime,
    stream: (options) => {
      called.push(JSON.parse(options.messages[0].content[0].text));
      return runtime.stream();
    },
  });
  const requests = [
    { idea: "只分析构建耗时，列出瓶颈和证据" },
    { idea: "构建很慢" },
    { idea: "构建很慢", answers: [{ question, answer: "只分析" }] },
    { idea: "构建很慢", answers: [{ question, answer: "" }] },
  ];
  for (const [index, expected] of [direct, clarify, direct, skipped].entries()) {
    const report = await dispatch("POST", "/ai/draft", requests[index]);
    assert.equal(report.status, 200);
    assert.deepEqual(report.envelope, { ok: true, data: expected });
  }
  assert.deepEqual(called, requests);
});

test("从想法起草：第二步恢复被截断的 JSON 并保留澄清回答", async () => {
  const idea = "对比两款耳机的价格和降噪";
  const question = "在哪个地区购买？";
  const answers = [{ question, answer: "中国大陆，人民币" }];
  const clarify = { kind: "clarify", questions: [{ question, options: ["中国大陆，人民币"] }] };
  const draft = { kind: "draft", body: "按中国大陆官方人民币价格比较两款耳机，并核实降噪规格。", assumptions: [] };
  const stop = { type: "finish", reason: { kind: "stop" } };
  const requests = [];
  ai.registerLlm({
    ...fakeRuntime([]),
    async resolveModelInfo() {
      return { reasoning: { efforts: [{ id: "off" }], defaultEffort: "high" } };
    },
    stream(options) {
      const input = JSON.parse(options.messages[0].content[0].text);
      requests.push({ input, options });
      if (!input.answers) return fakeStream([JSON.stringify(clarify), stop])();
      if (!input.retryDiagnosis || options.reasoningEffort !== "off" || options.maxTokens <= 2048) {
        return fakeStream(['{"kind":"draft","body":"按中国大陆', { type: "finish", reason: { kind: "max-tokens" } }])();
      }
      return fakeStream([JSON.stringify(draft), stop])();
    },
  });
  const first = await dispatch("POST", "/ai/draft", { idea });
  assert.deepEqual(first.envelope, { ok: true, data: clarify });
  const second = await dispatch("POST", "/ai/draft", { idea, answers });
  assert.deepEqual(second.envelope, { ok: true, data: draft });
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[2].input.answers, answers);
  assert.match(requests[2].input.retryDiagnosis, /schema-mismatch/);
});

test("从想法起草：已回答或跳过后拒绝再次追问", async () => {
  const response = { kind: "clarify", questions: [{ question: "是否允许改文件？", options: [] }] };
  ai.registerLlm(fakeRuntime([[JSON.stringify(response), { type: "finish", reason: { kind: "stop" } }]]));
  const report = await dispatch("POST", "/ai/draft", { idea: "查构建耗时", answers: [] });
  assert.equal(report.status, 503);
  assert.equal(report.envelope.error.code, "schema-mismatch");
});

test("起草与改写：向模型传入执行环境，反馈基于当前编辑稿并跳过澄清", async () => {
  const idea = "分析构建为什么慢";
  const executor = "只读仓库的编程代理，看不到当前聊天";
  const draft = { kind: "draft", body: "只读分析构建耗时。", assumptions: [] };
  const revision = { body: "只读分析构建耗时，优先使用构建日志。", feedback: "最多列三个瓶颈。" };
  const revised = { ...draft, body: "只读使用构建日志分析构建耗时，最多列三个瓶颈。" };
  const clarification = { kind: "clarify", questions: [{ question: "输出多长？", options: [] }] };
  const stop = { type: "finish", reason: { kind: "stop" } };
  const seen = [];
  const runtime = fakeRuntime([draft, clarification, revised].map((output) => [JSON.stringify(output), stop]));
  ai.registerLlm({
    ...runtime,
    stream(options) {
      seen.push({ input: JSON.parse(options.messages[0].content[0].text), system: options.system });
      return runtime.stream();
    },
  });

  const first = await dispatch("POST", "/ai/draft", { idea, executor: ` ${executor} ` });
  assert.deepEqual(first.envelope, { ok: true, data: draft });
  assert.deepEqual(seen[0].input, { idea, executor });
  assert.match(seen[0].system, /执行者实际可见的信息、可用的工具与权限/);

  const second = await dispatch("POST", "/ai/draft", { idea, executor, revision });
  assert.deepEqual(second.envelope, { ok: true, data: revised });
  assert.deepEqual(seen[1].input, { idea, executor, revision });
  assert.match(seen[1].system, /按 revision\.feedback 修改 revision\.body/);
  assert.match(seen[2].input.retryDiagnosis, /schema-mismatch/);
});

test("起草的待补材料保留在正文，检查按原需求和已采用反馈运行", async () => {
  const idea = "总结一段访谈，输出中文要点";
  const executor = "没有联网工具的聊天模型";
  const feedbackHistory = ["交付语言改为英文"];
  const missingInput = "Ask the user to provide the interview transcript.";
  const draft = {
    kind: "draft",
    body: "Summarize the interview in English.",
    understanding: "Summarize an interview in English.",
    assumptions: [],
    missingInputs: [missingInput, missingInput],
  };
  const stop = { type: "finish", reason: { kind: "stop" } };
  const seen = [];
  const runtime = fakeRuntime([
    [JSON.stringify(draft), stop],
    ['{"findings":[]}', stop],
    ['{"findings":[]}', stop],
  ]);
  ai.registerLlm({
    ...runtime,
    stream(options) {
      seen.push(JSON.parse(options.messages[0].content[0].text));
      return runtime.stream();
    },
  });
  const draftContext = { idea, executor, feedbackHistory };
  const result = await dispatch("POST", "/ai/draft", {
    ...draftContext,
    revision: { body: "用英文总结访谈。", feedback: "明确需要提供访谈逐字稿。" },
  });
  const body = draft.body + "\n\n- " + missingInput;
  assert.deepEqual(result.envelope, { ok: true, data: { ...draft, body, missingInputs: [missingInput] } });
  assert.deepEqual(seen[0].feedbackHistory, feedbackHistory);

  for (const input of [{ body }, { body, draftContext }]) {
    const checked = await dispatch("POST", "/ai/check", input);
    assert.deepEqual(checked.envelope, { ok: true, data: { findings: [] } });
  }
  assert.deepEqual(seen.slice(1), [{ body }, { body, draftContext }]);
});

test("检查拒绝把未采用的改写当作起草上下文", async () => {
  const report = await dispatch("POST", "/ai/check", {
    body: "根据访谈逐字稿总结三条要点。",
    draftContext: { idea: "总结访谈", revision: { body: "总结访谈。", feedback: "输出英文版。" } },
  });
  assert.equal(report.status, 400);
});

test("起草拒绝无效的执行环境或改写参数", async (t) => {
  const idea = "分析构建为什么慢";
  for (const [name, fields] of [
    ["执行环境类型错误", { executor: true }],
    ["执行环境过长", { executor: "a".repeat(1001) }],
    ["改写不是对象", { revision: [] }],
    ["正文空白", { revision: { body: " ", feedback: "缩短" } }],
    ["反馈空白", { revision: { body: "分析构建耗时", feedback: " " } }],
    ["反馈过长", { revision: { body: "分析构建耗时", feedback: "a".repeat(2001) } }],
    ["已采用反馈无效", { feedbackHistory: [42] }],
  ]) {
    await t.test(name, async () => {
      const report = await dispatch("POST", "/ai/draft", { idea, ...fields });
      assert.equal(report.status, 400);
    });
  }
});

test("起草核实：只搜索用户关键词，来源可用于起草，搜索不可用时仍可生成", async () => {
  const { registerDraftSearch } = await import("../src/host/draft-search.ts");
  const source = { url: "https://www.apple.com/airpods/compare/", title: "AirPods 官方对比" };
  const query = "AirPods 4 AirPods 5 Apple";
  const verification = "先根据 Apple 官方页面核实 AirPods 5 型号和版本，再比较。";
  const idea = "对比 AirPods 4 和 AirPods 5";
  const references = "价格以中国大陆为准。";
  const seen = [];
  const runtime = fakeRuntime([[JSON.stringify({ kind: "draft", body: idea, assumptions: [], toVerify: [verification] }), { type: "finish", reason: { kind: "stop" } }]]);
  ai.registerLlm({
    ...runtime,
    stream(options) {
      assert.match(options.system, /原样保留用户指定/);
      assert.match(options.system, /外部可查证事实交给执行阶段/);
      seen.push(JSON.parse(options.messages[0].content[0].text));
      return runtime.stream();
    },
  });
  try {
    registerDraftSearch({
      async search(request, signal) {
        assert.deepEqual(request, { query, maxResults: 4 });
        assert.equal(signal.aborted, false);
        return { sources: [source, { url: "javascript:void(0)" }, source] };
      },
    });
    const lookup = await dispatch("POST", "/ai/draft/search", { query, idea: "只发送查询词" });
    assert.deepEqual(lookup.envelope, { ok: true, data: { status: "found", sources: [source] } });
    const fromSources = await dispatch("POST", "/ai/draft", { idea, references, sources: lookup.envelope.data.sources });
    assert.equal(fromSources.status, 200);
    assert.deepEqual(seen[0], { idea, references, sources: [source] });
    assert.deepEqual(fromSources.envelope.data.toVerify, [verification]);
    assert.equal(fromSources.envelope.data.body, idea + "\n\n- " + verification);

    registerDraftSearch({ async search() { throw Object.assign(new Error("missing provider"), { code: "WEB_PROVIDER_UNAVAILABLE" }); } });
    const unavailable = await dispatch("POST", "/ai/draft/search", { query });
    assert.deepEqual(unavailable.envelope, { ok: true, data: { status: "unavailable" } });
    const offline = await dispatch("POST", "/ai/draft", { idea, references });
    assert.equal(offline.status, 200);
    assert.deepEqual(seen[1], { idea, references });
  } finally {
    registerDraftSearch(undefined);
  }
});

// ── 失败形态 → code 映射（真流归因）────────────────────────────────────────

test("归因 timeout：finish=aborted（30s 超时到点）→ 信封 error.code === 'timeout'", async () => {
  ai.registerLlm(fakeRuntime([[{ type: "finish", reason: { kind: "aborted", failure: { code: "aborted", message: "timeout" } } }]]));
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.ok, false);
  assert.equal(out.envelope.error.code, "timeout");
});

test("归因 empty-output：流成功但零文本 → error.code === 'empty-output'", async () => {
  ai.registerLlm(fakeRuntime([[{ type: "finish", reason: { kind: "stop" } }]]));
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "empty-output");
});

test("归因 schema-mismatch：模型回了合法 JSON 但缺 body → /ai/refine error.code === 'schema-mismatch'", async () => {
  ai.registerLlm(fakeRuntime([['{"title":"只有标题","tags":[]}', { type: "finish", reason: { kind: "stop" } }]]));
  const out = await dispatch("POST", "/ai/refine", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "schema-mismatch");
});

test("归因 unknown：流抛错 → error.code === 'unknown'", async () => {
  ai.registerLlm(fakeRuntime([["throw"]]));
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "unknown");
});

// ── 既有形态的 code 化（issue #4 验收 1 的「既有 no-llm / route / parse」）────

test("归因 no-llm：未注入 LLM → error.code === 'no-llm'", async () => {
  ai.registerLlm(undefined);
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "no-llm");
});

test("归因 route：注入了 LLM 但一个 provider 都没有 → error.code === 'route'", async () => {
  ai.registerLlm({ listProviders: () => [], listModels: async () => [], stream: () => fakeStream([])() });
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "route");
});

test("归因 parse（fail:parse 由技能描述符经 parseSkillJson 之外的 JSON 失败路径……本仓归并为 schema-mismatch；此处钉 refine 的合法 JSON + 空 body 同判）", async () => {
  // 说明：refine 的解析（parseRefineResult）对「JSON 合法但 body 缺失」与「根本不是 JSON」
  // 都返回 undefined——本设计统一归因为 schema-mismatch（对客户端而言两者要做的事相同：重试）。
  ai.registerLlm(fakeRuntime([["完全不是 JSON 的闲聊", { type: "finish", reason: { kind: "stop" } }]]));
  const out = await dispatch("POST", "/ai/refine", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "schema-mismatch");
});

// ── 诊断注入重试（端到端：剧本 = 首试空回复，重试成功）──────────────────────

test("诊断重试（端到端）：首试空回复 → 恰好两次调用，重试请求携带上次失败诊断，最终成功", async () => {
  const bodies = [];
  ai.registerLlm({
    listProviders: () => [{ id: "fake", name: "Fake" }],
    listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
    stream: (options) => {
      bodies.push(options.messages[0].content[0].text);
      return fakeStream(bodies.length === 1
        ? [{ type: "finish", reason: { kind: "stop" } }] // 首试：空回复
        : ["{\"title\":\"t\",\"tags\":[],\"summary\":\"s\",\"body\":\"完善正文\"}", { type: "finish", reason: { kind: "stop" } }])(); // 重试：给全字段
    },
  });
  const out = await dispatch("POST", "/ai/refine", { body: "草稿" });
  assert.equal(out.status, 200, "重试成功后应整体成功");
  assert.equal(out.envelope.ok, true);
  assert.equal(out.envelope.data.body, "完善正文");
  assert.equal(bodies.length, 2, "只重试一次：两次模型调用");
  assert.match(JSON.parse(bodies[1]).retryDiagnosis, /empty-output/);
  assert.deepEqual(JSON.parse(bodies[0]), { body: "草稿" });
});

test("诊断重试（端到端）：重试仍失败 → 信封返回最终 code", async () => {
  ai.registerLlm(fakeRuntime([[{ type: "finish", reason: { kind: "aborted", failure: { code: "aborted", message: "timeout" } } }]]));
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.status, 503);
  assert.equal(out.envelope.error.code, "timeout");
});

// ── 成功路径回归：code 化不改变成功信封与 data 形状 ─────────────────────────

test("成功路径回归：/ai/polish data 仍是 {polished}（不泄能力层的 ok 键）；/ai/refine data 仍是四字段", async () => {
  ai.registerLlm({
    listProviders: () => [{ id: "fake", name: "Fake" }],
    listModels: async () => [{ id: "fake-chat", name: "Fake Chat" }],
    stream: (options) => {
      const isPolish = options.system?.startsWith("你是一名专业的提示词润色助手");
      return fakeStream([
        isPolish ? "润色后的正文" : "{\"title\":\"t\",\"tags\":[],\"summary\":\"s\",\"body\":\"正文\"}",
        { type: "finish", reason: { kind: "stop" } },
      ])();
    },
  });
  const polish = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(polish.status, 200);
  assert.deepEqual(polish.envelope.data, { polished: "润色后的正文" });

  const refine = await dispatch("POST", "/ai/refine", { body: "草稿" });
  assert.equal(refine.status, 200);
  assert.deepEqual(refine.envelope.data, { title: "t", tags: [], summary: "s", body: "正文" });
});

// ── dev 诊断 message 门（宿主零文案承诺）───────────────────────────────────

test("信封 error.message：普通 node --test 进程（非 dev 构建）不下发诊断 message", async () => {
  ai.registerLlm(undefined);
  const out = await dispatch("POST", "/ai/polish", { body: "草稿" });
  assert.equal(out.envelope.error.code, "no-llm");
  assert.equal(out.envelope.error.message, undefined, "__DEV__ 为 false 时 message 必须缺省（宿主零文案）");
  assert.deepEqual(Object.keys(out.envelope.error).sort(), ["code"]);
});

test("增强模板从路由返回独立建议，忽略无效条目并去重", async () => {
  const body = "检查 {{提交范围}}。等待确认后提交。";
  ai.registerLlm(fakeRuntime([[
    JSON.stringify({ title: "检查提交范围", tags: ["Git"], summary: "审查提交", body,
      suggestions: [" 回报提交哈希。 ", null, "", "回报提交哈希。"] }),
    { type: "finish", reason: { kind: "stop" } },
  ]]));
  const result = await dispatch("POST", "/ai/refine", { body: "检查 Git 改动，等待确认后提交。" });
  assert.equal(result.status, 200);
  assert.equal(result.envelope.data.body, body);
  assert.deepEqual(result.envelope.data.suggestions, ["回报提交哈希。"]);
});
