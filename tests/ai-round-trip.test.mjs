import assert from "node:assert/strict";
import { test } from "node:test";
import { recheckRoundTrip, retryRoundTrip, roundTripOutcome } from "../src/client/utils/ai-round-trip.ts";

const check = (source) => ({ source, operation: "check" });
const template = (source) => ({ source, operation: "template" });
/** 动作位全 false 的基线，用例只写自己关心的那一两个。 */
const actions = (overrides = {}) => ({
  selectSuggestions: false,
  generateRevision: false,
  useSuggestion: false,
  backToDraft: false,
  menu: false,
  ...overrides,
});

test("检查报告按发起来源决定归属与可用动作", () => {
  assert.deepEqual(roundTripOutcome(check("composer"), "success"), {
    destination: "report",
    owner: "composer-check",
    actions: actions({ selectSuggestions: true, generateRevision: true }),
  });
  assert.deepEqual(roundTripOutcome(check("draft"), "success"), {
    destination: "report",
    owner: "draft-check",
    actions: actions({ useSuggestion: true, backToDraft: true }),
  });
});

test("增强结果按发起来源决定是否可回起草", () => {
  assert.deepEqual(roundTripOutcome(template("composer"), "success"), {
    destination: "template",
    owner: "template",
    actions: actions(),
  });
  assert.deepEqual(roundTripOutcome(template("draft"), "success"), {
    destination: "template",
    owner: "template",
    actions: actions({ backToDraft: true }),
  });
});

test("取消回到发起来源：Composer 回菜单，起草回起草面板", () => {
  for (const operation of ["check", "template"]) {
    assert.deepEqual(roundTripOutcome({ source: "composer", operation }, "cancel"), {
      destination: "menu",
      actions: actions(),
    });
    assert.deepEqual(roundTripOutcome({ source: "draft", operation }, "cancel"), {
      destination: "draft",
      actions: actions(),
    });
  }
});

test("失败按来源给出菜单或重试原操作并返回起草", () => {
  for (const operation of ["check", "template"]) {
    assert.deepEqual(roundTripOutcome({ source: "composer", operation }, "failure"), {
      destination: "error",
      actions: actions({ menu: true }),
    });
    assert.deepEqual(roundTripOutcome({ source: "draft", operation }, "failure"), {
      destination: "error",
      actions: actions({ retry: operation, backToDraft: true }),
    });
  }
});

test("检查新版沿用报告归属：Composer 报告取消回菜单，起草报告取消回起草", () => {
  const composerRecheck = recheckRoundTrip("composer-check");
  const draftRecheck = recheckRoundTrip("draft-check");
  assert.deepEqual(composerRecheck, check("composer"));
  assert.deepEqual(draftRecheck, check("draft"));
  assert.equal(roundTripOutcome(composerRecheck, "cancel").destination, "menu");
  assert.equal(roundTripOutcome(draftRecheck, "cancel").destination, "draft");
  assert.equal(recheckRoundTrip("template"), undefined);
});

test("失败重试保留来源，并区分重试检查与重试增强", () => {
  const checkFailure = roundTripOutcome(check("draft"), "failure");
  const templateFailure = roundTripOutcome(template("draft"), "failure");
  assert.deepEqual(retryRoundTrip(check("draft"), checkFailure), { source: "draft", operation: "check" });
  assert.deepEqual(retryRoundTrip(template("draft"), templateFailure), { source: "draft", operation: "template" });
  assert.equal(retryRoundTrip(check("composer"), roundTripOutcome(check("composer"), "failure")), undefined);
});
