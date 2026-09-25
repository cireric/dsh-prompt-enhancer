/**
 * 输入框旁「AI 优化」按钮：把点击那一刻的草稿快照交给宿主 `/ai/polish` 润色，
 * 在结果面板里对比原文/优化稿后定稿；面板里还能把**同一份快照**交给 `/ai/refine`
 * 做一键完善，并把完善稿「存入词库」（先存原文、再写回完善稿两步）。
 *
 * **T1（P7）**：本面板是共享 claim 的三个面之一（`ai`）。渲染门 = `status !== 'idle' && canRender(...)`，
 * 与词库面板 / `#` 浮层读同一个寄存器 ⇒ 同屏在结构上不可能（修 I2-1 / I2-2）。取/放纪律见
 * `aiVisible` 与 claim effect 的注释（本面是三者里唯一「只取空屏」的长驻面板）。
 *
 * 注册在 `conversation.input.left`（order 11，紧跟 P4 的词库按钮）；props 由
 * `PropsRuntime`（session 标准 props 已内含 `useInput` / `inputActions`）与
 * `PropsLocale` 组成。
 *
 * 副作用只走官方动作面：读草稿 `useInput`，写草稿 `inputActions.setDraft`（规格 §7.2）；
 * 落库走 `capture.ts#createFromCapture`（R31：与其它沉淀入口同一入口，故 §4.4 的淘汰二次确认
 * 同样覆盖这里，不再有「AI 面板静默物理删除」的口子），写回只走 `ai-flow.ts#writeBackRefined`
 * （§4.4 的唯一写回缝 = `api.updatePrompt(…, { aiWriteBack: true })`；**成功之后**播种方向记录
 * `pl:refined-dir:<id>` = `refined`——本功能里方向**真正可知**的唯一一点，见 T4 修复轮 1/R-P7-AC），
 * `api.rollbackPrompt` 已随切换入口一并迁往管理面板详情页（§13.8 决定二）；
 * 不改宿主路由、不直接写 `sourceBody`。落库入参、是否需要写回、能否切换一律交给任务 1 的纯函数
 * （`ai-flow.ts#libraryCreateInput` / `#needsWriteBack` / `#canToggle`），组件不重复判定；
 * 「AI 是否可用」「是否保留 {{变量}}」同理（`ai-flow.ts#aiErrorKey` / `#keepVariablesFor`）。
 * 超时由 `api.polishPrompt` / `api.refinePrompt` 内部的 120s signal 负责，本组件不传也不设超时。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { canRender } from "../../overlay-claim.ts";
import { DEFAULT_SETTINGS, type PluginSettings, type Prompt } from "../../types.ts";
import { aiErrorKey, canToggle, keepVariablesFor, libraryCreateInput, needsWriteBack, writeBackRefined } from "../utils/ai-flow.ts";
import { api, type AiRefineResult, type AiSelectable } from "../utils/api.ts";
import { createFromCapture, type CaptureOutcome } from "../utils/capture.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { seedRefinedDirection } from "../utils/refined-direction.ts";
import { TOKEN, overlayBase } from "../utils/theme.ts";
import { claimOverlayIfFree, releaseOverlay, useOverlayClaim } from "../utils/ui-state.ts";

/** 输入框旁「AI 优化」按钮。 */
export type AIPolishButtonProps =
  PropsRuntime<"conversation.input.left"> & PropsLocale<"prompt-enhancer">;

/**
 * 面板状态机。三条主线各自成型，`refining` 失败退回 `done`（面板内加一行错误），
 * `error` 是润色失败的唯一出口：
 *   - 润色：polishing → done / error
 *   - 完善：refining → refined（面内是 AI 标题/标签/摘要 + 可编辑完善稿）
 *   - 存库：saving → saved / saveFailed / writeBackFailed
 * 注意面板里的 pill 对比（`done` 态）只是**同一份结果的两种样子**，不是库侧的版本切换：
 * 规格 §13.8 决定二把「原文 ↔ 优化稿」的并排对比与 `rollbackPrompt` swap 迁到管理面板详情页
 * （`PromptManagerModal`），故 `saved` 态只剩「已存入词库」+ **指向详情页的提示**，不再有切换按钮。
 */
