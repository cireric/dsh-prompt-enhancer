// 用 esbuild 构建 dsh-prompt-enhancer。
// 产物：
//   lib/index.js   — host 入口（Node ESM）；@deepseek-ai/* 保持 external。
//   lib/client.js  — 浏览器入口，DSH 客户端模块格式：
//                    window.__ModuleLoader__.load({ id, factory: (require) => {...} })
//
// 客户端模块 id 必须与 DSH 加载器校验的 id 一致：loader entry 的 id 取自
// cordis entry.options.name，即完整包名。故从 package.json.name 派生（唯一事实来源）。
//
// 契约来源：DSH 官方 client bundle 构建器 packages/client/tsdown.client.ts
//（`window.__ModuleLoader__.load({ id: <包名>, factory: (require) => {`）。
import { build as esbuildBuild } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const PLUGIN_ID = pkg.name;
const PLUGIN_VERSION = pkg.version;
const IS_DEV = process.argv.includes("--dev");

const libDir = join(root, "lib");
await rm(libDir, { recursive: true, force: true });
await mkdir(libDir, { recursive: true });

// React 与 @deepseek-ai/* 由 DSH host / 模块加载器在运行时解析——绝不打包。
const external = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-host-webserver",
  "@deepseek-ai/dsh-llm",
  "@deepseek-ai/dsh-client-runtime",
  "@deepseek-ai/dsh-client-runtime/client",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-conversation",
  "@deepseek-ai/dsh-client-ui-primitives",
];

const define = {
  __PLUGIN_VERSION__: JSON.stringify(PLUGIN_VERSION),
  __DEV__: String(IS_DEV),
};

// --- 1) host 入口：lib/index.js（Node ESM） ---
await esbuildBuild({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(libDir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external,
  define,
  sourcemap: true,
  logLevel: "info",
});

// --- 2) client 入口：lib/client.js（DSH __ModuleLoader__ 格式） ---
// bundle 是 CJS：它的 require(...) 与 module.exports 变成对包装器提供的
// require / module / exports 局部变量的引用——正是加载器传给 factory 的东西。
const clientBanner = [
  "window.__ModuleLoader__.load({",
  "  id: " + JSON.stringify(PLUGIN_ID) + ",",
  "  factory: (require) => {",
  "    var module = { exports: {} };",
  "    var exports = module.exports;",
].join("\n");

// esbuild 的 CJS interop 产出带 getter 的 __toCommonJS 对象；加载器需要
// apply / inject 是直接值。bundle 在同一 factory 作用域里声明了
// function apply 与 var inject，故在 footer 重新赋值即得到纯净对象。
const clientFooter = [
  "    module.exports = { apply, inject };",
  "    return module.exports;",
  "  }",
  "});",
  "",
].join("\n");

await esbuildBuild({
  entryPoints: [join(root, "src/client/index.ts")],
  outfile: join(libDir, "client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  external,
  define,
  banner: { js: clientBanner },
  footer: { js: clientFooter },
  sourcemap: true,
  logLevel: "info",
});

await writeFile(
  join(libDir, ".build-meta.json"),
  JSON.stringify(
    { id: PLUGIN_ID, version: PLUGIN_VERSION, builtAt: new Date().toISOString() },
    null,
    2,
  ) + "\n",
);

console.log("build: done (lib/index.js, lib/client.js)");
