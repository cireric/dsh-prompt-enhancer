# dsh-prompt-enhancer P1：骨架与构建契约 实施计划

> **面向 Agent 执行者：** 必需子技能：使用 superpower-subagent-driven-development（推荐）或 superpower-executing-plans 按任务逐项执行本计划。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 交付一个**能被 `dsh web` 成功加载的空插件**（host + client 双产物），并把构建契约、模块 id、产物形状固化成可重复运行的校验。

**架构：** 用 esbuild 产出两个文件：`lib/index.js`（host，Node ESM，`@deepseek-ai/*` 全 external）与 `lib/client.js`（浏览器，包在 `window.__ModuleLoader__.load({ id, factory })` 里，id 由 `package.json.name` 派生）。host 与 client 各自只导出 `name`/`inject`/`apply`，不做任何业务。`scripts/smoke.mjs` **在受控沙箱中真实执行 client bundle**，验证它注册的 id 与 factory 返回形状。

**技术栈：** Node ≥ 22.19（实测 v24.19.0）、esbuild、TypeScript（仅类型检查，不产出）、PowerShell（Windows）。

**规格：** `docs/superpowers/specs/2026-09-24-dsh-prompt-enhancer-design.md`（**已定稿，权威**）。执行前必须同时阅读规格 §3.1（双入口与构建）、§7.1（插槽注册）、§2.2（不做清单）、§10（许可与署名）。

## 全局约束

- 项目根目录：`.（本仓库根，即 dsh-prompt-enhancer/）` —— **本文档所有路径均为项目根相对路径**；所有命令默认以项目根为当前工作目录（不再 `cd` 到绝对路径）
- 包名恒为 `dsh-prompt-enhancer`；client bundle 注册的模块 id 必须等于包名（从 `package.json.name` 派生，**禁止硬编码**）
- **npm 必须带 `--cache .npm-cache`**（项目内相对路径）：默认缓存在用户目录，本会话沙箱返回 EPERM（已实测 `--cache .npm-cache` 可成功 install）
- **`$DSH_HOME/profiles/web` 对本会话沙箱不可写**：安装 / 重启 `dsh web` 属「用户执行」步骤（任务 10）。执行者不得绕过；确需自己执行时，仅可对本会话已被拒绝的同一条命令发起一次 `danger-full-access` 提权重试并附理由
- `dsh` **不在 PATH**；如需调用：`node "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js"`（v0.1.5-rc.2）
- 本计划**不引入** `js-yaml`；不注册任何 systemPrompt section；不引入 WebSocket（规格 §2.2）
- 许可：MIT，必须保留上游 `master1Sun/dsh-prompt-library` 版权声明（规格 §10）
- **路径一律项目根相对 + 正斜杠**（如 `src/host/store.ts`、`node_modules/@deepseek-ai/cordis`）；宿主侧路径用 `$DSH_HOME` 表达，不写死盘符或用户目录
- Shell：Windows + PowerShell（正斜杠在 PowerShell 中同样有效）

## 文件结构

本计划创建的文件与其单一职责：

| 文件 | 职责 |
| --- | --- |
| `.gitignore` | 忽略 `node_modules/`、`.npm-cache/`、源码映射、构建元数据；`lib/` **纳入版本控制**（与上游一致，使仓库可直接安装） |
| `LICENSE` | MIT 全文 + 上游署名 |
| `package.json` | 清单：双入口 exports、`dsh.bundle`、`dsh.client`、脚本 |
| `cordis.patch.yml` | profile 层：把插件行 insert 进任何声明本 bundle 的 profile |
| `tsconfig.json` | 仅类型检查（`noEmit`），含 DOM lib 与 react-jsx |
| `src/ambient.d.ts` | `__DEV__` / `__PLUGIN_VERSION__` 构建期常量声明 |
| `src/index.ts` | host 入口：`name` / `inject` / `apply`（P1 仅生命周期） |
| `src/client/index.ts` | client 入口：`inject` / `apply`（P1 仅生命周期） |
| `scripts/link-dsh-deps.mjs` | 把 DSH profile 的 `@deepseek-ai/*` 类型包 junction 进本项目 `node_modules`，供 `tsc` 解析 |
| `scripts/build.mjs` | esbuild 双产物构建 + `.build-meta.json` |
| `scripts/smoke.mjs` | 产物形状 + client bundle 功能校验（本计划的验收测试） |

