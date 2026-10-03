/**
 * `src/client/utils/dismiss-outside.ts` 里**可脱离浏览器验证**的那一半（候选 2 切片 2 的补判据）。
 *
 * 为什么只测这一半：hook 本体要 react 与 DOM（本仓两者都没有，硬约束 5），只能活体验收；
 * 但「这一下算不算点在浮层外面」是纯判定，抽成 `isOutside` 后就能在 node 里钉住。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { isOutside } = await import("../src/client/utils/dismiss-outside.ts");

const node = { kind: "node" };
const other = { kind: "other" };
const isNode = (v) => v === node;
const root = (inner) => ({ contains: (t) => t === inner });

test("isOutside：点在浮层内部 ⇒ 不算外面（不收起）", () => {
  assert.equal(isOutside(root(node), node, isNode), false);
});

test("isOutside：点在浮层外部 ⇒ 算外面（收起）", () => {
  assert.equal(isOutside(root(node), other, isNode), true);
});

test("isOutside：根节点还没就绪（null）⇒ 一律算外面", () => {
  assert.equal(isOutside(null, node, isNode), true);
});

test("isOutside：target 不是节点 ⇒ 算外面（与搬迁前的 `instanceof Node` 同义）", () => {
  assert.equal(isOutside(root(node), null, isNode), true);
  assert.equal(isOutside(root(node), undefined, isNode), true);
  assert.equal(isOutside(root(node), "text", isNode), true);
});
