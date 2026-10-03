/**
 * `src/host/node-sqlite.ts` 的全局纪律单测（审查 #10-①）。
 *
 * 旧实现在**模块顶层**改写 `process.emitWarning` 且永不恢复——一个插件把宿主进程的全局函数换掉、
 * 不留恢复路径，代价远超它省下的那行噪声。现在静音只在加载窗口内生效，加载完（含异常路径）还原。
 *
 * 判据是**函数身份**：import 前后、加载 `node:sqlite` 前后、close 前后，`process.emitWarning`
 * 都必须是同一引用。顺带确认连接本身仍可用（收窄静音窗口不得影响功能）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("node-sqlite：import 期不动全局，加载后必须把 process.emitWarning 还原", async () => {
  const beforeImport = process.emitWarning;
  const { createDatabase } = await import("../src/host/node-sqlite.ts");
  assert.equal(process.emitWarning, beforeImport, "import 期不得改写 process.emitWarning");

  const db = createDatabase(":memory:");
  try {
    assert.equal(process.emitWarning, beforeImport, "加载 node:sqlite 之后必须还原（静音窗口只覆盖加载）");
    db.exec("CREATE TABLE t (a TEXT)");
    db.prepare("INSERT INTO t (a) VALUES (?)").run("x");
    assert.equal(db.prepare("SELECT a FROM t").get().a, "x", "连接本身仍可用");
  } finally {
    db.close();
  }
  assert.equal(process.emitWarning, beforeImport, "close 之后仍是同一引用");
});
