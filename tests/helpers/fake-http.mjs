/**
 * 真实分发夹具：假 `IncomingMessage` / `ServerResponse` + 「发一次请求、取回信封」。
 *
 * **为什么提到 helper（R1 必修 1）**：这三样原来在 `tests/meta-delete.test.mjs`、
 * `tests/skill-export-route.test.mjs`、`tests/skills.test.mjs` 里**逐字各抄一份**（`diff -u` 实测三份的
 * 函数体完全相同，只有上方注释不同；第三份正是 T7-2 加路由用例时产生的）。逻辑块逐字重复迟早分叉
 * ——本项目反复栽在同一类事上——故统一到这里，三处只留各自那一行薄包装。
 *
 * 文件后缀是 `.mjs` 而**不是** `.test.mjs`：`node --test` 按 `*.test.*` 收集用例，helper 不该被当用例跑。
 *
 * ⚠️ 这里**刻意不** import `makeRoutes` / `API_PREFIX`（那样对调用方更省事）：本仓的隔离纪律是
 * 「先把 `DSH_HOME` 指向临时目录，**再** import 宿主模块」（见 `tests/meta-delete.test.mjs` 顶部注释），
 * 而 helper 通常被**静态** import——静态 import 的求值早于测试文件体里那句
 * `process.env.DSH_HOME = ...`。故这两样由调用方**注入**，import 顺序仍留在调用方手里。
 */

/**
 * 假 IncomingMessage：既是**事件流**（`on("data"|"end"|"error")`）也是**异步可迭代**
 * ——与真实 `IncomingMessage` 同形，故被测代码换读取通道时夹具不必跟着改。
 *
 * body 形态：
 *   - 字符串 → 原样发送（负样本要用 `1e999` 这类 JSON.parse 后为 Infinity 的字面量，
 *     而 JSON.stringify 对非有限数字只会产出 null，走对象通道送不进去）；
 *   - 对象 → JSON.stringify 后发送；
 *   - **数组 → 逐块发送**（跨 chunk 累计上限只有多块夹具才测得到）。
 *
 * `destroy()` 只**记账**不真拆：真实实现的 destroy 会连底层 socket 一起拆掉，而「响应必须先于
 * 关连接产出」正是要在夹具上断言的不变量（`destroyCalls`）。
 */
export function fakeReq(method, url, body, headers = {}) {
  const parts = (body === undefined ? [] : Array.isArray(body) ? body : [body]).map((one) =>
    Buffer.from(typeof one === "string" ? one : JSON.stringify(one), "utf8"),
  );
  const listeners = new Map([["data", new Set()], ["end", new Set()], ["error", new Set()]]);
  const req = {
    method,
    url,
    headers,
    /** 真实 destroy 会拆 socket；夹具只记账，供「超限响应先于关连接」断言。 */
    destroyCalls: 0,
    paused: false,
    destroy() { req.destroyCalls++; },
    pause() { req.paused = true; },
    on(type, fn) { listeners.get(type)?.add(fn); return req; },
    off(type, fn) { listeners.get(type)?.delete(fn); return req; },
    async *[Symbol.asyncIterator]() {
      for (const part of parts) yield part;
    },
  };
  // 监听器由 handler **同步**挂上，故投喂放微任务：不早于挂载，也不引入定时器。
  queueMicrotask(() => {
    for (const part of parts) {
      if (req.paused) return; // 超限路径：pause 之后不再投喂剩余块
      for (const fn of [...listeners.get("data")]) fn(part);
    }
    for (const fn of [...listeners.get("end")]) fn();
  });
  return req;
}

/** 假 ServerResponse：只实现分发层真正用到的三件事。 */
export function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(chunk) {
      this.body = chunk;
    },
  };
}

/**
 * 造一个「真跑一次分发」的调用器（`makeRoutes` / `API_PREFIX` 由调用方注入，见文件头）。
 * 返回的 `dispatch(method, path, body)`：`path` 相对 `API_PREFIX`，返回 `{ status, envelope }`
 * ——与三处原实现**逐字同形**（含 `JSON.parse(res.body)`），故调用方的断言不受影响。
 */
export function makeDispatch({ makeRoutes, API_PREFIX }) {
  return async function dispatch(method, path, body, headers = {}) {
    const res = fakeRes();
    await makeRoutes()[0].handler(fakeReq(method, API_PREFIX + path, body, headers), res);
    return { status: res.statusCode, envelope: JSON.parse(res.body) };
  };
}
