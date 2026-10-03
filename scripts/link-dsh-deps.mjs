// 把 DSH profile 的 @deepseek-ai/* 类型包链接进本项目 node_modules，
// 让 tsc --noEmit 能解析它们。构建（esbuild）本身不需要——它们全是 external。
//
// 来源：<DSH_HOME>/profiles/node_modules/@deepseek-ai（任一 profile 启动过即存在）。
// 链接类型 "junction" 仅在 Windows 上有意义（免管理员权限）；在 macOS/Linux 上
// Node 会忽略该参数并建立普通目录符号链接，故同一份脚本跨平台可用。
//
// **自愈**：profile 共享目录里混有 pnpm 迁移后遗留的悬空链接（实测 8/251），
// 原样照搬会静默打断本项目的 `tsc`——任务 1 撞上 `dsh-client-ui-slots` 即此因。
// 故逐个 existsSync 检查，悬空者按包名到 DSH checkout 的真实源码里找回。
import { mkdir, symlink, readdir, rm, unlink, readFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nmAt = join(root, "node_modules", "@deepseek-ai");

const dshHome = process.env.DSH_HOME
  || join(process.env.HOME || process.env.USERPROFILE || "", ".dsh");
const src = join(dshHome, "profiles", "node_modules", "@deepseek-ai");

/**
 * DSH checkout 根目录：优先 `DSH_CHECKOUT`，缺失时回退 `$DSH_HOME/dsh-harness`
 * 的真实路径（那是安装器留的符号链接）。两者都不可用时返回 ""，此时所有悬空
 * 链接都会走 `unresolved` 分支——可见，不静默。
 */
function resolveCheckout() {
  if (process.env.DSH_CHECKOUT) return process.env.DSH_CHECKOUT;
  try {
    return realpathSync(join(dshHome, "dsh-harness"));
  } catch {
    return "";
  }
}

/**
 * 扫出 checkout 里 `packages/**` 的包名 → 目录映射。
 *
 * 键是**去 scope 的包名**：链接名来自 profile 的目录名（`dsh-client-ui-slots`），
 * 而 `package.json#name` 是 `@deepseek-ai/dsh-client-ui-slots`，两者差一个 scope。
 * 跳过 `node_modules`：pnpm 的嵌套副本会命中同名包但指向构建产物，不是源码。
 */
async function indexPackages(checkout) {
  const index = new Map();
  const rootDir = join(checkout, "packages");
  if (!checkout || !existsSync(rootDir)) return index;

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.error("link-dsh-deps: 无法读取 " + dir + "（" + err.message + "），跳过");
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      const pkgFile = join(full, "package.json");
      if (existsSync(pkgFile)) {
        try {
          const pkg = JSON.parse(await readFile(pkgFile, "utf8"));
          const short = String(pkg.name || "").replace(/^@[^/]+\//, "");
          if (short && !index.has(short)) index.set(short, full);
        } catch (err) {
          console.error("link-dsh-deps: 跳过坏 package.json " + pkgFile + "（" + err.message + "）");
        }
      }
      await walk(full);
    }
  }

  await walk(rootDir);
  return index;
}

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
  await symlink(join(src, name), join(nmAt, name), "junction");
  linked++;
}

// 自愈：逐个检查刚建好的链接，悬空的按包名回指 checkout 里的真实源码。
const checkout = resolveCheckout();
let index;
let healed = 0;
let unresolved = 0;
for (const name of entries) {
  const link = join(nmAt, name);
  if (existsSync(link)) continue;
  if (index === undefined) index = await indexPackages(checkout);
  const target = index.get(name);
  if (!target) {
    console.log("unresolved " + name);
    unresolved++;
    continue;
  }
  await unlink(link);
  await symlink(target, link, "junction");
  console.log("healed " + name + " → " + target);
  healed++;
}

console.log(
  "link-dsh-deps: linked " + linked + " @deepseek-ai/* packages"
  + " (healed " + healed + ", unresolved " + unresolved + ")",
);

// 悬空且没找回的包必须**显式失败**：本脚本存在的唯一理由就是让 tsc 能解析这些包，
// 「unresolved 却 exit 0」会把「tsc 马上要红」藏成输出里的一句话——串联脚本与 CI 都不看它。
if (unresolved > 0) {
  console.error(
    "link-dsh-deps: " + unresolved + " 个包仍是悬空链接（checkout 里没找到同名源码），tsc 会解析失败",
  );
  process.exitCode = 1;
}
