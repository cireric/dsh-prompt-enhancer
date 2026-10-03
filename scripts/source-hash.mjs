// 产物源码指纹：把 `src/` 下所有 .ts / .tsx 的「相对路径 + 内容」hash 成一个短值。
//
// 为什么需要它（2026-10-03 审查）：本仓把 `lib/` 纳入版本控制（硬约束 7），而 `npm test` 测 src、
// `npm run smoke` 测 lib——改完 src 只跑手边那两道门就提交，**两份都绿**，装机方拿到的却是旧产物。
// 这是本仓唯一能骗过其它所有闸门的失效模式，故把「产物是否与当前 src 同代」变成 smoke 里的一条红。
//
// 口径：只 hash `src/` 下的源文件（两个 bundle 的输入都在其中），按相对路径排序，逐个吃进
// `路径 \0 内容 \0`，取整个 sha256 的前 16 位十六进制。路径也参与 hash——同一段内容挪了归属
// （比如从 client/ 挪到 host/）意味着打包结果不同，指纹必须跟着变。
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/** 递归收集 `<root>/src` 下的 .ts / .tsx，返回**排序后的相对路径**（POSIX 分隔符，跨平台稳定）。 */
export async function collectSourceFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(relative(root, full).split("\\").join("/"));
    }
  }
  await walk(join(root, "src"));
  return files.sort();
}

/** 计算指纹；`files` 缺省时自行枚举（调用方通常直接 `await sourceHash(root)`）。 */
export async function sourceHash(root, files) {
  const list = files ?? (await collectSourceFiles(root));
  const hash = createHash("sha256");
  for (const rel of list) {
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(join(root, rel)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}
