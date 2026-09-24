import { test } from "node:test";
import assert from "node:assert/strict";
const ins = await import("../src/client/utils/insert.ts");

test("composeDraft：追加 / 覆盖 / 插入并发送（规格 §7.2）", () => {
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "insert"), { draft: "已有内容\n新提示词", send: false });
  assert.deepEqual(ins.composeDraft("", "新提示词", "insert"), { draft: "新提示词", send: false });
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "overwrite"), { draft: "新提示词", send: false });
  assert.deepEqual(ins.composeDraft("已有内容", "新提示词", "insert-send"), { draft: "已有内容\n新提示词", send: true });
  assert.deepEqual(ins.composeDraft("", "新提示词", "insert-send"), { draft: "新提示词", send: true });
});
