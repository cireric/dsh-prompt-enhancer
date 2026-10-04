/**
 * `src/client/utils/settings-options.ts` 单测（审查 #7 的收敛点）。
 *
 * 三个函数原先住在 SettingsSection.tsx 里：因为 .tsx 没有自动化判据（硬约束 15），
 * 「清单为空时补不补当前值」「越界到底写不写」这类边界从未被断言过。下沉后即可在此钉住。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { providerOptions, modelOptions, commitNumberDraft } = await import(
  "../src/client/utils/settings-options.ts"
);

const LIST = [
  { provider: "p1", name: "P1", models: [{ id: "m1", name: "M1" }, { id: "m2", name: "M2" }] },
];

test("providerOptions：自动发现恒在首位；清单非空且当前值不在清单时补一条；清单空则不补", () => {
  const values = (list, current) => providerOptions(list, current, "自动").map((o) => o.value);
  assert.deepEqual(values([], ""), [""]);
  assert.deepEqual(values([], "gone"), [""], "清单空（探测失败/宿主无模型）⇒ 只剩自动发现，不补当前值");
  assert.deepEqual(values(LIST, ""), ["", "p1"]);
  assert.deepEqual(values(LIST, "gone"), ["", "p1", "gone"], "当前值不在清单 ⇒ 补一条让下拉如实显示现状");
  assert.deepEqual(values(LIST, "p1"), ["", "p1"], "已在清单里就不得重复补");
  assert.equal(providerOptions(LIST, "", "自动")[0].label, "自动", "首项文案就是传进来的 auto");
  assert.equal(providerOptions(LIST, "", "自动")[1].label, "P1", "宿主给的 name 原样用作 label");
});

test("modelOptions：只列当前 provider 的模型，规则与 provider 侧逐条同形", () => {
  const values = (provider, current) => modelOptions(LIST, provider, current, "自动").map((o) => o.value);
  assert.deepEqual(values("p1", ""), ["", "m1", "m2"]);
  assert.deepEqual(values("unknown", ""), [""], "provider 不在清单 ⇒ 只剩自动发现");
  assert.deepEqual(values("p1", "gone"), ["", "m1", "m2", "gone"]);
  assert.deepEqual(values("p1", "m1"), ["", "m1", "m2"], "已是本 provider 的模型 ⇒ 不重复补");
});

test("commitNumberDraft：非空 + 整数 + 在边界内才提交，越界一律不写", () => {
  const bounds = { min: 200, max: 2000 };
  assert.equal(commitNumberDraft("420", bounds), 420);
  assert.equal(commitNumberDraft("200", bounds), 200, "下界含");
  assert.equal(commitNumberDraft("2000", bounds), 2000, "上界含");
  assert.equal(commitNumberDraft(" 420 ", bounds), 420, "首尾空白由 Number() 吃掉");
  assert.equal(commitNumberDraft("199", bounds), undefined, "下界 −1 不写");
  assert.equal(commitNumberDraft("2001", bounds), undefined, "上界 +1 不写");
  assert.equal(commitNumberDraft("", bounds), undefined);
  assert.equal(commitNumberDraft("   ", bounds), undefined);
  assert.equal(commitNumberDraft("abc", bounds), undefined);
  assert.equal(commitNumberDraft("420.5", bounds), undefined, "step=1 ⇒ 非整数不写");
});
