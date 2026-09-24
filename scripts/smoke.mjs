// 构建产物校验。刻意不依赖 dsh 宿主：在受控沙箱中真实执行 client bundle，
// 验证它注册的模块 id 与 factory 返回形状——这是加载器唯一的契约面。
//
// 用法：npm run build && npm run smoke
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

let failures = 0;
const ok = (m) => console.log("smoke: ok   " + m);
const fail = (m) => { failures++; console.error("smoke: FAIL " + m); };

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

  // 客户端产物必须真的注册了本轮的两个座位（防止「构建成功但插槽没进去」）
  for (const slot of ["conversation.input.left", "conversation.input.overlay"]) {
    if (!clientSrc.includes(slot)) fail("lib/client.js 未注册插槽 " + slot);
    else ok("lib/client.js 注册插槽 " + slot);
  }
  // i18n 断言必须同时看到「命名空间常量」与「把该常量交给 register」：裸子串检查会被
  // 插槽选项里的 locale: NS 误判为通过（NS 的字符串值在那里也出现）。
  // 常量名不写死：直接从 bundle 里 shape 出保存 NS 值的那个标识符。
  const nsConst = clientSrc.match(/var ([A-Za-z_$][\w$]*) = "prompt-enhancer"/);
  if (nsConst === null) fail("lib/client.js 未见值为 prompt-enhancer 的命名空间常量");
  else if (!new RegExp("\\.register\\(\\s*" + nsConst[1] + "\\b").test(clientSrc)) {
    fail("lib/client.js 定义了命名空间常量 " + nsConst[1] + " 却未用它注册字典（register 调用缺失）");
  } else ok("lib/client.js 注册 i18n 命名空间 prompt-enhancer");

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
