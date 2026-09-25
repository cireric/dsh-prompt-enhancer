/**
 * 上下文推荐条（规格 §7.1.1 / 验收 11）：常驻 composer 卡片**上方**的一整行。
 *
 * 落点在 `conversation.input.dock`（`kind: list` / `scope: session` / owner `InputZone`）：
 * 属主 props 给 `{ session, input }`——会话 id 取 `session.sessionId`（**不猜**），
 * 随座位注入的还有 `useInput`（读草稿）与 `inputActions`（写草稿）。证据（本宿主 0.1.5-rc.2 实测）：
 * `packages/client/ui-conversation/src/client/contract/slots.ts:166,242-245` 与
 * `skeleton/ConversationRoot.tsx:350`（有会话才渲染本座位）。**本宿主版本没有 `props.useSession`
 * 这个旧面**，故只走属主 props + 座位标准套件。
 *
 * 判定一律在纯模块 `utils/context-recommend.ts`（零 React，`node --test` 直测）：本文件只做
 * 「读草稿 + 读最近聊天上下文 + 取词库 → recommend() → 渲染」。聊天上下文经条件注入的
 * `uiConversation`（`utils/conversation-targets.ts`）读 `chat` 视图目标；服务缺席时
 * `useConversationTargetSnapshot` 返回 undefined ⇒ 退化为「只用当前草稿」，不崩（TBD-P8-4 的降级）。
 *
 * 纪律：
 *  · **不参与 overlay-claim**（D-P8-6）：本行常驻在 composer 上方，不是浮层，不进 `overlay-claim.ts`
 *    的互斥寄存器、不改它的枚举；
 *  · 点击 ⇒ 含变量的提示词走宿主**既有**的 `TemplateVariablesDialog`（**不重写第二份**），确认后
 *    **先** `api.recordUsage(p.id)`（`POST /prompts/:id/use`）**再** `inputActions.setDraft(...)`（D-P8-9）；
 *    无变量的直接插入并计用量；
 *  · 零 DOM 写入、零 keydown|keyup|keypress 监听（§7.3 / §13.9-四）：读草稿只经座位注入的 `useInput`，
 *    悬停态不用 `onMouseEnter` 改 style（那正是 DOM 写入）；
 *  · 全部文案走 `t()`（键同步落在 `utils/i18n.ts` 的 zh/en 两表）。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { clampTitle, type Prompt } from "../../types.ts";
import { api } from "../utils/api.ts";
import { recentUserText, recommend } from "../utils/context-recommend.ts";
import { useConversationTargetSnapshot } from "../utils/conversation-targets.ts";
import { useDataChanged } from "../utils/data-sync.ts";
import { composeDraft } from "../utils/insert.ts";
import { useSettings } from "../utils/settings-store.ts";
import { needsValues } from "../utils/template.ts";
import { TOKEN } from "../utils/theme.ts";
import { TemplateVariablesDialog } from "./TemplateVariablesDialog.tsx";

/** 输入框上方推荐条（验收 11）。 */
export type ContextRecommendationsProps =
  PropsRuntime<"conversation.input.dock"> & PropsLocale<"prompt-enhancer">;

/**
 * 宿主 chat 视图目标快照的**结构最小面**（只声明本插件读取的字段，不 import 宿主包——
 * 与 `conversation-targets.ts` 的 `UiConversationService` 同一纪律）。
 * 形状实测于 `packages/client/ui-chat/src/client/contract/snapshot.ts:83-99`（`legacy.nodes`）与
 * `packages/client/ui-conversation/src/client/contract/records.ts:41-48`（`UserMessageNode`）。
 */
interface ChatContentBlockLike {
  readonly type?: string;
  readonly text?: string;
}
interface ChatNodeLike {
  readonly kind?: string;
  readonly content?: readonly ChatContentBlockLike[];
}
interface ChatSnapshotLike {
  readonly legacy?: { readonly nodes?: readonly ChatNodeLike[] };
}

