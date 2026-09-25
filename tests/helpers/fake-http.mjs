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

/** 假 IncomingMessage：`readBody` 用 `for await` 读它，故实现 async 迭代器。 */
export function fakeReq(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")];
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
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
  return async function dispatch(method, path, body) {
    const res = fakeRes();
    await makeRoutes()[0].handler(fakeReq(method, API_PREFIX + path, body), res);
    return { status: res.statusCode, envelope: JSON.parse(res.body) };
  };
}
