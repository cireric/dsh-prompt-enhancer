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
import { sourceHash } from "./source-hash.mjs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const PLUGIN_ID = pkg.name;
const PLUGIN_VERSION = pkg.version;
const IS_DEV = process.argv.includes("--dev");

// 先建到**临时暂存目录**，全部成功后再整体替换 `lib/`（审查遗留项）。
//
// 为什么：`lib/` 纳入版本控制（硬约束 7），旧写法是「先删空 lib/ 再构建」——中途失败（esbuild
// 报错 / 契约闸门拦下 / 磁盘满）会把**已跟踪的产物从工作区删掉**，工作树当场变脏且不可诊断。
// 2026-10-03 现场踩过一次：验证 external 闸门时构建失败，`lib/index.js` 与 `lib/client.js` 一起消失。
// 暂存目录与 lib/ 同盘，故最后一步 `rename` 是原子的：要么整套新产物，要么原样不动。
const libDir = join(root, "lib");
const stageDir = join(root, ".build-stage");
await rm(stageDir, { recursive: true, force: true });
await mkdir(stageDir, { recursive: true });

// React 与 @deepseek-ai/* 由 DSH host / 模块加载器在运行时解析——绝不打包（硬约束 4）。
//
// 用**前缀规则**而不是逐条包名（2026-10-03 审查）：包名清单会漏**子路径**（`@deepseek-ai/x/client`，
// external 是精确匹配，包名条目盖不住它）与将来的新包——漏掉的那一刻 esbuild 不报错，只会把宿主包
// 静默打进产物。规则走 onResolve 插件：JS API 的 `external` 选项**只接受字符串**
// （传 RegExp 直接抛 `"external" must be an array of strings`，实测），且 onResolve 天然覆盖子路径。
// 规则被改窄时由 assertOnlyOwnSources 兜住（见下）。
const HOST_PACKAGE_RE = /^(react$|react\/jsx-runtime$|react-dom$|@deepseek-ai\/)/;

/** 命中即 external：交给宿主 / 模块加载器在运行时解析。 */
const externalizeHostPackages = {
  name: "externalize-host-packages",
  setup(build) {
    build.onResolve({ filter: HOST_PACKAGE_RE }, (args) => ({ path: args.path, external: true }));
  },
};

/**
 * 硬约束 4 的**可执行闸门**：产物只能由本仓 `src/` 组成。
 *
 * ⚠️ 为什么按 metafile 而不是按路径正则 / 扫产物文本（2026-10-03 实测教训）：
 * 本机 `link-dsh-deps` 把悬空的 @deepseek-ai/* 指到 checkout 的真实源码，esbuild 又按 **realpath**
 * 结算——违规构建里那 27 个输入长这样：`../../deepseek-harness/vendor/cordis/src/fiber.ts`，
 * **路径里既没有 node_modules 也没有 @deepseek-ai**。按路径写的 onLoad 闸门在这里完全瞎
 * （先写完跑了一遍变异：摘掉 external 规则后构建照样成功，产物里躺着 BlockAssembler）。
 * metafile 给的是 esbuild 真正读过的输入，与符号链接怎么指无关。
 */
function assertOnlyOwnSources(metafile, artifact) {
  const foreign = Object.keys(metafile.inputs).filter((path) => !path.startsWith("src/"));
  if (foreign.length > 0) {
    throw new Error(
      artifact + " 打进了 " + foreign.length + " 个仓外输入（硬约束 4：react / react/jsx-runtime / "
      + "@deepseek-ai/* 一律 external）：\n  " + foreign.slice(0, 8).join("\n  "),
    );
  }
}

const define = {
  __PLUGIN_VERSION__: JSON.stringify(PLUGIN_VERSION),
  __DEV__: String(IS_DEV),
};

// --- 1) host 入口：lib/index.js（Node ESM） ---
const hostBuild = await esbuildBuild({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(stageDir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  plugins: [externalizeHostPackages],
  define,
  sourcemap: true,
  metafile: true,
  logLevel: "info",
});
assertOnlyOwnSources(hostBuild.metafile, "lib/index.js");

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

const clientBuild = await esbuildBuild({
  entryPoints: [join(root, "src/client/index.ts")],
  outfile: join(stageDir, "client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  plugins: [externalizeHostPackages],
  define,
  banner: { js: clientBanner },
  footer: { js: clientFooter },
  sourcemap: true,
  metafile: true,
  logLevel: "info",
});
assertOnlyOwnSources(clientBuild.metafile, "lib/client.js");

// 源码指纹写进构建元数据：smoke 拿它比对产物与 src 是否同代（见 source-hash.mjs 的文件头）。
const sources = await sourceHash(root);

await writeFile(
  join(stageDir, ".build-meta.json"),
  JSON.stringify(
    { id: PLUGIN_ID, version: PLUGIN_VERSION, builtAt: new Date().toISOString(), sources },
    null,
    2,
  ) + "\n",
);

// 到这里两个 bundle 与元数据都已落盘且闸门都过了 ⇒ 才动 lib/：一次性换掉，不留半新半旧。
await rm(libDir, { recursive: true, force: true });
await rename(stageDir, libDir);

console.log("build: done (lib/index.js, lib/client.js; sources " + sources + ")");