**不在本计划内**：`src/host/**`、`src/client/components/**`、`tests/**`（P2 起）。`scripts/sync-to-profile.mjs` 也不在本计划内——任务 10 用 `link:` 安装，profile 直接解析本项目目录，无需复制。

---

### 任务 1：仓库初始化与许可

**文件：**
- 新建：`.gitignore`
- 新建：`LICENSE`

**接口：**
- 依赖输入：无
- 对外产出：一个已初始化的 git 仓库；后续所有任务都往里提交

- [ ] **步骤 1：初始化仓库**

运行：
```powershell
git init
git status --short
```
预期：`Initialized empty Git repository`；`git status --short` 只列出 `docs/`（规格与路线图已在其中）。
**前置：当前工作目录必须是项目根**（本计划所有命令均如此）。

- [ ] **步骤 2：写 `.gitignore`**

```gitignore
node_modules/
.npm-cache/
*.map
.build-meta.json
debug.log
*.tmp.*
```

- [ ] **步骤 3：写 `LICENSE`**（MIT 全文；`Copyright` 两行**必须**保留上游一行）

```
MIT License

Copyright (c) 2026 master1Sun (upstream: dsh-prompt-library,
https://github.com/master1Sun/dsh-prompt-library)
Copyright (c) 2026 dsh-prompt-enhancer contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **步骤 4：提交（规格作为第一个 commit）**

```powershell
git add .gitignore LICENSE docs/
git commit -m "chore: init repo with design spec, roadmap and MIT license"
```
预期：提交成功；`git log --oneline` 有一行。

---

### 任务 2：清单与 profile 层

**文件：**
- 新建：`package.json`
- 新建：`cordis.patch.yml`

**接口：**
- 依赖输入：无
- 对外产出：`package.json.name === "dsh-prompt-enhancer"`，被 `scripts/build.mjs`（任务 6）与 `scripts/smoke.mjs`（任务 5）读取作为模块 id 的**唯一事实来源**

- [ ] **步骤 1：写 `package.json`**

**本任务不写 `test` 脚本**——`tests/` 目录在 P2 才出现，提前写会让 `npm test` 失败。

```json
{
  "name": "dsh-prompt-enhancer",
  "version": "0.1.0",
  "description": "DSH 提示词增强插件：提示词管理、AI 优化、沉淀与复用（精简版）",
  "private": true,
  "type": "module",
  "main": "./lib/index.js",
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml"],
  "engines": { "node": ">=22.19" },
  "scripts": {
    "link-dsh-deps": "node scripts/link-dsh-deps.mjs",
    "build": "node scripts/build.mjs",
    "build:dev": "node scripts/build.mjs --dev",
    "typecheck": "tsc --noEmit",
    "smoke": "node scripts/smoke.mjs"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-client-ui-conversation"
      ]
    }
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "esbuild": "^0.28.0",
    "typescript": "^5.6.0"
  },
  "license": "MIT"
}
```

> `dsh.client.inject` 声明 client bundle 运行时可能需要 `require` 的包。P1 的 client 入口在加载期不 require 任何外部包，该列表是**面向最终形态**的声明：规格 §7.1 的 6 个座位按**字符串名**注册，因此运行时不需要依赖 `ui-sidebar` / `ui-layout` / `ui-settings` 这三个**声明**包。若任务 10 的加载报告出现 unresolved require，按其内容调整此列表。

- [ ] **步骤 2：写 `cordis.patch.yml`**

```yaml
# dsh-prompt-enhancer bundle patch：把本插件的 loader 行挂进任何在
# dsh.profile.bundles 中列出本 bundle 的 profile。
- insert:
    - id: prompt-enhancer
      name: 'dsh-prompt-enhancer'
