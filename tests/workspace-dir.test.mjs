import { test } from "node:test";
import assert from "node:assert/strict";

// R11：能力持有/缺失两条路径都是纯函数，必须各有断言。
const { isDirectoryPickerAvailable, pickExportDirectory, setDirectoryCapability } = await import(
  "../src/client/utils/workspace-dir.ts",
);

test("无能力：isDirectoryPickerAvailable() 为 false，pickExportDirectory() 抛可读错误（不是返回 null）", async () => {
  setDirectoryCapability(null);
  assert.equal(isDirectoryPickerAvailable(), false);
  await assert.rejects(pickExportDirectory(), (err) => {
    assert.ok(err instanceof Error, "应是 Error");
    assert.match(err.message, /目录选择能力/, "错误文案要能直接给用户看");
    return true;
  });
});

test("有 stubbed 能力：透传 pickDirectory() 的返回值（含 null = 用户取消）", async () => {
  let calls = 0;
  setDirectoryCapability({
    pickDirectory: async () => {
      calls += 1;
      return "/tmp/导出目录";
    },
  });
  try {
    assert.equal(isDirectoryPickerAvailable(), true);
    assert.equal(await pickExportDirectory(), "/tmp/导出目录");
    assert.equal(calls, 1, "应恰好调用宿主能力一次");
    setDirectoryCapability({ pickDirectory: async () => null });
    assert.equal(await pickExportDirectory(), null, "用户取消 → null（不是错误）");
  } finally {
    setDirectoryCapability(null);
  }
});

test("setDirectoryCapability(null) 复位：能力撤掉后立刻不可用", async () => {
  setDirectoryCapability({ pickDirectory: async () => "/x" });
  assert.equal(isDirectoryPickerAvailable(), true);
  setDirectoryCapability(null);
  assert.equal(isDirectoryPickerAvailable(), false);
  await assert.rejects(pickExportDirectory(), /目录选择能力/);
});

// 宿主能力对象结构不符（pickDirectory 不是函数）时，两个出口必须给同一个结论：
// 可用性判定 false，取值抛可读错误——不得把 TypeError 漏给调用方。
test("能力对象不完整（pickDirectory 非函数）：判定不可用，取值抛可读错误", async () => {
  setDirectoryCapability({ pickDirectory: undefined });
  try {
    assert.equal(isDirectoryPickerAvailable(), false);
    await assert.rejects(pickExportDirectory(), (err) => {
      assert.equal(err.constructor, Error, "应是可读的 Error，不是 TypeError");
      assert.match(err.message, /目录选择能力/);
      return true;
    });
  } finally {
    setDirectoryCapability(null);
  }
});
