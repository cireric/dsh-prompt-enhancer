// 构建产物校验。刻意不依赖 dsh 宿主：在受控沙箱中真实执行 client bundle，
// 验证它注册的模块 id 与 factory 返回形状——这是加载器唯一的契约面。
//
// 插槽部分为**行为断言**：把 apply() 交给一个记录调用的假 ctx 真跑一遍，
// 断言它注册了哪些座位、组件是否为函数、是否接线成对、字典键集是否对齐。
// 不再扫描源码文本形状（旧正则会被注入面里的同一字面量误判为通过）。
//
// 用法：npm run build && npm run smoke
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sourceHash } from "./source-hash.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

/** 客户端 i18n 命名空间（规格 §7.4；与 src/client/utils/i18n.ts 的 NS 同值）。 */
const NS = "prompt-enhancer";

/** 期望的注册账本：按注册顺序的 [name, id, order]（规格 §7.1）。 */
const EXPECTED_SLOTS = [
  ["conversation.input.left", "prompt-enhancer", 10],
  ["conversation.input.overlay", "prompt-enhancer-hash", 20],
  ["conversation.input.left", "prompt-enhancer-ai-polish", 11],
  // P6 T2 追加的两个 root 座位：弹窗宿主（root 作用域 → 无会话也能开面板）与左栏入口。
  ["shell.overlay", "prompt-enhancer", 100],
  ["sidebar.footer.action", "prompt-enhancer", 100],
  // P8 T3 追加：composer 上方的上下文推荐条。order 是 10，但注册在 P8 T3 时代的末尾
  // （T4 的 settings.section 接在它后面）——本账本是**注册顺序**，不是 order 排序。
  ["conversation.input.dock", "prompt-enhancer-recommend", 10],
  // P8 T4 追加：宿主设置面板里本插件的一页（P8 路线图的最后一个座位；order 30 排在 Models(10) 之后）。
  ["settings.section", "prompt-enhancer", 30],
];

let failures = 0;
const ok = (m) => console.log("smoke: ok   " + m);
const fail = (m) => { failures++; console.error("smoke: FAIL " + m); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- 1) host 产物：lib/index.js ----------
const hostPath = join(root, "lib", "index.js");
if (!(await stat(hostPath).catch(() => null))) {
  fail("lib/index.js 不存在（先运行 npm run build）");
} else {
  const mod = await import(pathToFileURL(hostPath).href);
  if (mod.name !== "prompt-enhancer") fail("lib/index.js 的 name 应为 prompt-enhancer，实为 " + String(mod.name));
  else ok("lib/index.js name = prompt-enhancer");
  if (typeof mod.apply !== "function") fail("lib/index.js 未导出 apply 函数");
  else ok("lib/index.js 导出 apply 函数");
}