```

- [ ] **步骤 3：校验清单可解析且两处名称一致**

运行：
```powershell
node -e "const p=require('./package.json');const m=require('fs').readFileSync('cordis.patch.yml','utf8').match(/name:\s*'([^']+)'/);console.log('pkg:',p.name);console.log('patch:',m&&m[1]);if(p.name!==(m&&m[1]))process.exit(1);console.log('MATCH')"
```
预期：输出 `pkg: dsh-prompt-enhancer`、`patch: dsh-prompt-enhancer`、`MATCH`，退出码 0。

- [ ] **步骤 4：提交**

```powershell
git add package.json cordis.patch.yml
git commit -m "chore: add package manifest and profile bundle patch"
```

---

### 任务 3：TypeScript 配置与全局常量声明

**文件：**
- 新建：`tsconfig.json`
- 新建：`src/ambient.d.ts`

**接口：**
- 依赖输入：无
- 对外产出：全局常量 `__DEV__: boolean` 与 `__PLUGIN_VERSION__: string`，供任务 7/8 的入口使用

- [ ] **步骤 1：写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **步骤 2：写 `src/ambient.d.ts`**

```ts
/**
 * 构建期常量：由 scripts/build.mjs 的 esbuild define 注入。
 * 声明必须保留——否则 tsc --noEmit 会报 "Cannot find name '__DEV__'"。
 */

/** 是否为开发构建（npm run build:dev）。生产构建下诊断日志代码被消除。 */
declare const __DEV__: boolean;