type Status =
  | "idle"
  | "polishing"
  | "done"
  | "error"
  | "refining"
  | "refined"
  | "saving"
  | "saved"
  | "saveFailed"
  | "writeBackFailed";

/** 「已复制」的回退时长（与 P4 notice 同款：自动消失，不打断输入）。 */
const COPIED_MS = 2000;

/** `saved` 态的 body 预览上限：截断后配合 `overflowWrap:anywhere`，让用户看见切换真的换了版本。 */
const PREVIEW_MAX = 120;

/** 长正文截断成一行预览（不改变正文，只影响展示）。 */
function previewText(body: string): string {
  return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX) + "…" : body;
}

/** 失败原因给人看的那一行：Error 自带可读 message，其余 String()。 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 润色星标：内联四角星，不引任何图标依赖（不引 ui-primitives）。 */
function SparkleIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={ICON}>
      <path
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AIPolishButton({ t, useInput, inputActions }: AIPolishButtonProps): React.ReactElement | null {
  const draft = useInput((s) => s.draft);
  /** null = 设置未就绪：先不渲染按钮，避免「本该隐藏却又闪一下」。 */
  const [settings, setSettings] = React.useState<PluginSettings | null>(null);
  const [status, setStatus] = React.useState<Status>("idle");
  /** 点击那一刻的草稿快照（D-P5-5）：「原文」永远是它，润色与完善都用它当输入。 */
  const [original, setOriginal] = React.useState("");
  const [polished, setPolished] = React.useState("");
  const [showOriginal, setShowOriginal] = React.useState(false);
  /** 一键完善的 AI 产出（标题/标签/摘要 + 正文）；正文可编辑，存库与落草稿都取它。 */
  const [refined, setRefined] = React.useState<AiRefineResult | null>(null);
  /** 存库后的本地记录：create 之后是它，写回/回滚各用返回值整条替换。 */
  const [saved, setSaved] = React.useState<Prompt | null>(null);
  /** 本次 create 触发了超限淘汰（二次确认归 P6，本任务只做可见性）。 */
  const [evicted, setEvicted] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<PromptEnhancerKey | null>(null);
  /** 一键完善的失败：只作 `done` 面板内一行，不推翻已有润色结果。 */
  const [refineErrorKey, setRefineErrorKey] = React.useState<PromptEnhancerKey | null>(null);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  /** 可用性探测缓存（D-P5-7）：null = 未探测；组件重挂载才重探，失败不落缓存。 */
  const providersRef = React.useRef<AiSelectable[] | null>(null);
  /** 调用闸门：ref 同步生效（state 的 disabled 要等渲染），覆盖「探测 → 润色/完善/存库/切换」整段。 */
  const busyRef = React.useRef(false);
  /** 卸载守卫（P4 惯例）：异步回调不再 setState；重挂载时复位，避免 StrictMode 双挂后永久失活。 */
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /**
   * 共享 claim（T1 的接线，修 I2-1 / I2-2）：`claimed` 是**当前占屏的那个面**，与词库面板 / `#` 浮层
   * 读同一帧的同一个值。
   */
  const claimed = useOverlayClaim();
  /** 本面的前置条件：有结果在手上（`status !== 'idle'`）——它是**长驻状态**，不是一次「激活」。 */
  const aiWanted = status !== "idle";
  /**
   * 渲染门（T1 起读共享 claim）：**有面可显示** `aiWanted` **且** 屏**真的在本面手里**。
   *
   * P6 的实测（I2-1 / I2-2）就是这条门缺失的后果：原门只有 `status !== 'idle'`（P6 §1.4 的
   * `AIPolishButton.tsx:413`），而它与另两面没有任何互斥——真实 `Shift+Tab` 回输入框后真实键入 `#`
   * （无 pointerdown）87 帧里 84 帧同屏；真实 `Tab`+`Enter`（`detail=0`）90/90 帧全程同屏、本面板的
   * 锚点 `z=31` 压住词库面板 `z=30` 的 79% 面积。门读 claim 后，同屏在**结构上**不可能。
   */
  const aiVisible = aiWanted && canRender("ai", claimed);

  /**
   * claim 接线（T1）：**只取空屏**（`claimOverlayIfFree`：写入那一刻寄存器真的空着才取），被别面占着
   * 就让位，屏一空出来再取。
   *
   * 为什么本面不抢——这与词库面板 / `#` 浮层**刻意不同**：
   *  - 那两面的前置条件是**一次激活**（点击 / 令牌出现），抢屏＝「最新意图胜出」，抢完不会把谁永久压住
   *    （词库面板被位移时收回 `open`，浮层被收起时令牌已不在）；
   *  - 本面的前置条件是**长驻状态**（有结果在手上，直到用户关闭或应用结果）。若它也抢，被它压住的
   *    `#` 浮层会在令牌仍在草稿里时**永久静默**（浮层的可见性由令牌派生，被抢后**没有**重新取屏的
   *    时机）——那是比同屏更坏的缺陷（P4 的核心能力看不见了）。
   *
   * 「被占着就让位」的后果：本面板在别面在场时不渲染，但**状态一点不动**（`status` 与全部文本保留）——
   * 屏一空出来就自己取回，用户看到的还是同一份结果（例如「存入词库」在途时面板被 `#` 浮层让位，
   * 存完的状态回来时仍然在）。这条不构成 R57 的「延后兑现」：R57 管的是**被拦下的激活**不得排队兑现
   * （那条由库侧 R60 的动作侧闸门保证：非指针激活 + 浮层在场 ⇒ 直接 return，连 `open` 都不置位），
   * 本面是**已经在场**的面让位又回来，不是一次激活被延后。
   *
   * 隐藏（`status` 回 idle ⇒ `close()`）与卸载都必须释放（P6 的教训：留成占位会把别的面压住）。
   * 释放是**条件式**的：`releaseOverlay` 只清自己持有的，别面收尾时不会连带清掉我们。
   */
  React.useEffect(() => {
    if (!aiWanted) {
      releaseOverlay("ai");
      return;
    }
    // **活寄存器**，不是本次渲染的快照（修复轮 1 的评审发现）：`claimOverlayIfFree` 把「此刻是否真的
    // 空着」的判定与写入收进 store（同步、原子）。用 `claimed` 快照做守卫是 TOCTOU：本 effect 在**提交
    // 之后**才跑，而 `claimed` 是**本次渲染那一刻**的值——提交与本次 flush 之间，寄存器可能已被更早的
    // effect（`#` 浮层所在的 slot 在本 slot 之前 ⇒ 它先抢）或两次事件之间的一个回调（词库 onClick 的
    // `claimOverlay("library")`）改写；那样 `claimOverlay("ai")` 就成了**无条件最后写者**：在屏的
    // `#` 浮层被压掉，而它的 `visible` 不跳变 ⇒ 令牌仍在却**没有重取时机** = 永久静默（比同屏更坏）。
    //
    // deps 保留 `claimed`：它是**唤醒信号**——别面释放（寄存器转 `none`）时本 effect 必须重跑来取屏，
    // 否则本面要等到下一次无关渲染才有机会上屏；`claimOverlayIfFree` 自身幂等，重跑无副作用。
    claimOverlayIfFree("ai");
  }, [aiWanted, claimed]);

  /** 卸载即释放（宿主收走插槽时；此时组件不再渲染，上面那条 effect 不会跑）。 */
  React.useEffect(() => () => releaseOverlay("ai"), []);

  // 设置只读一次；读失败退回默认值（按钮照常可用），原因留在 console。
  React.useEffect(() => {
    let alive = true;
    api.getSettings().then(
      (value) => {
        if (alive) setSettings(value);
      },
      (err: unknown) => {
        console.warn("[prompt-enhancer] 设置读取失败，本次按默认设置显示按钮", err);
        if (alive) setSettings(DEFAULT_SETTINGS);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 面板整体收起：状态、两份文本、完善结果、库记录、三类错误、复制提示一并归零
   * （探测缓存刻意保留）。**所有**关闭路径（关闭按钮 / 外面 click / 应用后）都走这里，
   * 任何半清空都会让切换与预览读到 stale 记录。
   */
  const close = (): void => {
    setStatus("idle");
    setOriginal("");
    setPolished("");
    setShowOriginal(false);
    setRefined(null);
    setSaved(null);
    setEvicted(false);
    setSaveError(null);
    setErrorKey(null);
    setRefineErrorKey(null);
    setCopied(false);
  };

  // 点浮层外收起。宿主标准 props 没有「点外面关」的座位；官方 ui-commands 的
  // PopupSelectView 同样用 document 捕获阶段的 pointerdown（纯监听，不改宿主 DOM）。
  // 只在面板「已定型」（有可停留的结果）时挂：调用/存库中关面板会让回来的结果无处安放。
  const settled =
    status === "done" ||
    status === "error" ||
    status === "refined" ||
    status === "saved" ||
    status === "saveFailed" ||
    status === "writeBackFailed";
  React.useEffect(() => {
    if (!settled) return;
    const onPointerDown = (ev: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && ev.target instanceof Node && root.contains(ev.target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [settled]);

  // 已复制提示自动消失。
  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [copied]);

  /**
   * 润色主线：点击那一刻的草稿快照 → 探测 → 调用 → 结果/错误。
   *
   * 重入闸门覆盖**整段**（含探测期）：`busyRef` 在第一个 await 之前同步置位
   * （state 的 disabled 要等渲染，ref 不用），状态也在同一拍切到 `polishing`，
   * 因此探测期间按钮已 disabled、aria-busy、状态行可见——双击不会重发 GET，
   * 也不会让两个 run 去争同一个 LLM 锁。
   */
  const run = (snapshot: string): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    setErrorKey(null);
    setRefineErrorKey(null);
    setOriginal(snapshot);
    setShowOriginal(false);
    setCopied(false);
    setStatus("polishing");
    void (async () => {
      try {
        let providers = providersRef.current;
        if (providers === null) {
          try {
            providers = await api.listAiProviders();
          } catch (err) {
            // 探测失败不落缓存：可能是瞬时故障，下次点击值得重试（闸门由 finally 打开）。
            console.warn("[prompt-enhancer] AI 可用性探测失败", err);
            if (!aliveRef.current) return;
            setErrorKey(aiErrorKey(err));
            setStatus("error");
            return;
          }
          providersRef.current = providers;
        }
        if (providers.length === 0) {
          // 未配置任何可用模型：只出这一行，不调 AI（验收 13）。
          if (!aliveRef.current) return;
          setErrorKey("ai.unavailable");
          setStatus("error");
          return;
        }
        try {
          const result = await api.polishPrompt(snapshot, { keepVariables: keepVariablesFor(snapshot) });
          if (!aliveRef.current) return;
          setPolished(result.polished);
          setStatus("done");
        } catch (err) {
          console.warn("[prompt-enhancer] AI 优化失败", err);
          if (!aliveRef.current) return;
          setErrorKey(aiErrorKey(err));
          setStatus("error");
        }
      } finally {
        // 三条出口（探测失败 / 不可用 / 调用成功或失败）都必须开闸，否则一次失败就再也点不动。
        busyRef.current = false;
      }
    })();
  };

  /**
   * 一键完善：输入是**点击时的草稿快照** `original`（与润色一致，不是当前草稿）。
   * 失败只退回去 `done` 加一行错误——已有的润色结果是有效产物，不为一次完善失败而丢弃
   * （润色本身要等最长 2 分钟，丢掉等于让用户重来）。
   */
  const refine = (): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefineErrorKey(null);
    setSaveError(null);
    setStatus("refining");
    void (async () => {
      try {
        const result = await api.refinePrompt(original);
        if (!aliveRef.current) return;
        setRefined(result);
        setStatus("refined");
      } catch (err) {
        console.warn("[prompt-enhancer] 一键完善失败", err);
        if (!aliveRef.current) return;
        setRefineErrorKey(aiErrorKey(err));
        setStatus("done");
      } finally {
        busyRef.current = false;
      }
    })();
  };

  /**
   * 存入词库（严格两步，每步失败都有可见后果）：
   *   1. `createPrompt` 落**原文**（`libraryCreateInput` 的 body 恒为 original）——库里不留半成品；
   *   2. 完善稿 ≠ 原文时 `writeBackRefined(…)` → `updatePrompt(id, { body: 完善稿, aiWriteBack: true })`
   *      触发宿主回填 `sourceBody`，**成功之后**播种方向记录（`refined`）。
   * 第 2 步失败**必须明说**：库里那条的 body 是原文（不是损坏数据），但优化稿没写回，
   * 面内给 `ai.writeBackFail` + 原因 + 「重试写回」，不得假装已存好。
   * 完善稿 ≡ 原文则不写回（宿主不回填 `sourceBody`），界面按 `canToggle` 显示 `ai.sameAsOriginal`。
   */
  const save = (): void => {
    if (busyRef.current || refined === null) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    void (async () => {
      try {
        let outcome: CaptureOutcome;
        try {
          outcome = await createFromCapture(libraryCreateInput(refined, original));
        } catch (err) {
          console.warn("[prompt-enhancer] 存入词库失败", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf(err));
          setStatus("saveFailed");
          return;
        }
        if (!aliveRef.current) return;
        // 淘汰二次确认里被取消（R31 + §4.4）：**第 2 步不进入**（没有 id 可写回），
        // 静静退回完善态——取消不是失败，不得走 saveFailed。
        if (!outcome.ok) {
          setStatus("refined");
          return;
        }
        setSaved(outcome.prompt);
        setEvicted(outcome.evicted.length > 0);
        if (!needsWriteBack(refined.body, original)) {
          setStatus("saved");
          return;
        }
        try {
          const updated = await writeBackRefined({
            promptId: outcome.prompt.id,
            body: refined.body,
            update: api.updatePrompt,
            seed: seedRefinedDirection,
          });
          if (!aliveRef.current) return;
          setSaved(updated);
          setStatus("saved");
        } catch (err) {
          console.warn("[prompt-enhancer] 优化稿写回失败（原文已入库）", err);
          if (!aliveRef.current) return;
          setSaveError(reasonOf(err));
          setStatus("writeBackFailed");
        }
      } finally {
        busyRef.current = false;
      }
    })();
  };

  /** 写回重试：只重跑第 2 步（记录 id 来自第 1 步的返回值，仍在 `saved` 里）。 */
  const retryWriteBack = (): void => {
    if (busyRef.current || saved === null || refined === null) return;
    busyRef.current = true;
    setSaveError(null);
    setStatus("saving");
    void (async () => {
      try {
        const updated = await writeBackRefined({
          promptId: saved.id,
          body: refined.body,
          update: api.updatePrompt,
          seed: seedRefinedDirection,
        });
        if (!aliveRef.current) return;
        setSaved(updated);
        setStatus("saved");
      } catch (err) {
        console.warn("[prompt-enhancer] 优化稿写回重试失败", err);
        if (!aliveRef.current) return;
        setSaveError(reasonOf(err));
        setStatus("writeBackFailed");
      } finally {
        busyRef.current = false;
      }
    })();
  };

  const copy = (text: string): void => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        if (aliveRef.current) setCopied(true);
      } catch (err) {
        console.warn("[prompt-enhancer] 复制失败", err);
      }
    })();
  };

  /** 「应用到输入框」：覆盖**当前**草稿（原文只是快照，不回写）；完善稿可能含 `{{变量}}`，交给 P4 既有行为。 */
  const apply = (text: string): void => {
    inputActions.setDraft(text);
    close();
  };

  if (settings === null || settings.showAIPolishButton === false) return null;

  // 调用/完善/存库三态同属「忙」：按钮置灰、aria-busy、状态行可见，重入由 busyRef 兜底。
  // 提示文案按阶段取值：refining 是另一次 AI 调用、saving 是本地写库，都不该沿用
  // polishing 那句「正在调用 AI…（最长约 2 分钟）」。
  const busyKey: PromptEnhancerKey | null =
    status === "polishing"
      ? "ai.polishing"
      : status === "refining"
        ? "ai.refining"
        : status === "saving"
          ? "ai.saving"
          : null;
  const empty = draft.trim() === "";
  const hint = busyKey !== null ? t(busyKey) : empty ? t("ai.empty") : t("ai.tip");
  /** 淘汰提示：写回失败时也必须可见（那时 status 不是 saved，但淘汰已经真实发生）。 */
  const evictedNotice = evicted ? <span style={MUTED}>{t("ai.evicted")}</span> : null;
  const showRefined = status === "refined" || status === "saveFailed";
  const dialogLabel =
    status === "done"
      ? t("ai.result")
      : showRefined || status === "saving" || status === "writeBackFailed"
        ? t("ai.refined")
        : status === "saved"
          ? t("ai.saved")
          : t("ai.button");

  return (
    <span ref={rootRef} style={WRAP}>
      <button
        type="button"
        style={{ ...BUTTON, cursor: empty || busyKey !== null ? "default" : "pointer", opacity: empty || busyKey !== null ? 0.6 : 1 }}
        title={hint}
        aria-label={t("ai.button")}
        aria-busy={busyKey !== null}
        disabled={empty || busyKey !== null}
        onClick={() => {
          if (empty) return;
          run(draft);
        }}
      >
        <SparkleIcon />
        {settings.aiPolishButtonIconOnly === false && <span>{t("ai.button")}</span>}
      </button>
      {aiVisible && (
        <span style={ANCHOR}>
          <span role="dialog" aria-label={dialogLabel} style={PANEL}>
            {busyKey !== null && (
              <span role="status" aria-live="polite" style={MUTED}>
                {t(busyKey)}
              </span>
            )}
            {status === "error" && (
              <>
                <span role="status" aria-live="polite" style={MUTED}>
                  {errorKey === null ? t("ai.fail") : t(errorKey)}
                </span>
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                </span>
              </>
            )}
            {status === "done" && (
              <>
                <span style={HEADER}>{t("ai.result")}</span>
                {refineErrorKey !== null && (
                  <span role="status" aria-live="polite" style={MUTED}>
                    {t(refineErrorKey)}
                  </span>
                )}
                <span style={PILLS}>
                  <button
                    type="button"
                    style={pill(!showOriginal)}
                    aria-pressed={!showOriginal}
                    onClick={() => setShowOriginal(false)}
                  >
                    {t("ai.polished")}
                  </button>
                  <button
                    type="button"
                    style={pill(showOriginal)}
                    aria-pressed={showOriginal}
                    onClick={() => setShowOriginal(true)}
                  >
                    {t("ai.original")}
                  </button>
                </span>
                <textarea
                  value={showOriginal ? original : polished}
                  readOnly={showOriginal}
                  rows={7}
                  aria-label={t(showOriginal ? "ai.original" : "ai.polished")}
                  onChange={(ev) => setPolished(ev.target.value)}
                  style={{ ...TEXTAREA, opacity: showOriginal ? 0.75 : 1 }}
                />
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={refine}>
                    {t("ai.refine")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={() => copy(polished)}>
                    {copied ? t("ai.copied") : t("ai.copy")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                  <button
                    type="button"
                    style={{ ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent }}
                    onClick={() => apply(polished)}
                  >
                    {t("ai.apply")}
                  </button>
                </span>
              </>
            )}
            {showRefined && refined !== null && (
              <>
                <span style={HEADER}>{t("ai.refined")}</span>
                {status === "saveFailed" && (
                  <span role="alert" style={ERROR}>
                    <span>{t("ai.saveFail")}</span>
                    {saveError !== null && (
                      <span style={ERROR_DETAIL} title={saveError}>
                        {saveError}
                      </span>
                    )}
                  </span>
                )}
                <span style={META}>
                  <span style={META_KEY}>{t("ai.fieldTitle")}</span>
                  <span style={META_VALUE}>{refined.title}</span>
                  <span style={META_KEY}>{t("ai.fieldTags")}</span>
                  <span style={META_VALUE}>{refined.tags.join(" / ")}</span>
                  <span style={META_KEY}>{t("ai.fieldSummary")}</span>
                  <span style={META_VALUE}>{refined.summary}</span>
                </span>
                <textarea
                  value={refined.body}
                  rows={7}
                  aria-label={t("ai.refined")}
                  onChange={(ev) => setRefined({ ...refined, body: ev.target.value })}
                  style={TEXTAREA}
                />
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={save}>
                    {t("ai.save")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={() => copy(refined.body)}>
                    {copied ? t("ai.copied") : t("ai.copy")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                  <button
                    type="button"
                    style={{ ...PANEL_BUTTON, borderColor: TOKEN.accent, color: TOKEN.accent }}
                    onClick={() => apply(refined.body)}
                  >
                    {t("ai.apply")}
                  </button>
                </span>
              </>
            )}
            {status === "writeBackFailed" && (
              <>
                <span role="alert" style={ERROR}>
                  <span>{t("ai.writeBackFail")}</span>
                  {saveError !== null && (
                    <span style={ERROR_DETAIL} title={saveError}>
                      {saveError}
                    </span>
                  )}
                </span>
                {evictedNotice}
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={retryWriteBack}>
                    {t("ai.retryWriteBack")}
                  </button>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                </span>
              </>
            )}
            {status === "saved" && saved !== null && (
              <>
                <span role="status" aria-live="polite" style={MUTED}>
                  {t("ai.saved")}
                </span>
                {evictedNotice}
                {/* §13.8 决定二：库侧的「原文 ↔ 优化稿」并排对比与切换已迁往管理面板详情页，
                    这里只留指向它的提示（验收 6 的切换能力由详情页承担）。 */}
                {canToggle(saved) ? (
                  <span style={MUTED}>{t("ai.toggleMoved")}</span>
                ) : (
                  <span style={MUTED}>{t("ai.sameAsOriginal")}</span>
                )}
                <span style={PREVIEW}>{previewText(saved.body)}</span>
                <span style={ACTIONS}>
                  <button type="button" style={PANEL_BUTTON} onClick={close}>
                    {t("ai.close")}
                  </button>
                </span>
              </>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

const WRAP: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const ICON: React.CSSProperties = { display: "block", flex: "0 0 auto" };

const BUTTON: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 24,
  padding: "0 8px",
  fontSize: 12,
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
};

/** 浮层落点：贴按钮上沿（同 P4 词库面板）；zIndex 31 压在词库面板（30）之上。 */
const ANCHOR: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 31,
  maxWidth: "calc(100vw - 24px)",
};

/** 面板容器：设计上限 380，超出在卡内滚动。 */
const PANEL: React.CSSProperties = {
  ...overlayBase,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 380,
  maxHeight: 420,
  overflowY: "auto",
  padding: 8,
  fontSize: 12,
};

const HEADER: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, fontWeight: 600 };

const MUTED: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, overflowWrap: "anywhere" };

const ERROR: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.fg,
  fontSize: 11,
};

const ERROR_DETAIL: React.CSSProperties = { color: TOKEN.muted, overflowWrap: "anywhere" };

/** AI 标题/标签/摘要的只读展示：两列贴齐，值允许为空（P6 才给编辑面）。 */
const META: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: 6,
  rowGap: 2,
  alignItems: "baseline",
};

const META_KEY: React.CSSProperties = { color: TOKEN.muted, fontSize: 11, whiteSpace: "nowrap" };

const META_VALUE: React.CSSProperties = { color: TOKEN.fg, fontSize: 11, overflowWrap: "anywhere" };

/** 当前 body 预览：截断 + 任意断行，长 URL / 无空格正文不撑破面板。 */
const PREVIEW: React.CSSProperties = {
  color: TOKEN.muted,
  fontSize: 11,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  maxHeight: 72,
  overflowY: "auto",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "4px 6px",
};

const PILLS: React.CSSProperties = { display: "flex", gap: 4, alignItems: "center" };

/** 原文/优化稿切换 pill；选中态用 accent 描边。 */
const pill = (active: boolean): React.CSSProperties => ({
  padding: "1px 10px",
  fontSize: 11,
  lineHeight: "16px",
  color: active ? TOKEN.accent : TOKEN.muted,
  background: "transparent",
  border: `1px solid ${active ? TOKEN.accent : TOKEN.border}`,
  borderRadius: 999,
  cursor: "pointer",
});

const TEXTAREA: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  padding: "6px 8px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};

const ACTIONS: React.CSSProperties = { display: "flex", gap: 6, justifyContent: "flex-end" };

const PANEL_BUTTON: React.CSSProperties = {
  padding: "2px 8px",
  fontSize: 11,
  lineHeight: "16px",
  color: TOKEN.fg,
  background: "transparent",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  cursor: "pointer",
};
