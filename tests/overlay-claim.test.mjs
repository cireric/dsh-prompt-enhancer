/**
 * 共享浮层 claim 的测试（T1 的交付面 ②；修 I2-1 / I2-2 / I2-3）。
 *
 * 覆盖两件事：
 *  1. `src/overlay-claim.ts#canRender` 的**纯判定**——3 个面 × 4 个 claimed 取值的**全部组合**，
 *     以及由它直接推出的「任一时刻至多一张浮层在场」（0 帧同屏的纯判定形式）。
 *  2. `ui-state.ts` 的 claim store：幂等、抢屏、**只释放自己持有的**、独立 listener set、
 *     Node 侧无 react 的可见失败、以及 R55 历史形态（`shouldShowLibraryPanel`）与新读法的逐格同值。
 *  3. **`claimOverlayIfFree`（修复轮 1）**：「只取空屏」是**原子**判定——它是 AI 面板的取屏路径，
 *     也正是评审发现的 TOCTOU 的要害：快照陈旧时的写入不得再抢走别面。
 *
 * **为什么组件接线不在这里测**（R-P7-C）：本仓库没有 react-dom / jsdom（全局硬约束 5），三个组件的
 * 渲染门与 effect 没有自动化通道。这里**不造空洞断言**去假装覆盖它——活体判据交给 T5（判定表见
 * task-1-report.md §判定表）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// 纯判定模块零依赖，可以被 node --test 直接 import（Node 24 的类型擦除）。
import { canRender } from "../src/overlay-claim.ts";

// store 面是模块级单例，用例之间共享状态，故每个用例自行收敛（与 tests/ui-state.test.mjs 同口径，
// 不引入 test-only 复位 API）。
const {
  claimOverlay,
  claimOverlayIfFree,
  getOverlayClaimSnapshot,
  releaseOverlay,
  setHashSuggestVisible,
  shouldShowLibraryPanel,
  subscribe,
  subscribeHashSuggestVisible,
  subscribeOverlayClaim,
  useOverlayClaim,
} = await import("../src/client/utils/ui-state.ts");
const reactHooks = await import("../src/client/utils/react-hooks.ts");

/** 会占屏的三个面（与 `OverlaySurface` 一致）。 */
const KINDS = ["hash", "library", "ai"];
/** 寄存器（`OverlayKind`）的取值全集。 */
const CLAIMED = ["none", "hash", "library", "ai"];

/** 用例之间把两个共享单例收敛回初值。 */
function settle() {
  for (const kind of KINDS) releaseOverlay(kind);
  setHashSuggestVisible(false);
}

/** 此刻被放行的面（与三个消费组件的门同形：`canRender(kind, claimed)`；各面还要与自己前置条件相与）。 */
function allowedFaces(claimed) {
  return KINDS.filter((kind) => canRender(kind, claimed));
}

// ---- 1) 纯判定：canRender ----

test("canRender：3 个面 × 4 个 claimed 取值的 12 组全部有确定答案（真值表逐格）", () => {
  assert.deepEqual(
    KINDS.map((kind) => CLAIMED.map((claimed) => canRender(kind, claimed))),
    [
      [false, true, false, false],
      [false, false, true, false],
      [false, false, false, true],
    ],
    "只有 claimed === kind 才放行",
  );
  // 反向对照：真值表不是「恒 true」也不是「恒 false」——恰好 3 格为真（每个面各持有一次屏）。
  // 变异验证（把互斥去掉 ⇒ 恒 true）会在这里与下一条用例同时变红。
  assert.equal(
    KINDS.flatMap((kind) => CLAIMED.map((claimed) => canRender(kind, claimed))).filter(Boolean).length,
    3,
  );
});

test("互斥（0 帧同屏的纯判定形式）：即便三面前置条件同时为真，任一 claimed 下至多一个面渲染", () => {
  /** 三面「都想渲染」的极端情形：`open` / `visible` / `status !== 'idle'` 同时成立。 */
  const wants = { hash: true, library: true, ai: true };
  for (const claimed of CLAIMED) {
    const rendered = KINDS.filter((kind) => wants[kind] && canRender(kind, claimed));
    assert.ok(rendered.length <= 1, claimed + " 放行了 " + rendered.length + " 个面：" + rendered.join(","));
  }
  // 三面各持一次屏：每次恰好放行它自己（AI×`#` 与 AI×词库这两对的 0 帧判据在纯判定层即已成立）。
  for (const holder of KINDS) {
    assert.deepEqual(KINDS.filter((kind) => wants[kind] && canRender(kind, holder)), [holder]);
  }
});

test('claimed === "none"（无人占屏）时任何面都不得渲染——不是「谁都可以渲染」', () => {
  // 这条读法是有意的：「放行」只发生在寄存器**空着可以取**的时候（`claimOverlay`），而不是渲染期。
  // 若把 "none" 当放行，三面前置条件同时为真时会同帧渲染两个面，T5 的 0 帧验收当场失守。
  for (const kind of KINDS) {
    assert.equal(canRender(kind, "none"), false, kind + " 在无人占屏时不得渲染");
  }
  assert.deepEqual(allowedFaces("none"), []);
});