/** 插件版本号，取自 package.json.version。 */
declare const __PLUGIN_VERSION__: string;
```

- [ ] **步骤 3：提交**

```powershell
git add tsconfig.json src/ambient.d.ts
git commit -m "chore: add tsconfig and build-time ambient declarations"
```

（typecheck 在任务 4 装好依赖后一并验证。）

---

### 任务 4：安装依赖并链接 DSH 类型包

**文件：**
- 新建：`scripts/link-dsh-deps.mjs`

**接口：**
- 依赖输入：`package.json` 的 devDependencies（任务 2）
- 对外产出：`node_modules/`，其中 `node_modules/@deepseek-ai/*` 是指向 `$DSH_HOME/profiles/node_modules/@deepseek-ai/*` 的 junction，使 `tsc` 能解析 `@deepseek-ai/cordis`

- [ ] **步骤 1：写 `scripts/link-dsh-deps.mjs`**

```js
// 把 DSH profile 的 @deepseek-ai/* 类型包 junction 进本项目 node_modules，
// 让 tsc --noEmit 能解析它们。构建（esbuild）本身不需要——它们全是 external。
//
// 来源：<DSH_HOME>/profiles/node_modules/@deepseek-ai（任一 profile 启动过即存在）。
import { mkdir, symlink, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nmAt = join(root, "node_modules", "@deepseek-ai");

const dshHome = process.env.DSH_HOME
  || join(process.env.HOME || process.env.USERPROFILE || "", ".dsh");
const src = join(dshHome, "profiles", "node_modules", "@deepseek-ai");

let entries = [];
try {
  entries = await readdir(src);
} catch {
  console.error("link-dsh-deps: 找不到 " + src + "，请先启动过一次 dsh");
  process.exit(1);
}

await rm(nmAt, { recursive: true, force: true });
await mkdir(nmAt, { recursive: true });

let linked = 0;
for (const name of entries) {
  // junction 在 Windows 上无需管理员权限即可创建
  await symlink(join(src, name), join(nmAt, name), "junction");
  linked++;
}
console.log("link-dsh-deps: linked " + linked + " @deepseek-ai/* packages");
```

- [ ] **步骤 2：安装依赖（必须带工作区内的 cache）**

运行：
```powershell
npm install --cache .npm-cache --no-audit --no-fund
```
预期：`added N packages`，退出码 0。
若出现 `EPERM` 且报错路径指向**用户目录**下的 npm 缓存，说明漏了 `--cache` 参数——**不要提权**，补上参数重跑。

- [ ] **步骤 3：链接 DSH 类型包**

运行：
```powershell
npm run link-dsh-deps
```
预期：`link-dsh-deps: linked <N> @deepseek-ai/* packages`，N > 0。

- [ ] **步骤 4：验证类型解析与 typecheck**

运行：
```powershell
Test-Path node_modules/@deepseek-ai/cordis/package.json
npx tsc --noEmit
```
预期：`True`；`tsc` 无输出且退出码 0。

- [ ] **步骤 5：提交**

```powershell
git add scripts/link-dsh-deps.mjs package-lock.json
git commit -m "chore: add DSH type-package linker and lock dependencies"
```

---

### 任务 5：先写验收测试——产物形状校验

**文件：**
- 新建：`scripts/smoke.mjs`

**接口：**
- 依赖输入：`package.json.name`（任务 2）
- 对外产出：可复用的 `npm run smoke`，P2–P8 每次构建后运行；断言 host 导出、client bundle 注册的模块 id、factory 返回形状、`cordis.patch.yml` 与包名一致、构建元数据

- [ ] **步骤 1：写 `scripts/smoke.mjs`**

```js
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

  // 在受控沙箱中真实执行 bundle，捕获 __ModuleLoader__.load 的入参
  let captured = null;
  const fakeWindow = { __ModuleLoader__: { load: (entry) => { captured = entry; } } };
  // react / @deepseek-ai/* 由加载器在运行时解析；P1 的入口在加载期不 require 任何东西
  const fakeRequire = (id) => { throw new Error("smoke: 加载期不应 require 外部模块（" + id + "）"); };

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
```

- [ ] **步骤 2：运行 smoke 并确认它失败**

运行：
```powershell
npm run smoke
```
预期：**FAIL**，出现 `smoke: FAIL lib/index.js 不存在（先运行 npm run build）` 等若干条，退出码 1。
这是本计划的**红灯**：测试先行，证明 smoke 真的在校验产物而不是空转。

- [ ] **步骤 3：提交失败的测试**

```powershell
git add scripts/smoke.mjs
git commit -m "test: add build-artifact smoke checks (failing: no build yet)"
```

---

### 任务 6：双产物构建

**文件：**
- 新建：`scripts/build.mjs`

**接口：**
- 依赖输入：`package.json.name` / `package.json.version`（任务 2）
- 对外产出：`lib/index.js`、`lib/client.js`、`lib/.build-meta.json`；模块 id 由包名派生

- [ ] **步骤 1：写 `scripts/build.mjs`**

```js
// 用 esbuild 构建 dsh-prompt-enhancer。
// 产物：
//   lib/index.js   — host 入口（Node ESM）；@deepseek-ai/* 保持 external。
//   lib/client.js  — 浏览器入口，DSH 客户端模块格式：
//                    window.__ModuleLoader__.load({ id, factory: (require) => {...} })
//
// 客户端模块 id 必须与 DSH 加载器校验的 id 一致：loader entry 的 id 取自
// cordis entry.options.name，即完整包名。故从 package.json.name 派生（唯一事实来源）。
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
```

- [ ] **步骤 2：提交（此时构建还不能跑通，因为入口文件尚未写）**

```powershell
git add scripts/build.mjs
git commit -m "build: add esbuild dual-entry build script"
```

---

### 任务 7：host 入口

**文件：**
- 新建：`src/index.ts`

**接口：**
- 依赖输入：`__DEV__` / `__PLUGIN_VERSION__`（任务 3）
- 对外产出：模块级导出 `name: string = "prompt-enhancer"`、`inject: string[] = []`、`apply(ctx: Context): void`。
  **P3 将在此文件加入 `makeRoutes()` 与 `ctx.inject(["llm"]) / ctx.inject(["webServer"])`，`name` 与 `inject` 保持不变。**

- [ ] **步骤 1：写 `src/index.ts`**

```ts
/**
 * dsh-prompt-enhancer — host 入口。
 *
 * P1 只建立生命周期骨架：验证插件能被宿主加载。
 * P3 会在这里注册 HTTP 路由（/api/prompt-enhancer/*）与 LLM 服务注入。
 * 本插件刻意不注册任何 systemPrompt section（规格 §2.2）。
 */
