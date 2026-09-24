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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

/** 客户端 i18n 命名空间（规格 §7.4；与 src/client/utils/i18n.ts 的 NS 同值）。 */
const NS = "prompt-enhancer";

/** 期望的注册账本：按注册顺序的 [name, id, order]（规格 §7.1）。 */
const EXPECTED_SLOTS = [
  ["conversation.input.left", "prompt-enhancer", 10],
  ["conversation.input.overlay", "prompt-enhancer-hash", 20],
  ["conversation.input.left", "prompt-enhancer-ai-polish", 11],
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
            const locale = { register: (ns, dicts) => { records.push(["locale", ns, dicts]); } };
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
}

console.log(failures === 0 ? "smoke: PASSED" : "smoke: FAILED（" + failures + " 项）");
process.exitCode = failures === 0 ? 0 : 1;