// ---------- 2) client 产物：lib/client.js ----------
const clientSrc = await readFile(join(root, "lib", "client.js"), "utf8").catch(() => null);
if (clientSrc === null) {
  fail("lib/client.js 不存在（先运行 npm run build）");
} else {
  if (!clientSrc.includes("window.__ModuleLoader__.load(")) fail("lib/client.js 未调用 window.__ModuleLoader__.load");
  else ok("lib/client.js 调用 __ModuleLoader__.load");

  if (!clientSrc.includes("module.exports = { apply, inject };")) {
    fail("lib/client.js 缺少纯净的 { apply, inject } 导出重写（检查 build.mjs 的 footer）");
  } else ok("lib/client.js 含 { apply, inject } 导出重写");

  // 硬约束 4 的第二道闸（build.mjs 的 forbidBundledDshPackages 是第一道）：产物里不得出现
  // 宿主包的运行时 require——它们必须由加载器在运行时解析，打进产物即版本耦合。
  if (/require\(\s*["']@deepseek-ai\//.test(clientSrc)) {
    fail("lib/client.js 出现 @deepseek-ai/* 的运行时 require（宿主包必须 external）");
  } else ok("lib/client.js 无 @deepseek-ai/* 运行时 require");

  // 在受控沙箱中真实执行 bundle，捕获 __ModuleLoader__.load 的入参
  let captured = null;
  const fakeWindow = { __ModuleLoader__: { load: (entry) => { captured = entry; } } };
  // react / @deepseek-ai/* 由宿主的模块表在运行时解析（宿主 require 是同步查表：
  // seed → 已物化记录 → 已注册 factory，见 dsh-client-modules 的 makeRequire）。
  // P1 的零 import 入口在此只需一个「不请求任何外部模块」的 require；P4 起入口真的
  // 引入 React 组件，故这里按 external 清单给出最小桩，其余裸模块名一律报错。
  const fakeRequire = (id) => {
    if (id === "react" || id === "react/jsx-runtime") return { createElement: () => null };
    throw new Error("smoke: 意外的外部模块请求（" + id + "）——不在 P1 契约的 external 清单里");
  };

  try {
    new Function("window", clientSrc)(fakeWindow);
  } catch (e) {
    fail("执行 lib/client.js 抛错：" + (e instanceof Error ? e.message : String(e)));
  }

  if (!captured) {
    fail("lib/client.js 执行后未调用 __ModuleLoader__.load");
  } else {
    if (captured.id !== pkg.name) fail("bundle 注册的 id 应为 " + pkg.name + "，实为 " + String(captured.id));
    else ok("bundle 注册 id = " + pkg.name);

    if (typeof captured.factory !== "function") {
      fail("bundle 的 factory 不是函数");
    } else {
      let exported;
      try {
        exported = captured.factory(fakeRequire);
      } catch (e) {
        fail("factory 执行抛错：" + (e instanceof Error ? e.message : String(e)));
      }
      if (exported) {
        if (typeof exported.apply !== "function") fail("factory 返回的对象缺少 apply 函数");
        else ok("factory 返回 { apply } 且为函数");
        if (!Array.isArray(exported.inject)) fail("factory 返回的对象缺少 inject 数组");
        else ok("factory 返回 { inject } 且为数组（" + exported.inject.length + " 项）");

        // 硬约束 6「systemPrompt section 恒为 0 / 不新增 inject 项」的可执行证据。
        if (!same(exported.inject, ["slots", "locale"])) {
          fail('exported.inject 应 deep-equal ["slots","locale"]，实为 ' + JSON.stringify(exported.inject));
        } else ok('exported.inject deep-equal ["slots","locale"]');

        // ---------- 2.1) 行为断言：真跑 apply()，记录它调了什么 ----------
        if (typeof exported.apply !== "function") {
          fail("无法执行 apply()：导出缺少 apply 函数（上述插槽断言不可达）");
        } else {
          function runApply() {
            const records = [];
            // ctx 与 scope 上的 locale.register 都记同一笔：apply() 在根 ctx 的 effect 里
            // 注册字典（inject = ["slots","locale"] 保证它存在），scope 上也留一份以防改写。
            // P8 T4（F-8）：apply() 顶部取 `const t = ctx.locale.bind(NS)` 供 settings.section 的
            // label thunk 用（宿主契约 `ctx.locale.bind(ns) → Translate`，证据
            // packages/client/locale/src/client/index.ts:429-444）。假 ctx 必须给出同一形状，否则
            // apply() 直接抛。返回的翻译函数把**命名空间**拼进结果（`<ns>:<key>`），下面据此断言
            // label thunk 走的确实是**绑到本命名空间**的 t——不是某个常量、也不是别处的 t。
            const locale = {
              register: (ns, dicts) => { records.push(["locale", ns, dicts]); },
              bind: (ns) => (key) => ns + ":" + key,
            };
            const makeScope = () => ({
              slots: {
                inject: (name, cb) => { records.push(["inject", name]); cb(); },
                register: (opts, comp) => { records.push(["register", opts, comp]); },
              },
              locale,
            });
            const fakeCtx = {
              effect: (fn) => {
                const dispose = fn();
                return typeof dispose === "function" ? dispose : () => {};
              },
              inject: (deps, cb) => { records.push(["injectDeps", deps]); cb(makeScope()); },
              locale,
            };
            return { records, fakeCtx };
          }

          const { records, fakeCtx } = runApply();
          try {
            exported.apply(fakeCtx);
          } catch (e) {
            fail("apply(fakeCtx) 抛错：" + (e instanceof Error ? e.message : String(e)));
          }

          // 1) 注册账本：条数、顺序、[name, id, order] 三元组
          const register = records.filter((rec) => rec[0] === "register");
          const ledger = register.map((rec) => [rec[1].name, rec[1].id, rec[1].order]);
          if (!same(ledger, EXPECTED_SLOTS)) {
            fail(
              "register 账本不符（应为按注册顺序的 [name,id,order]）\n" +
                "      期望 " + JSON.stringify(EXPECTED_SLOTS) + "\n" +
                "      实为 " + JSON.stringify(ledger),
            );
          } else ok("register " + ledger.length + " 条账本逐条相符 " + JSON.stringify(ledger));

          // 1b) settings.section 的 label 必须是**函数 thunk**（F-8：宿主每次读 label 都重求值 ⇒
          //     语言切换后左栏导航行自动跟随，无需重注册）。账本的 [name,id,order] 三元组看不见 label，
          //     故单列一条：thunk 的求值结果必须带本命名空间前缀（假 bind 拼 `<ns>:<key>`）
          //     ⇒ 一条断言同时钉住「是函数」与「用的是绑到本命名空间的 t」。
          const section = register.find((rec) => rec[1].name === "settings.section");
          if (!section) {
            fail("账本缺少 settings.section 座位（设置页未注册）");
          } else if (typeof section[1].label !== "function") {
            fail("settings.section 的 label 必须是函数 thunk，实为 " + typeof section[1].label);
          } else if (section[1].label() !== NS + ":settings.nav") {
            fail(
              'settings.section 的 label thunk 应求值为 "' + NS + ':settings.nav"，实为 ' +
                JSON.stringify(section[1].label()),
            );
          } else ok("settings.section 的 label 是绑到 " + NS + " 的 thunk（求值 = " + NS + ":settings.nav）");

          // 2) 每条都是 function 组件且带 locale
          const before = failures;
          for (const [, opts, comp] of register) {
            const label = String(opts.id) + "（" + String(opts.name) + "）";
            if (typeof comp !== "function") fail("座位 " + label + " 的组件不是 function，实为 " + typeof comp);
            if (opts.locale !== NS) fail("座位 " + label + " 的 locale 应为 " + NS + "，实为 " + String(opts.locale));
          }
          if (failures === before && register.length > 0) {
            ok("每条 register 的组件均为 function、locale = " + NS);
          }

          // 3) 接线成对：**按注册顺序**逐条配对。本插件有两处同名座位
          //    （conversation.input.left × 2），用「该 name 出现在某条 inject 里」这种集合判定
          //    会让第二处座位接到哪条 inject 上不受检查（评审已用变异实测到该漏网）。
          const injects = records.filter((rec) => rec[0] === "inject").map((rec) => rec[1]);
          const registeredNames = register.map((rec) => rec[1].name);
          if (injects.length !== registeredNames.length) {
            fail(
              "inject 与 register 条数不等：inject " + injects.length + " 条 / register " + registeredNames.length + " 条",
            );
          } else if (!same(injects, registeredNames)) {
            fail(
              "接线未成对（按注册顺序应 injects[i] === register[i].name）\n" +
                "      期望 " + JSON.stringify(registeredNames) + "\n" +
                "      实为 " + JSON.stringify(injects),
            );
          } else ok("接线成对：injects 与 register 按注册顺序逐条同名（" + injects.length + " 对）");

          // 3b) 每条 inject 的座位名都必须有对应 register —— 座位名拼错（宿主侧静默不渲染）在此暴露。
          const unregistered = injects.filter((name) => !registeredNames.includes(name));
          if (unregistered.length > 0) fail("有 inject 未配对到任何 register：" + JSON.stringify(unregistered));
          else if (injects.length > 0) ok("每条 inject 的座位名都有对应 register");

          // 3c) 目录能力、聊天快照与设置真源走**条件注入**（P6 裁决 R2 / P8 T1 / P8 T3 /
          //     硬约束「inject 导出数组不扩张」）：根 ctx 的 inject 调用逐条记录在此，**顺序即账本顺序**。
          //     T3 起 ["uiConversation"] 插在 ["uiWorkspace"] 与设置段之间（P8 计划 T1 步骤 13 定的
          //     段序）；dsh 0.2.0 起设置段是 ["configForms"]（settingsScope 已退役）。
          //     假 scope 没有 uiWorkspace / uiConversation / configForms，故这条同时覆盖
          //     「服务缺席时安全降级」的路径。
          const injectDeps = records.filter((rec) => rec[0] === "injectDeps").map((rec) => rec[1]);
          // dsh 0.2.0：客户端设置真源从 settingsScope（0.1.5）改为 configForms（ConfigForms.get(entryId)）。
          const EXPECTED_INJECT_DEPS = [["slots"], ["uiWorkspace"], ["uiConversation"], ["configForms"]];
          if (!same(injectDeps, EXPECTED_INJECT_DEPS)) {
            fail(
              "ctx.inject 依赖记录不符（期望按调用顺序）\n" +
                "      期望 " + JSON.stringify(EXPECTED_INJECT_DEPS) + "\n" +
                "      实为 " + JSON.stringify(injectDeps),
            );
          } else ok('ctx.inject 记录 deep-equal [["slots"],["uiWorkspace"],["uiConversation"],["configForms"]]（导出数组仍为 ["slots","locale"]）');

          // 4) 字典注册恰好 1 次，且 zh / en 键集相等且非空
          const locale = records.filter((rec) => rec[0] === "locale");
          if (locale.length !== 1) {
            fail("locale.register 应恰好 1 条，实为 " + locale.length);
          } else {
            const [, ns, dicts] = locale[0];
            const zhKeys = Object.keys(dicts && dicts.zh ? dicts.zh : {}).sort();
            const enKeys = Object.keys(dicts && dicts.en ? dicts.en : {}).sort();
            const onlyZh = zhKeys.filter((k) => !enKeys.includes(k));
            const onlyEn = enKeys.filter((k) => !zhKeys.includes(k));
            if (ns !== NS) fail("locale.register 的命名空间应为 " + NS + "，实为 " + String(ns));
            else if (zhKeys.length === 0 || enKeys.length === 0) {
              fail("locale 字典为空（zh " + zhKeys.length + " 键 / en " + enKeys.length + " 键）");
            } else if (onlyZh.length > 0 || onlyEn.length > 0) {
              fail("zh/en 字典键集不等：仅 zh 有 " + JSON.stringify(onlyZh) + "，仅 en 有 " + JSON.stringify(onlyEn));
            } else ok("locale.register(" + NS + ") 恰好 1 次，zh/en 键集相等且非空（" + zhKeys.length + " 键）");
          }
        }
      }
    }
  }
}

// ---------- 2.5) host 行为断言：假 ctx 真跑 apply()（审查 #10-②）----------
// 为什么必须有：本仓的 host 入口在此前**从未被任何自动化执行过**——smoke 只 import 产物并断言
// name / typeof apply，于是「路由注册与卸载、两条 ctx.inject、volatile-update 监听、设置面绑定」
// 全部无判据（client 侧早有同款账本，host 侧是缺口）。
// 假 ctx 只实现 apply 真正用到的方法：一旦它开始注册别的东西（比如 systemPrompt section，
// 硬约束 2 的零 section 承诺），这里会因为调用了不存在的方法而**直接炸**。
// 自带一次 import：section 1 的 mod 是块级作用域，这里取不到。
const hostMod = await import(pathToFileURL(join(root, "lib", "index.js")).href).catch(() => null);
if (hostMod !== null && typeof hostMod.apply === "function") {
  const calls = [];
  const disposers = [];
  // 假 Config 直接由**产物导出的 Config** 解析而来（13 个 volatile 引用，与宿主真实形状一致）。
  const fakeConfig = hostMod.Config({});
  const fakeCtx = {
    inject(deps, callback) {
      calls.push(["inject", deps.join(",")]);
      // 只给 apply 真正要的服务：llm（可以为空）与 webServer（记录注册的路由）
      const scope = {
        llm: undefined,
        effect(fn, name) {
          calls.push(["effect", name]);
          const dispose = fn();
          disposers.push(typeof dispose === "function" ? dispose : () => {});
          return typeof dispose === "function" ? dispose : () => {};
        },
        webServer: {
          register(route) {
            calls.push(["register", route.kind + " " + route.path]);
            return () => {};
          },
        },
      };
      callback(scope);
    },
    on(event, handler) {
      calls.push(["on", event + " " + (typeof handler === "function" ? "fn" : "?")]);
    },
    effect(fn, name) {
      calls.push(["effect", name]);
      const dispose = fn();
      disposers.push(typeof dispose === "function" ? dispose : () => {});
      return typeof dispose === "function" ? dispose : () => {};
    },
  };
  try {
    hostMod.apply(fakeCtx, fakeConfig);
    ok("host apply() 在假 ctx 上执行成功（无异常）");
  } catch (e) {
    fail("host apply(fakeCtx) 抛错：" + (e instanceof Error ? e.message : String(e)));
  }

  const kinds = calls.map((c) => c[0] + (c[1] !== undefined ? ":" + c[1] : ""));
  // 顺序按 src/index.ts 的 apply() 逐条列：webServer 的 inject 回调里挂着 routes effect，
  // 那条 effect 里注册路由——账本把「谁在谁里面」也一并钉住。
  const wantOrder = [
    "inject:llm",
    "inject:webServer",
    "effect:prompt-enhancer: routes",
    "register:prefix /api/prompt-enhancer",
    "on:loader/volatile-update fn",
    "effect:prompt-enhancer: lifecycle",
  ];
  if (!same(kinds, wantOrder)) {
    fail("host 装配账本不符（应为 inject llm → inject webServer → on volatile-update → effect lifecycle）\n"
      + "      期望 " + JSON.stringify(wantOrder) + "\n      实为 " + JSON.stringify(kinds));
  } else ok("host 装配账本逐条相符 " + JSON.stringify(kinds));

  const registers = calls.filter((c) => c[0] === "register");
  if (registers.length !== 1 || registers[0][1] !== "prefix " + "/api/prompt-enhancer") {
    fail("host 应恰好注册 1 条 prefix 路由 /api/prompt-enhancer，实为 " + JSON.stringify(registers));
  } else ok("host 注册 1 条 prefix 路由 /api/prompt-enhancer（20+ 条子路由由该 handler 分发）");

  // 卸载路径：apply 期间 ctx.effect 返回的 dispose 全部可调用且不抛（fiber 卸载即走这里）
  const before = failures;
  for (const dispose of disposers) {
    try { dispose(); } catch (e) { fail("host 卸载回调抛错：" + (e instanceof Error ? e.message : String(e))); }
  }
  if (failures === before) ok("host 卸载回调可调用且不抛（" + disposers.length + " 个）");
}

// ---------- 3) cordis.patch.yml 与包名一致 ----------
const patch = await readFile(join(root, "cordis.patch.yml"), "utf8").catch(() => null);
if (patch === null) {
  fail("cordis.patch.yml 不存在");
} else {
  const m = patch.match(/name:\s*'([^']+)'/);
  if (!m || m[1] !== pkg.name) fail("cordis.patch.yml 的 name 应为 " + pkg.name + "，实为 " + (m ? m[1] : "(未找到)"));
  else ok("cordis.patch.yml name = " + pkg.name);
}

// ---------- 4) 构建元数据 ----------
const meta = await readFile(join(root, "lib", ".build-meta.json"), "utf8").catch(() => null);
if (meta === null) {
  fail("lib/.build-meta.json 不存在");
} else {
  const parsed = JSON.parse(meta);
  if (parsed.id !== pkg.name) fail("lib/.build-meta.json 的 id 与包名不一致");
  else ok("lib/.build-meta.json id = " + pkg.name);

  // 产物必须与**当前** src 同代：改完 src 不重建就跑 smoke，这里必须红
  // （提交一份旧 lib 是本仓唯一能骗过其它所有闸门的失效模式）。
  const expected = await sourceHash(root);
  if (parsed.sources === undefined) {
    fail("lib/.build-meta.json 缺少 sources 指纹（旧版产物？先 npm run build）");
  } else if (parsed.sources !== expected) {
    fail("lib 与 src 不同步：产物指纹 " + parsed.sources + " ≠ 当前 src " + expected + "（先 npm run build）");
  } else ok("lib 与 src 同步（源码指纹 " + expected + "）");
}

console.log(failures === 0 ? "smoke: PASSED" : "smoke: FAILED（" + failures + " 项）");
process.exitCode = failures === 0 ? 0 : 1;