// ---- 2) store：claimOverlay / releaseOverlay / 订阅 ----

test("getOverlayClaimSnapshot：初值 none（新模块实例实测，与用例顺序无关）", async () => {
  const fresh = await import("../src/client/utils/ui-state.ts?fresh=claim-initial");
  assert.equal(fresh.getOverlayClaimSnapshot(), "none");
  // 反向确认该实例独立于本文件其余用例操作的共享单例（否则上面的断言还是恒真）。
  claimOverlay("ai");
  assert.equal(fresh.getOverlayClaimSnapshot(), "none", "新实例不得受共享单例影响");
  settle();
});

test("claimOverlay：真实变更才通知（幂等）；订阅者看到新快照；退订安全", () => {
  settle();
  const seen = [];
  const off = subscribeOverlayClaim(() => seen.push(getOverlayClaimSnapshot()));

  claimOverlay("hash");
  assert.deepEqual(seen, ["hash"], "第一次取屏是真实变更，派发一次");
  claimOverlay("hash");
  assert.equal(seen.length, 1, "同值重复取屏不派发（幂等，避免无谓重渲染）");
  assert.deepEqual(allowedFaces(getOverlayClaimSnapshot()), ["hash"]);

  off();
  off();
  claimOverlay("library");
  assert.equal(seen.length, 1, "退订后不再通知（重复退订安全）");
  assert.equal(getOverlayClaimSnapshot(), "library", "退订只影响通知，不影响 store");

  settle();
  assert.equal(getOverlayClaimSnapshot(), "none");
});

test("claimOverlay：后到的激活胜出——但任一时刻仍只有一个持有者", () => {
  settle();
  const seen = [];
  const off = subscribeOverlayClaim(() => seen.push(getOverlayClaimSnapshot()));

  claimOverlay("ai");
  assert.deepEqual(allowedFaces("ai"), ["ai"]);
  claimOverlay("library");
  assert.equal(getOverlayClaimSnapshot(), "library");
  assert.deepEqual(allowedFaces("library"), ["library"], "被抢的一方当场不可渲染（互斥，不是并列）");
  claimOverlay("hash");
  assert.equal(getOverlayClaimSnapshot(), "hash");
  assert.deepEqual(allowedFaces("hash"), ["hash"]);
  assert.deepEqual(seen, ["ai", "library", "hash"], "每次真实变更各派发一次");

  off();
  settle();
});

test("releaseOverlay：只释放自己持有的（别人的 claim 不被连带清掉）；释放即空且幂等", () => {
  settle();
  const seen = [];
  const off = subscribeOverlayClaim(() => seen.push(getOverlayClaimSnapshot()));

  claimOverlay("library");
  // 真实时序（F1-1 的 0/5/10ms）：pointerdown 收起 `#` 浮层与 click 打开词库面板可以落在同一拍上，
  // 于是浮层的收尾（release("hash")）晚于词库的取屏。这条必须是无害的空操作。
  releaseOverlay("hash");
  assert.equal(getOverlayClaimSnapshot(), "library", "非持有者的 release 不得改寄存器");
  assert.equal(seen.length, 1, "空操作不派发");
  assert.deepEqual(allowedFaces("library"), ["library"], "词库面板照常渲染（不得被别人的收尾压掉）");

  releaseOverlay("library");
  assert.equal(getOverlayClaimSnapshot(), "none");
  assert.deepEqual(seen, ["library", "none"]);
  releaseOverlay("library");
  assert.equal(seen.length, 2, "已空再放不派发（幂等）");

  off();
  settle();
});

test("claim 的 listener set 与其它订阅域互不串扰（管理面板 / `#` 可见性信号）", () => {
  settle();
  let managerCount = 0;
  let hashSignalCount = 0;
  let claimCount = 0;
  const offManager = subscribe(() => {
    managerCount += 1;
  });
  const offHash = subscribeHashSuggestVisible(() => {
    hashSignalCount += 1;
  });
  const offClaim = subscribeOverlayClaim(() => {
    claimCount += 1;
  });

  claimOverlay("ai");
  assert.equal(claimCount, 1);
  assert.equal(managerCount, 0, "claim 变化不得惊动管理面板的订阅者");
  assert.equal(hashSignalCount, 0, "claim 变化不得惊动可见性信号的订阅者（库侧的 R60 闸门按它分叉）");

  // 可见性信号是 claim 的**输入**，不是 claim 本身：置信号不直接改寄存器（改的是浮层自己的 claim 接线）。
  setHashSuggestVisible(true);
  assert.equal(hashSignalCount, 1);
  assert.equal(claimCount, 1, "置信号本身不写寄存器");
  assert.equal(getOverlayClaimSnapshot(), "ai", "信号变化不得改寄存器归属");

  setHashSuggestVisible(false);
  offManager();
  offHash();
  offClaim();
  settle();
});

// ---- 3) claimOverlayIfFree：长驻状态「只取空屏」（修复轮 1 的要害） ----

