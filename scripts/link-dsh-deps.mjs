// 把 DSH profile 的 @deepseek-ai/* 类型包链接进本项目 node_modules，
// 让 tsc --noEmit 能解析它们。构建（esbuild）本身不需要——它们全是 external。
//
// 来源：<DSH_HOME>/profiles/node_modules/@deepseek-ai（任一 profile 启动过即存在）。
// 链接类型 "junction" 仅在 Windows 上有意义（免管理员权限）；在 macOS/Linux 上
// Node 会忽略该参数并建立普通目录符号链接，故同一份脚本跨平台可用。
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
  await symlink(join(src, name), join(nmAt, name), "junction");
  linked++;
}
console.log("link-dsh-deps: linked " + linked + " @deepseek-ai/* packages");
