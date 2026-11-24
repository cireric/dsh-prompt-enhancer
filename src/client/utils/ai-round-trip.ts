/**
 * AI 操作的**往返规则**：一次操作由「发起来源 + 种类」定义，成功/取消/失败各自落到固定位置。
 * 组件只呈现这里算出来的落点与可用动作，不从「起草会话是否存在」反推（D41）。
 */
export type RoundTripSource = "composer" | "draft";
export type RoundTripOperation = "check" | "template";
export type RoundTripEvent = "success" | "cancel" | "failure";

export interface RoundTrip {
  readonly source: RoundTripSource;
  readonly operation: RoundTripOperation;
}

/** 面板落到哪块视图。 */
export type RoundTripDestination = "report" | "template" | "error" | "menu" | "draft";
/** 谁持有本次结果（检查报告归属由来源决定，不由会话在场反推）。 */
export type RoundTripOwner = "composer-check" | "draft-check" | "template";

export interface RoundTripActions {
  /** Composer 检查报告：可勾选建议并要求生成改稿。 */
  readonly selectSuggestions: boolean;
  readonly generateRevision: boolean;
  /** 起草检查报告：单条建议可带回起草反馈框。 */
  readonly useSuggestion: boolean;
  readonly backToDraft: boolean;
  /** 失败后可重试的原始操作；不提供重试时省略。 */
  readonly retry?: RoundTripOperation;
  /** 失败后仍给操作菜单，可改选别的操作。 */
  readonly menu: boolean;
}

export interface RoundTripOutcome {
  readonly destination: RoundTripDestination;
  readonly owner?: RoundTripOwner;
  readonly actions: RoundTripActions;
}

const NO_ACTIONS: RoundTripActions = {
  selectSuggestions: false, generateRevision: false, useSuggestion: false, backToDraft: false, menu: false,
};

const withActions = (overrides: Partial<RoundTripActions>): RoundTripActions => ({ ...NO_ACTIONS, ...overrides });

export function roundTripOutcome(trip: RoundTrip, event: RoundTripEvent): RoundTripOutcome {
  const fromDraft = trip.source === "draft";
  if (event === "cancel") {
    return { destination: fromDraft ? "draft" : "menu", actions: NO_ACTIONS };
  }
  if (event === "failure") {
    return {
      destination: "error",
      actions: fromDraft
        ? withActions({ retry: trip.operation, backToDraft: true })
        : withActions({ menu: true }),
    };
  }
  if (trip.operation === "template") {
    return { destination: "template", owner: "template", actions: withActions({ backToDraft: fromDraft }) };
  }
  return fromDraft
    ? { destination: "report", owner: "draft-check", actions: withActions({ useSuggestion: true, backToDraft: true }) }
    : { destination: "report", owner: "composer-check", actions: withActions({ selectSuggestions: true, generateRevision: true }) };
}

/** 「检查新版」沿用报告归属的来源，而不是当前页面里有没有起草会话。 */
export function recheckRoundTrip(outcome: RoundTripOutcome): RoundTrip | undefined {
  if (outcome.owner === "composer-check") return { source: "composer", operation: "check" };
  if (outcome.owner === "draft-check") return { source: "draft", operation: "check" };
}

/** 失败重试保留原来源；重试目标必须是原操作，不能一律退回检查。 */
export function retryRoundTrip(trip: RoundTrip, outcome: RoundTripOutcome): RoundTrip | undefined {
  const { retry } = outcome.actions;
  return retry ? { source: trip.source, operation: retry } : undefined;
}