test('claimOverlayIfFree：空屏才取——首次调用就取到', () => {
  settle();
  const seen = [];
  const off = subscribeOverlayClaim(() => seen.push(getOverlayClaimSnapshot()));
  claimOverlayIfFree("ai");
  assert.equal(getOverlayClaimSnapshot(), "ai");
  assert.deepEqual(seen, ["ai"], "真实变更派发一次");
  off();
  settle();
});

test('claimOverlayIfFree：别面持有时是空操作、不派发（含「调用方拿着陈旧快照」的那一拍）', () => {
  settle();
  // 复刻评审给的 TOCTOU 时序：组件在自己的渲染里读到 `claimed === "none"`（快照），
  // 提交之后、它的 effect 跑之前，寄存器已被**更早的 effect**（`#` 浮层所在 slot 在前）抢走。
  const staleSnapshotReadAtRender = getOverlayClaimSnapshot(); // = "none"
  assert.equal(staleSnapshotReadAtRender, "none", "前置：渲染那一刻确实是空屏");
  claimOverlay("hash"); // 更早的 effect（或两次事件之间的一个回调）先抢
  const seen = [];
  const off = subscribeOverlayClaim(() => seen.push(getOverlayClaimSnapshot()));
  // 组件的取屏路径——若它按**陈旧快照**写（等价于无条件 claimOverlay），这里就会把浮层压掉。
  claimOverlayIfFree("ai");
  assert.equal(getOverlayClaimSnapshot(), "hash", "别面持有 ⇒ 不得改写寄存器（不得成为无条件最后写者）");
  assert.equal(seen.length, 0, "空操作不派发");
  off();
  settle();
});

test('claimOverlayIfFree：已持有本面时幂等；别面释放后能取到（唤醒由订阅驱动）', () => {
  settle();
  claimOverlayIfFree("ai");
  const seen = [];
  const off = subscribeOverlayClaim(() => seen.push(getOverlayClaimSnapshot()));
  claimOverlayIfFree("ai");
  assert.equal(seen.length, 0, "已持有：幂等、不派发（effect 重跑无副作用）");
  // 别面（`#` 浮层）抢走 → 再释放：AI 的 effect 由 `claimed` 的跳变唤醒后重跑，这一次必须取到。
  claimOverlay("hash");
  releaseOverlay("hash");
  assert.equal(getOverlayClaimSnapshot(), "none");
  claimOverlayIfFree("ai");
  assert.equal(getOverlayClaimSnapshot(), "ai", "屏空出来 ⇒ 取到");
  assert.deepEqual(seen, ["hash", "none", "ai"]);
  off();
  settle();
});

test('claimOverlayIfFree / claimOverlay：被位移的面**能**重取（持续形态赖以成立的通道）', () => {
  settle();
  // `#` 浮层的持续形态 = 「只要 visible 且寄存器不在自己手里就重取」。这条锁住的是它赖以成立的
  // store 语义：`claimOverlay` 是**抢**（不是排队、不是拒绝），故被位移的面必有重取通道。
  claimOverlay("hash");
  claimOverlay("library"); // 位移
  assert.equal(getOverlayClaimSnapshot(), "library");
  claimOverlay("hash"); // 重取（持续形态的那一行）
  assert.equal(getOverlayClaimSnapshot(), "hash", "重取必须成功——否则被位移的面会永久静默");
  assert.deepEqual(allowedFaces(getOverlayClaimSnapshot()), ["hash"]);
  settle();
});

// ---- 4) 与 P6 既有不变量的关系 ----

test("R55 的历史形态（shouldShowLibraryPanel）与 claim 读法逐格同值", () => {
  for (const open of [false, true]) {
    for (const hashSuggestVisible of [false, true]) {
      const viaClaim = open && canRender("library", hashSuggestVisible ? "hash" : "library");
      assert.equal(
        shouldShowLibraryPanel({ open, hashSuggestVisible }),
        viaClaim,
        `open=${open} hashSuggestVisible=${hashSuggestVisible}`,
      );
    }
  }
  // 核心不变式本身：`#` 浮层在场 ⇒ 词库面板的 claim 门为假。
  // （组件不再消费 shouldShowLibraryPanel，但 tests/ui-state.test.mjs 仍按原样锁着它的 4 格。）
  assert.equal(canRender("library", "hash"), false);
  assert.equal(shouldShowLibraryPanel({ open: true, hashSuggestVisible: true }), false);
});

// R60 的通道分叉（`event.detail === 0 && hashVisible` → return，指针点击一律放行）不受本重构影响：
// 那条判定在组件里读的是 `hashVisible` 与 `event.detail`，不经过 claim（见 PromptLibraryButton 的 onClick）。
// 它的可执行判据是活体的（T5：指针 0/5/10ms 三档必须开面板），这里不造空洞断言。

test("useOverlayClaim：Node 侧无 react 时抛可读错误（不静默降级成死快照）", () => {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    assert.throws(() => useOverlayClaim(), /react 运行时不可用/, "store 面必须能在 Node 下 import，hook 必须显式失败");
    assert.throws(() => reactHooks.hooks(), /react 运行时不可用/);
  } finally {
    console.warn = original;
  }
  assert.ok(warnings.some((w) => w.includes("无法解析 react")), "解析失败必须留下可见痕迹（不吞异常）");
});
