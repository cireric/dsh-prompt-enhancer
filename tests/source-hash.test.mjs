/**
 * `scripts/source-hash.mjs` 单测（2026-10-03 审查）。
 *
 * 它守的是本仓唯一能骗过其它所有闸门的失效模式：`npm test` 测 src、`npm run smoke` 测 lib，
 * 改完 src 不重建就提交 ⇒ 两份都绿，装机方拿到旧代码。指纹的判据必须**稳定**（同内容同值，
 * 否则每次构建都会假红）且**敏感**（改一个字节就变，否则守不住任何东西）——本用例两侧都钉。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectSourceFiles, sourceHash } from "../scripts/source-hash.mjs";

test("sourceHash：只收 .ts/.tsx、同内容同值、改一个字节就变、路径参与 hash", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpe-source-hash-"));
  try {
    mkdirSync(join(root, "src", "host"), { recursive: true });
    mkdirSync(join(root, "src", "client"), { recursive: true });
    writeFileSync(join(root, "src", "host", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "src", "client", "b.tsx"), "export const b = 2;\n");
    writeFileSync(join(root, "src", "notes.md"), "不参与\n");
    writeFileSync(join(root, "src", "types.d.ts"), "export type T = 1;\n");

    assert.deepEqual(
      await collectSourceFiles(root),
      ["src/client/b.tsx", "src/host/a.ts", "src/types.d.ts"],
      "只收 .ts/.tsx（含 .d.ts）且排序稳定",
    );

    const first = await sourceHash(root);
    assert.match(first, /^[0-9a-f]{16}$/, "必须是 16 位十六进制");
    assert.equal(await sourceHash(root), first, "同内容必须同值（构建与校验各算一次）");

    writeFileSync(join(root, "src", "notes.md"), "改了 md，但源码没动\n");
    assert.equal(await sourceHash(root), first, "非源文件不得影响指纹");

    writeFileSync(join(root, "src", "host", "a.ts"), "export const a = 2;\n");
    assert.notEqual(await sourceHash(root), first, "改一个字节必须变");

    writeFileSync(join(root, "src", "host", "a.ts"), "export const a = 1;\n");
    renameSync(join(root, "src", "client", "b.tsx"), join(root, "src", "host", "b.tsx"));
    assert.notEqual(await sourceHash(root), first, "内容不变但归属变了也必须变（两个 bundle 的输入不同）");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