import type { Context } from "@deepseek-ai/cordis";

export const name = "prompt-enhancer";

/** webServer / llm 均按条件 ctx.inject 获取，故无静态必需服务。 */
export const inject: string[] = [];

export function apply(ctx: Context): void {
  ctx.effect(() => {
    if (__DEV__) {
      console.log("[prompt-enhancer] host loaded v" + __PLUGIN_VERSION__);
    }
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] host unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
```

- [ ] **步骤 2：类型检查**

运行：
```powershell
npx tsc --noEmit
```
预期：无输出，退出码 0。
若报 `Cannot find module '@deepseek-ai/cordis'`，说明任务 4 的 `link-dsh-deps` 未成功执行。

- [ ] **步骤 3：提交**

```powershell
git add src/index.ts
git commit -m "feat(host): add host entry with lifecycle skeleton"
```

---

### 任务 8：client 入口

**文件：**
- 新建：`src/client/index.ts`

**接口：**
- 依赖输入：`__DEV__` / `__PLUGIN_VERSION__`（任务 3）
- 对外产出：模块级导出 `inject: string[]` 与 `apply(ctx)`。
  **P4 起把 `inject` 扩为 `["slots", "locale", "workspaces", "uiConversation"]` 并在此注册 6 个插槽座位；P1 保持空数组**，避免因宿主缺服务而导致注册被 withheld。

- [ ] **步骤 1：写 `src/client/index.ts`**

```ts
/**
 * dsh-prompt-enhancer — 浏览器入口。
 *
 * 以 DSH 客户端模块格式构建到 lib/client.js：
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 *
 * P1 只建立生命周期骨架。P4 起在此注册插槽（规格 §7.1）：
 *   conversation.input.left ×2 / sidebar.footer.action /
 *   conversation.input.dock / settings.section / shell.overlay
 */

/** 本插件使用的客户端服务（P1 仅需 effect 建立生命周期）。 */
interface ClientCtx {
  effect(fn: () => unknown, label: string): unknown;
}

/** P1 不注册任何插槽，故不声明 slots / locale。 */
export const inject: string[] = [];

export function apply(ctx: ClientCtx): void {
  ctx.effect(() => {
    if (__DEV__) {
      console.log("[prompt-enhancer] client loaded v" + __PLUGIN_VERSION__);
    }
    return () => {
      if (__DEV__) console.log("[prompt-enhancer] client unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
```

- [ ] **步骤 2：类型检查**

运行：
```powershell
npx tsc --noEmit
```
预期：无输出，退出码 0。

- [ ] **步骤 3：提交**

```powershell
git add src/client/index.ts
git commit -m "feat(client): add browser entry with lifecycle skeleton"
```

---

### 任务 9：跑通构建与验收测试

**文件：**
- 无新建；可能修改：`scripts/build.mjs`（仅当 footer 引用的标识符未在 factory 作用域中声明时）

**接口：**
- 依赖输入：任务 5/6/7/8 的全部产出
- 对外产出：绿灯的 `npm run typecheck`、`npm run build`、`npm run smoke`

- [ ] **步骤 1：构建**

运行：
```powershell
npm run build
```
预期：`build: done (lib/index.js, lib/client.js)`；`lib/` 下出现 `index.js`、`client.js`、两个 `.map`、`.build-meta.json`。

- [ ] **步骤 2：确认 factory 作用域里确有 `apply` / `inject` 声明**

运行：
```powershell
Select-String -Path lib/client.js -Pattern '^function apply\(|^var inject|^let inject|^const inject' | ForEach-Object { $_.Line }
```
预期：至少匹配到两行（`function apply(` 与 `var inject` / `let inject` / `const inject`）。

**若没有匹配**：说明 esbuild 未把这两个标识符提到 factory 顶层，footer 的 `{ apply, inject }` 会引用未定义标识符。按顺序尝试修法：
1. 在 `scripts/build.mjs` 的 client build 中加 `treeShaking: false` 与 `keepNames: true`，重跑步骤 1 与步骤 3。
2. 仍不行则在 `clientFooter` 之前插入一行
   `"    var apply = module.exports.apply, inject = module.exports.inject;",`
   并保持 footer 使用这两个变量。
3. 重跑步骤 1 与步骤 3，直到步骤 2 有匹配且步骤 3 全绿。

- [ ] **步骤 3：运行验收测试**

运行：
```powershell
npm run smoke
```
预期：全部 `smoke: ok`，最后一行 `smoke: PASSED`，退出码 0。

- [ ] **步骤 4：类型检查**

运行：
```powershell
npm run typecheck
```
预期：无输出，退出码 0。

- [ ] **步骤 5：提交**

```powershell
git add -A
git commit -m "build: green typecheck + build + smoke for empty plugin"
```

---

### 任务 10：安装到 profile 并验证宿主加载（**用户执行**）

**文件：**
- 无新建
- 可能修改：`package.json` 的 `dsh.client.inject`（仅当加载报告出现 unresolved require）

**接口：**
- 依赖输入：任务 9 的绿灯产物
- 对外产出：M1 里程碑达成——`dsh web` 中确认插件已加载；P4 起所有插槽注册都依赖此验证

> **执行者注意**：`$DSH_HOME/profiles/web` 对本会话沙箱**不可写**（已实测）。以下步骤**交由用户执行**。不要尝试提权绕过，除非用户明确要求。

- [ ] **步骤 1（用户）：安装插件到 web profile**

```powershell
node "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile web add .
```
预期：pnpm 建立 `link:` 依赖；`dsh plugin` 把 `dsh-prompt-enhancer` 追加进 `$DSH_HOME/profiles/web/package.json` 的 `dsh.profile.bundles`。以项目根为 CWD 时，`. ` 即本插件包。
**`link:` 安装意味着 profile 直接解析本项目目录**，因此后续只需 `npm run build` + 重启 `dsh web`，无需复制文件。

- [ ] **步骤 2（用户）：确认 profile 层已挂上**

```powershell
node "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config
```
预期：输出中出现 `# == dsh-prompt-enhancer` 层，以及 `id: prompt-enhancer` 行。

- [ ] **步骤 3（用户）：重启 `dsh web` 并确认加载**

重启后打开 `http://127.0.0.1:3080`，观察启动终端日志。
若跑的是生产构建（`__DEV__ = false`），两条 `[prompt-enhancer] ... loaded` 日志**不会**打印——这是正常的。要看到加载证据，改用开发构建：
```powershell
npm run build:dev
```
然后重启 `dsh web`，预期终端出现：
```
[prompt-enhancer] host loaded v0.1.0
[prompt-enhancer] client loaded v0.1.0
```

- [ ] **步骤 4（用户）：确认无 systemPrompt 注入（规格 §2.2 的硬约束）**

预期：宿主**内置**的 `deployment:persona` 全局槽位行为不变（本插件不注册任何 section）。
若浏览器控制台或加载报告出现 `prompt-enhancer` 相关的 section 或 unresolved require 报错，回报执行者，由其调整 `dsh.client.inject`（任务 2 步骤 1）后重跑任务 9。

- [ ] **步骤 5：记录 M1 验收结论并提交**

步骤 1–4 全部符合预期后，在本文件末尾追加 `## M1 验收记录`（日期 + 实际输出摘要），然后：
```powershell
git add -A
git commit -m "chore: record M1 profile-load acceptance"
```

---

## 完成标准

- `npm run typecheck` / `npm run build` / `npm run smoke` 全绿
- `lib/index.js` 的 `name` = `prompt-enhancer` 且导出 `apply` 函数
- `lib/client.js` 注册的模块 id = `dsh-prompt-enhancer`，其 factory 返回 `{ apply, inject }`
- `--dump-config` 可见 `# == dsh-prompt-enhancer` 层
- `dsh web` 重启无报错，且**未注入任何 systemPrompt section**
- 上游 MIT 署名就位（`LICENSE` 含 `master1Sun` 一行）






