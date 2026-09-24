import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const i18n = await import("../src/client/utils/i18n.ts");

/**
 * 键名形态：点分多级，每段 [a-z][A-Za-z0-9]*（宿主命名空间下的 2..N 级键）。
 * P6 起引入三级键（如 manager.list.title），故正则支持多级——但仍拒绝空段、
 * 首尾点与连续点（"a..b" / ".a" / "a." 都不是合法键）。
 */
const KEY_RE = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/;

// P4 的编译期校验（en 的类型是 Record<keyof typeof zh, string>）拦得住漏译，
// 拦不住「值写成空串」；这四条是运行期双保险。

test("i18n：NS 是本插件的命名空间（同时用于 PropsLocale）", () => {
  assert.equal(i18n.NS, "prompt-enhancer");
});

test("i18n：zh 与 en 键集完全相等", () => {
  assert.deepEqual(Object.keys(i18n.en).sort(), Object.keys(i18n.zh).sort());
  assert.ok(Object.keys(i18n.zh).length > 0, "字典不应为空");
});

test("i18n：两套字典都没有空值（编译期拦不住空字符串）", () => {
  for (const [name, dict] of [["zh", i18n.zh], ["en", i18n.en]]) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, "string", name + "." + key + " 应是字符串");
      assert.notEqual(value.trim(), "", name + "." + key + " 不应为空");
    }
  }
});

test("i18n：键名一律是点分多级形态（宿主命名空间下的 a.b / a.b.c…）", () => {
  for (const [name, dict] of [["zh", i18n.zh], ["en", i18n.en]]) {
    for (const key of Object.keys(dict)) {
      assert.match(key, KEY_RE, name + " 的键 " + key + " 不符点分形态");
    }
  }
});

// P6 提前项（R7）：后续任务会引入三级键，正则必须先支持，否则 T2 的 npm test 必红。
test("i18n：键名正则接受三级键（P6 起引入 a.b.c）", () => {
  assert.match("a.b.c", KEY_RE);
  assert.match("manager.list.title", KEY_RE);
});

test("i18n：键名正则拒绝空段、首尾点与首字母大写的段（a..b / .a / a. / A.b）", () => {
  for (const bad of ["a..b", ".a", "a.", "a.b.", "a..b.c", "A.b", "a.B"]) {
    assert.doesNotMatch(bad, KEY_RE, bad + " 不是合法键名");
  }
});

// ── A11 / R42：无死键检查 ─────────────────────────────────────────────────
//
// 每个键都必须在 src/** （排除字典自身 i18n.ts）里作为**字符串字面量**出现——含联合类型里的
// 字面量（如 transfer.ts 的 errorKey）。P6 期间死键出现 ≥3 次（T2 一次、T4/T5 各一次），
// 人眼找不回来，故立此检查。
//
// 判定用「带引号的整键字面量」精确匹配（"a.b.c" / 'a.b.c'），不做宽泛正则：
//   · 注释里的反引号写法（一个键名加反引号）**不算**引用——否则删掉键、只在注释里留个名字
//     就能骗过检查（本次 T6 的三个死键正是这种形态：只剩 PromptManagerModal 的注释提到它们）；
//   · 键名拼接等动态引用同样不算，必须在下面的显式豁免清单里逐条声明理由。
//
// 显式豁免清单当前**为空**：实测 src/** 里没有任何键只靠动态引用而从不以字面量出现。
// 将来若出现合法动态引用，在这里加 { key, why } 并写明理由——不得把本检查放宽成宽泛正则。
const DYNAMIC_KEY_EXEMPTIONS = [];

/** 把 src/** （排除字典自身）的全部源码拼成一段文本，供字面量精确匹配。 */
function collectSourceText() {
  const srcDir = fileURLToPath(new URL("../src", import.meta.url));
  const files = readdirSync(srcDir, { recursive: true })
    .map(String)
    .filter((rel) => (rel.endsWith(".ts") || rel.endsWith(".tsx")) && !rel.endsWith("i18n.ts"));
  assert.ok(files.length > 0, "必须真的扫到 src/** 的源码（0 个文件 = 本检查是空转）");
  return files.map((rel) => readFileSync(join(srcDir, rel), "utf8")).join("\n");
}

test("i18n：无死键——每个键都在 src/** 里作为字符串字面量被引用（A11 / R42）", () => {
  const text = collectSourceText();
  for (const e of DYNAMIC_KEY_EXEMPTIONS) assert.ok(e.why.trim() !== "", e.key + " 的豁免理由不得为空");
  const exempt = new Set(DYNAMIC_KEY_EXEMPTIONS.map((e) => e.key));
  const dead = Object.keys(i18n.zh).filter(
    (key) => !exempt.has(key) && !text.includes('"' + key + '"') && !text.includes("'" + key + "'"),
  );
  assert.deepEqual(dead, [], "以下键在 src/** 里没有任何字符串字面量引用（死键：删除，或在豁免清单里写明理由）：" + dead.join(", "));
});