/** 从内容块里取可见文本（只有 `type === 'text'` 的块带正文；reasoning/image/tool 全部忽略）。 */
function textOf(content: readonly ChatContentBlockLike[]): string {
  let out = "";
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") out += block.text + "\n";
  }
  return out.trim();
}

/**
 * 用户消息的可见文本（快照缺席 ⇒ 空数组，推荐退化为「只用当前草稿」）。
 *
 * 只做「节点 → 文本」这一半：那是宿主形状（`legacy.nodes` / `UserMessageNode`），留在组件里。
 * 「取最近 `CONTEXT_USER_COUNT` 条」那一半在纯模块 `recentUserText()` 里——规格 §7.1.1 的确定参数
 * 只有落进纯模块才拿得到自动化判据（无 react-dom，硬约束 5）。
 */
function userMessageTexts(snapshot: ChatSnapshotLike | undefined): string[] {
  const nodes = snapshot?.legacy?.nodes;
  if (nodes === undefined) return [];
  return nodes.filter((node) => node.kind === "user").map((node) => textOf(node.content ?? []));
}

export function ContextRecommendations({
  session,
  useInput,
  inputActions,
  t,
}: ContextRecommendationsProps): React.ReactElement | null {
  const settings = useSettings();
  const draft = useInput((s) => s.draft);
  const chat = useConversationTargetSnapshot<ChatSnapshotLike>(session.sessionId, "chat");
  /** null = 还没拉回来（此时不渲染：常驻条不该用加载态占位）。 */
  const [prompts, setPrompts] = React.useState<readonly Prompt[] | null>(null);
  /** 已点击的含变量提示词：非空即变量填窗打开（列表让位给弹窗）。 */
  const [pending, setPending] = React.useState<Prompt | null>(null);

  /** 重拉词库快照（不阻塞渲染；失败可见：留 console 痕迹 + 按空列表处理）。 */
  const load = (): void => {
    api.listPrompts().then(
      (list) => setPrompts(list),
      (err: unknown) => {
        console.warn("[prompt-enhancer] 推荐条加载提示词失败", err);
        setPrompts([]);
      },
    );
  };
  // 挂载拉一次。只依赖 []：`load` 每次渲染都是新函数，进依赖会让它变成重拉循环（与词库按钮同因）。
  React.useEffect(() => {
    load();
  }, []);
  // 同页增删改（词库面板 / 导入 / 技能回写）后重拉：走既有 data-sync 通道（规格 §3.3 / D6）。
  useDataChanged(load, []);

  // 设置经**订阅式** store 读（P8 T1）：关掉「上下文推荐」⇒ 下一次渲染立刻清空（验收 12 的即时生效）。
  const hits = settings.contextRecommendEnabled
    ? recommend({ draft, contextText: recentUserText(userMessageTexts(chat)), prompts: prompts ?? [], now: Date.now() })
    : [];

  /**
   * 落草稿 + 上报用量（D-P8-9：**先**计用量、**再**写草稿）。
   *
   * 用量上报不阻塞 UI；失败必须可见（console 留痕），与词库面板 / `#` 浮层同款处理。
   * 插入语义复用 `composeDraft(..., "insert")`（本仓库唯一的一份插入语义：草稿非空换行追加、
   * 空草稿直接写入），不另抄一份三元表达式。
   */
  const apply = (prompt: Prompt, body: string): void => {
    setPending(null);
    void api.recordUsage(prompt.id).catch((err: unknown) => {
      console.warn("[prompt-enhancer] " + t("error.use"), err);
    });
    inputActions.setDraft(composeDraft(draft, body, "insert").draft);
  };

  /** 有变量先填变量（复用任务 5 的变量填窗），填完再走 apply。 */
  const choose = (prompt: Prompt): void => {
    if (needsValues(prompt.body)) setPending(prompt);
    else apply(prompt, prompt.body);
  };

  if (pending !== null) {
    // 落点：变量填窗**自身不做定位**（见 `TemplateVariablesDialog` 文件头——「落点由调用方决定」），故这里照
    // `PromptLibraryButton` 那一处的**既有形状**：一行 `position: relative` 的容器 + 一枚
    // `bottom: calc(100% + 6px)` 的绝对定位包装 ⇒ 卡片**浮在本行之上**（本行就是 composer 上方那一条），
    // 而不是内联挤在这条 dock 行里。行内没有流内内容 ⇒ 行不占高 ⇒ composer 不发生位移。
    // 不照搬 `HashSuggestOverlay` 的 `bottom: 8 / left: 8`：那是宿主零高 `.overlayAnchor` 内的相对坐标，
    // 本组件没有那个容器。不新增座位、不新增依赖、不另造第三套定位方案。
    return (
      <div style={ROW_ANCHOR}>
        <div style={DIALOG_ANCHOR}>
          <TemplateVariablesDialog
            body={pending.body}
            t={t}
            onCancel={() => setPending(null)}
            onFilled={(filled) => apply(pending, filled)}
          />
        </div>
      </div>
    );
  }

  // 关闭开关 / 草稿为空（规格 §7.1.1 的触发条件，判定在 recommend 里）/ 无命中 ⇒ 一个盒子都不渲染。
  // 「清空草稿 ⇒ 推荐条消失」正是这一行：`hits` 由草稿派生，不需要任何清理时机。
  if (hits.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t("recommend.title")}
      style={BAR}
      // 活体验收（T8/T10）的**单源读数**：与 data-prompt-enhancer-claim 同口径的声明式渲染，
      // 不是 DOM 注入。条数即读数；无命中时本节点不存在（清空草稿的负向判据）。
      data-prompt-enhancer-recommend={hits.length}
    >
      <span style={LABEL}>{t("recommend.title")}</span>
      {hits.map((hit) => (
        <button
          key={hit.id}
          type="button"
          style={CHIP}
          // 长标题在条内截断，完整标题与正文交给 aria-label / 原生 title（不写 DOM）。
          title={hit.body}
          aria-label={hit.title}
          onClick={() => choose(hit)}
        >
          {clampTitle(hit.title)}
        </button>
      ))}
    </div>
  );
}

