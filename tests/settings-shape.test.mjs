import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const shape = await import("../src/settings-shape.ts");
const { DEFAULT_SETTINGS } = await import("../src/types.ts");

/** 仓库根（本文件在 tests/ 下）。 */
const ROOT = join(import.meta.dirname, "..");

/**
 * 两侧消费点的**静态引用判据**（P8 二审 I3）：该文件从 `settings-shape.ts` 取
 * `SETTINGS_NAMESPACE`，且**自己不再定义**它。
 *
 * 为什么客户端一侧只能看源码、不能在 `node --test` 里 import：`src/client/index.ts` 引 react 与
 * `@deepseek-ai/*` 客户端包、且经 .tsx 的 JSX 世界（本仓库无 react-dom / jsdom，全局硬约束 5）。
 * 宿主一侧另有**运行期**判据（见下面那条用例）。判据抓的正是「又冒出第二份字面量」这件事：
 * 两个断言各自都足以在漂移时变红。
 */
function assertNamespaceFromSharedModule(relativePath) {
  const text = readFileSync(join(ROOT, relativePath), "utf8");
  assert.equal(
    /(?:const|let|var)\s+SETTINGS_NAMESPACE\b/.test(text),
    false,
    relativePath + " 又出现了本地定义（第二份字面量 ⇒ 与宿主的绑定可能静默漂移）",
  );
  assert.equal(
    /(?:import|export)\b[^;]*\bSETTINGS_NAMESPACE\b[^;]*from\s*"[^"]*settings-shape\.ts"/.test(text),
    true,
    relativePath + " 必须从 settings-shape.ts 引入 SETTINGS_NAMESPACE（不得自持字面量）",
  );
}

test("settings-shape：SETTINGS_KEYS 与 DEFAULT_SETTINGS 的键集逐字相等（13 键）", () => {
  assert.deepEqual([...shape.SETTINGS_KEYS].sort(), Object.keys(DEFAULT_SETTINGS).sort());
  assert.equal(shape.SETTINGS_KEYS.length, 13);
});

test("settings-shape：缺字段与类型不符的字段一律回落默认值", () => {
  const out = shape.normalizeSettings({ panelWidth: "宽", showComposerButton: 1, aiProvider: 42 });
  assert.equal(out.panelWidth, DEFAULT_SETTINGS.panelWidth);
  assert.equal(out.showComposerButton, DEFAULT_SETTINGS.showComposerButton);
  assert.equal(out.aiProvider, DEFAULT_SETTINGS.aiProvider);
});

test("settings-shape：合法值原样通过；且返回的是副本（改它不影响 DEFAULT_SETTINGS）", () => {
  const out = shape.normalizeSettings({ panelWidth: 512, contextRecommendEnabled: false });
  assert.equal(out.panelWidth, 512);
  assert.equal(out.contextRecommendEnabled, false);
  out.panelWidth = 1;
  assert.equal(DEFAULT_SETTINGS.panelWidth, 420);
});

test("settings-shape：入参非对象（null / 字符串）也不抛，整体回落默认", () => {
  assert.deepEqual(shape.normalizeSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(shape.normalizeSettings("nope"), { ...DEFAULT_SETTINGS });
});

// ── 命名空间的唯一真源（P8 二审 I3）───────────────────────────────────────────
//
// 此前 `SETTINGS_NAMESPACE = "prompt-enhancer"` 在 `host/settings.ts` 与 `client/index.ts` **各写一份**，
// 无任何自动化判据；漂移是**静默**的——写落进宿主不认识的命名空间，UI 反而显示写成功、设置完全
// 不生效。现在两边都只引用 `settings-shape.ts`（零依赖共用模块，D-P8-1 建的），本用例钉住这一点。

test("SETTINGS_NAMESPACE：唯一真源在 settings-shape.ts，宿主与客户端消费点都引用它（漂移即红）", async () => {
  assert.equal(shape.SETTINGS_NAMESPACE, "prompt-enhancer", "值钉在唯一真源上（写进 settings.yaml 的顶层 key）");
  // 宿主侧：**运行期**取自同一模块——host/settings.ts 只是转发，运行时能取到才算没断链。
  const host = await import("../src/host/settings.ts");
  assert.equal(host.SETTINGS_NAMESPACE, shape.SETTINGS_NAMESPACE);
  // 两侧消费点：都从共享模块引入该绑定、且各自文件里没有本地定义。
  assertNamespaceFromSharedModule("src/host/settings.ts");
  assertNamespaceFromSharedModule("src/client/index.ts");
});