/** 填窗打开时的行容器：只提供定位上下文（行内没有流内内容 ⇒ 行不占高，composer 不位移）。 */
const ROW_ANCHOR: React.CSSProperties = { position: "relative" };

/**
 * 填窗浮层落点：贴本行上沿。值与语义照 `PromptLibraryButton` 的 ANCHOR（「只负责定位，卡片外观由
 * 内容自带」——卡片的 `overlayBase` 在 `TemplateVariablesDialog` 里），是本仓库既有的写法。
 */
const DIALOG_ANCHOR: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 30,
  maxWidth: "calc(100vw - 24px)",
};

/**
 * 整行容器：与 composer 卡片同宽同左缘（宿主变量 `--dsh-composer-card-max-width`，
 * 兜底 780px 与上游一致），故它看起来「贴着输入框上方」而不是整行拉满。
 */
const BAR: React.CSSProperties = {
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  width: "100%",
  maxWidth: "var(--dsh-composer-card-max-width, 780px)",
  margin: "0 auto",
  padding: "0 2px 6px",
  fontSize: 12,
  color: TOKEN.muted,
};

/** 行首标签（纯文字，不引图标依赖）。 */
const LABEL: React.CSSProperties = { flexShrink: 0, color: TOKEN.muted, fontSize: 11, fontWeight: 600 };

/** 单条推荐：一枚可点的胶囊。悬停态交给浏览器默认反馈，不改 style（零 DOM 写入）。 */
const CHIP: React.CSSProperties = {
  maxWidth: 220,
  height: 24,
  padding: "0 10px",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 12,
  background: "transparent",
  color: TOKEN.fg,
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
