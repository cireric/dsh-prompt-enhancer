/**
 * 管理面板（重写，P6-9(a) / R22 —— **不**移植上游 `LexiconManagerModal.tsx` 的 2075 行）。
 *
 * 由 `shell.overlay` 的 `PromptSurfaceHost` 承载；开合与页签选择来自 `ui-state.ts` 的模块级
 * store（D-P6-1：入口之间只经 store 耦合，组件不互相引用）。本文件因此**不持开合状态**：
 * 换页签也只调 `openManager(panel)`。
 *
 * R5：本任务只建**四页签外壳**——`list` 有真实内容（列表页 + 详情页），其余三页渲染占位文案；
 * T4/T5 只填内容、不改外壳。
 *
 * 副作用面只有三处：`api.*`（HTTP）、`notifyDataChanged()`（同进程数据同步，D6）、
 * `ui-state` 的动作。零键盘监听（**不注册 Escape**）、零 DOM 注入：点外面关由宿主的遮罩负责。
 */
import * as React from "react";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import {
  DEFAULT_SETTINGS,
  clampTitle,
  type PluginSettings,
  type Prompt,
  type PromptSort,
  type PromptWritablePatch,
} from "../../types.ts";
import { canToggle } from "../utils/ai-flow.ts";
import { ApiError, api } from "../utils/api.ts";
import { createFromCapture } from "../utils/capture.ts";
import { notifyDataChanged, useDataChanged } from "../utils/data-sync.ts";
import {
  actions,
  button,
  compareBlock,
  compareBody,
  compareGrid,
  compareHead,
  dialogBody,
  dialogHeader,
  dialogTab,
  dialogTabs,
  dialogTitle,
  errorDetail,
  errorText,
  fieldLabel,
  fieldRow,
  listRow,
  muted,
  primaryButton,
  rowMeta,
  rowText,
  rowTitle,
  select,
  surface,
  tagChip,
  textArea,
  textInput,
  toolbar,
} from "../utils/dialog-style.ts";
import type { PromptEnhancerKey } from "../utils/i18n.ts";
import { promptSummary } from "../utils/insert.ts";
import type { CapturePayload, ManagerPanel } from "../utils/ui-state.ts";
import { closeManager, openManager, takeCapture, useCapture } from "../utils/ui-state.ts";
import { ImportExportModal } from "./ImportExportModal.tsx";
import { RecycleManagePanel } from "./RecycleManagePanel.tsx";
import { TagManagePanel } from "./TagManagePanel.tsx";

/** 面板文案取值器：即 `PropsLocale<'prompt-enhancer'>` 的 `t`。 */
export type ManagerTranslate = TranslateNS<"prompt-enhancer">;

export interface PromptManagerModalProps {
  /** 宿主的命名空间翻译函数（由 `PromptSurfaceHost` 透传，面板自身不注册字典）。 */
  t: ManagerTranslate;
  /** 当前页签（来自 ui-state 的 store；切换走 `openManager`）。 */
  panel: ManagerPanel;
}

/** 头部四页签的**渲染顺序**（R5：外壳在本任务定下，T4/T5 只填内容）。 */
const PANEL_ORDER: readonly ManagerPanel[] = ["list", "tags", "trash", "transfer"];

/** 页签 → 文案键（页签按钮与面板 `aria-label` 共用一处，避免两处漂移）。 */
const PANEL_LABEL: Record<ManagerPanel, PromptEnhancerKey> = {
  list: "manager.tab.list",
  tags: "manager.tab.tags",
  trash: "manager.tab.trash",
  transfer: "manager.tab.transfer",
};

/**
 * 四个页签在 T5 收口后全部有真实内容（T2 立外壳、T4 填标签/回收站、T5 填导入导出）。
 * 原先的三个占位键（`manager.tags.pending` / `manager.trash.pending` / `manager.transfer.pending`）
 * 已成无引用死键，已由 T6（A8 / R39）连同这段注释一并清除——`tests/i18n.test.mjs` 的无死键检查
 * （A11 / R42）此后会拦住任何无人引用的新键。
 */

/** 排序下拉项：值与宿主 `GET /prompts?sort` 的枚举逐字一致（routes.ts 的白名单）。 */
const SORTS: ReadonlyArray<{ value: PromptSort; label: PromptEnhancerKey }> = [
  { value: "default", label: "manager.list.sortDefault" },
  { value: "updated", label: "manager.list.sortUpdated" },
  { value: "used", label: "manager.list.sortUsed" },
  { value: "created", label: "manager.list.sortCreated" },
];

/** 搜索防抖（简报要求 ≥250ms；取 300ms 留出余量）。 */
const SEARCH_DEBOUNCE_MS = 300;

/** 失败原因给人看的那一行：ApiError / Error 自带可读 message，其余 String()。 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 标签输入（逗号分隔）→ 数组：去空白、丢空项、保序去重（半角与全角逗号都认）。 */
function parseTagList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,，]/)) {
    const tag = raw.trim();
    if (tag !== "" && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** 标题兜底：用户没填时取正文**首个非空行**（与 `ai-flow#libraryCreateInput` 同口径）。 */
function fallbackTitle(body: string): string {
  const firstLine = body.split(/\r\n|\n|\r/).find((line) => line.trim() !== "") ?? "";
  return firstLine.trim();
}

/**
 * 落库入参：宿主 POST /prompts 与 PUT /prompts/:id 的白名单字段子集（title / body 必填，
 * 其余三个可省）。用同一个对象喂两个路由，避免两处字段各写一遍后漂移。
 */
interface PromptWriteInput extends PromptWritablePatch {
  title: string;
  body: string;
  tags: string[];
  summary: string;
}

/** 详情页的目标：新建（可能带沉淀预填）或编辑某条已存在的提示词。 */
type EditTarget =
  | { kind: "create"; prefill: CapturePayload | null }
  | { kind: "edit"; prompt: Prompt };

/**
 * 管理面板本体：头部（标题 + 四页签 + 关闭）恒定，内容区按 `panel` 分发。
 */
export function PromptManagerModal({ t, panel }: PromptManagerModalProps): React.ReactElement {
  /** 尺寸走设置（规格 §4.2）；读失败留 console 痕迹并沿用默认值，不挡面板打开。 */
  const [settings, setSettings] = React.useState<PluginSettings>(DEFAULT_SETTINGS);
  const [target, setTarget] = React.useState<EditTarget | null>(null);
  /** 沉淀载荷快照（ui-state 的 store）：非 null 说明入口 B/C 刚推进来一段正文。 */
  const capture = useCapture();

  React.useEffect(() => {
    let alive = true;
    api.getSettings().then(
      (value) => {
        if (alive) setSettings(value);
      },
      (err: unknown) => {
        console.warn("[prompt-enhancer] 设置读取失败，本次按默认尺寸显示管理面板", err);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 「详情页是否正持着未保存输入」（即 `target !== null`）：消费载荷的 effect 要读它，
   * 但不该把它放进依赖（否则用户每次进出详情页都会重跑消费逻辑）——故用 ref 镜像。
   */
  const editingRef = React.useRef(false);
  React.useEffect(() => {
    editingRef.current = target !== null;
  }, [target]);

  /**
   * **R34 + R35（控制者裁决）：沉淀载荷「打开即消费」，且必须成为结构性保证**——
   * 一份载荷到达后**要么**落进带预填的新建详情表单（跳），**要么**被守卫分支消费并丢弃（清），
   * 不可能停在「既不跳也不清」的悬空态里。
   *
   * 结构在哪里（R35 的落地方式）：本 effect 是**全仓唯一**消费点，且不再用 `consumedRef` 阻断——
   * 只要 `capture` 从 null 变成非 null 就一定会走到 `takeCapture()`（取出即清）。
   * 旧实现的 `consumedRef` 会把**面板打开期间到达的第二份载荷**留在 store 里既不清也不跳，
   * 再把它推迟到下次重开时才消费（那是陈旧预填）——正是 R34 要消灭的悬空态；而其成立前提
   * 「宿主遮罩恰好挡住浮出按钮」是别人的 CSS，不能当保证。
   *
   * 「恰好消费一次」改由 `takeCapture()` 的取出即清保证：消费后 `capture` 变 null，本 effect
   * 因 `capture === null` 提前返回（StrictMode 的双跑同款：第二次 `takeCapture()` 为 null）。
   * 消费在 effect、**不在渲染期**（渲染期取会在重复渲染 / StrictMode 下被吃掉）这一条不变。
   */
  React.useEffect(() => {
    if (capture === null) return;
    const pending = takeCapture();
    if (pending === null) return;
    /**
     * 防御分支：详情页正在编辑（有未保存输入）或面板不在列表页。面板遮罩会吞掉整屏点击，
     * 故这两个状态下入口 B/C 实际不可达；这里只保证两件事——**不覆盖用户没保存的输入**，
     * 也**不留悬空载荷**（已在上面消费掉）：本次预填按放弃处理，并留下可见痕迹（不静默吞掉）。
     */
    if (editingRef.current || panel !== "list") {
      console.warn("[prompt-enhancer] 沉淀载荷到达时详情页正在编辑或面板不在列表页，本次预填已放弃（不覆盖当前输入）");
      return;
    }
    setTarget({ kind: "create", prefill: pending });
  }, [capture, panel]);

  /** 换页签：离开详情页，再让 store 换页签（幂等由 store 负责）。 */
  const openPanel = (next: ManagerPanel): void => {
    setTarget(null);
    openManager(next);
  };

  /**
   * 「新建」按钮：**空表单**路径（R34 要求 2）。
   *
   * 载荷的正常消费点已迁到上面的 effect（打开即消费，R34 要求 1），走到这里时 `takeCapture()`
   * 通常已经拿不到东西（返回 null → 空表单）。保留这次调用只是极端时序的兜底（effect 尚未跑完而
   * 用户已点到「新建」）：谁先取到谁消费，`takeCapture()` 保证只消费一次，不会双重预填。
   */
  const startCreate = (): void => setTarget({ kind: "create", prefill: takeCapture() });

  return (
    <div
      // T7 活体探针的锚点（修复轮 1 评审要求 6）：挂在**管理面板自己的对话框元素**上——
      // 面板关闭即该节点不存在（不是「存在但零尺寸」），而遮罩层根节点不带此锚点，
      // 故「只剩确认弹窗」不会被误判成面板开着。
      data-prompt-enhancer-manager=""
      role="dialog"
      aria-modal="true"
      aria-label={t("manager.title")}
      style={surface(settings.panelWidth, settings.panelHeight)}
    >
      <div style={dialogHeader}>
        <span style={dialogTitle}>{t("manager.title")}</span>
        <div role="tablist" aria-label={t("manager.title")} style={dialogTabs}>
          {PANEL_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={panel === id}
              style={dialogTab(panel === id)}
              onClick={() => openPanel(id)}
            >
              {t(PANEL_LABEL[id])}
            </button>
          ))}
        </div>
        <button type="button" style={button} onClick={closeManager}>
          {t("manager.close")}
        </button>
      </div>
      <div role="tabpanel" aria-label={t(PANEL_LABEL[panel])} style={dialogBody}>
        {panel === "list" && target === null && (
          <PromptList t={t} onCreate={startCreate} onEdit={(prompt) => setTarget({ kind: "edit", prompt })} />
        )}
        {panel === "list" && target !== null && (
          <PromptDetail
            key={target.kind === "edit" ? target.prompt.id : "create"}
            t={t}
            target={target}
            onBack={() => setTarget(null)}
          />
        )}
        {/* T4 填标签页 / 回收站页，T5 填导入导出页——T2 的四页外壳到此全满。 */}
        {panel === "tags" && <TagManagePanel t={t} />}
        {panel === "trash" && <RecycleManagePanel t={t} />}
        {panel === "transfer" && <ImportExportModal t={t} />}
      </div>
    </div>
  );
}

interface PromptListProps {
  t: ManagerTranslate;
  onCreate: () => void;
  onEdit: (prompt: Prompt) => void;
}

/**
 * 列表页（简报步骤 3 / R25）：搜索（防抖）+ 排序 + 标签过滤 + **可滚动容器**（不做分页），
 * 每行标题 / 摘要 / 标签 / 用量 + 行内动作（编辑 → 详情页；删除 → 软删除进回收站）。
 */
function PromptList({ t, onCreate, onEdit }: PromptListProps): React.ReactElement {
  const [query, setQuery] = React.useState("");
  /** 防抖后的查询：真正发给宿主的是它，不是 `query`。 */
  const [applied, setApplied] = React.useState("");
  const [sort, setSort] = React.useState<PromptSort>("default");
  const [tag, setTag] = React.useState("");
  /** null = 本次还没加载完。 */
  const [prompts, setPrompts] = React.useState<Prompt[] | null>(null);
  const [tags, setTags] = React.useState<Array<{ name: string; count: number }> | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [tagsError, setTagsError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  /** 正在删除的那一行（整表禁删，避免并发删同一批）。 */
  const [busyId, setBusyId] = React.useState<string | null>(null);
  /**
   * 删除失败：**按行的行内错误**，与 `loadError`（只表示「列表拉取失败」）严格分开。
   * 删除失败时列表必须仍在屏上——数据还在库里，用 loadError 会把整张列表和空态一起 gate 掉，
   * 让用户误以为东西没了（修复轮 1 的重要级发现）。
   */
  const [deleteError, setDeleteError] = React.useState<{ id: string; detail: string } | null>(null);
  /** 数据变更事件的计数器：`useDataChanged` → 这里自增 → 触发重拉。 */
  const [reloadSeq, setReloadSeq] = React.useState(0);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 搜索防抖：停下 ≥250ms 才把 `query` 落成 `applied`（每次输入重置计时器）。
  React.useEffect(() => {
    const id = window.setTimeout(() => setApplied(query), SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [query]);

  // 同进程数据同步（D6，无 WebSocket）：任何增删改成功后重拉列表与标签。
  useDataChanged(() => setReloadSeq((n) => n + 1));

  React.useEffect(() => {
    let alive = true;
    setPrompts(null);
    setLoadError(null);
    api.listPrompts({ q: applied.trim() || undefined, tag: tag || undefined, sort }).then(
      (list) => {
        if (alive) setPrompts(list);
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] 提示词列表加载失败", err);
        setPrompts([]);
        setLoadError(reasonOf(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [applied, tag, sort, reloadSeq]);

  React.useEffect(() => {
    let alive = true;
    api.listTags().then(
      (list) => {
        if (!alive) return;
        setTags(list);
        setTagsError(null);
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn("[prompt-enhancer] 标签加载失败", err);
        setTags(null);
        setTagsError(reasonOf(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [reloadSeq]);

  /** 软删除（进回收站，可恢复）→ 成功后广播数据变更让所有消费者重拉。 */
  const remove = (prompt: Prompt): void => {
    if (busyId !== null) return;
    setBusyId(prompt.id);
    setNotice(null);
    setDeleteError(null);
    api.deletePrompt(prompt.id).then(
      () => {
        if (!aliveRef.current) return;
        setBusyId(null);
        setNotice(t("manager.list.deleted"));
        notifyDataChanged();
      },
      (err: unknown) => {
        // 失败**只**写行内错误：不碰 loadError（见 deleteError 的注释）。
        console.warn("[prompt-enhancer] 删除提示词失败", err);
        if (!aliveRef.current) return;
        setBusyId(null);
        setDeleteError({ id: prompt.id, detail: reasonOf(err) });
      },
    );
  };

  return (
    <>
      <div style={toolbar}>
        <input
          type="search"
          aria-label={t("manager.list.search")}
          placeholder={t("manager.list.searchPlaceholder")}
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          style={{ ...textInput, flex: "1 1 160px" }}
        />
        <label style={muted}>
          {t("manager.list.sort")}
          <select
            aria-label={t("manager.list.sort")}
            value={sort}
            onChange={(ev) => setSort(ev.target.value as PromptSort)}
            style={{ ...select, marginLeft: 4 }}
          >
            {SORTS.map(({ value, label }) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label style={muted}>
          {t("manager.list.tagFilter")}
          <select
            aria-label={t("manager.list.tagFilter")}
            value={tag}
            onChange={(ev) => setTag(ev.target.value)}
            style={{ ...select, marginLeft: 4 }}
          >
            <option value="">{t("manager.list.allTags")}</option>
            {(tags ?? []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count})
              </option>
            ))}
          </select>
        </label>
        <button type="button" style={primaryButton} onClick={onCreate}>
          {t("manager.list.new")}
        </button>
      </div>
      {tagsError !== null && (
        <span style={errorText}>
          <span>{t("manager.list.tagsFailed")}</span>
          <span style={errorDetail} title={tagsError}>
            {tagsError}
          </span>
        </span>
      )}
      {notice !== null && (
        <span role="status" aria-live="polite" style={muted}>
          {notice}
        </span>
      )}
      {loadError !== null && (
        <span role="alert" style={errorText}>
          <span>{t("error.load")}</span>
          <span style={errorDetail} title={loadError}>
            {loadError}
          </span>
        </span>
      )}
      {loadError === null && prompts === null && <span style={muted}>{t("list.loading")}</span>}
      {loadError === null && prompts !== null && prompts.length === 0 && (
        <span style={muted}>{t("list.empty")}</span>
      )}
      {loadError === null && prompts !== null && prompts.length > 0 && (
        <div role="list">
          {prompts.map((prompt) => (
            <div key={prompt.id} role="listitem" aria-label={prompt.title} style={listRow}>
              <span style={rowText}>
                <span style={rowTitle}>{prompt.title}</span>
                <span style={muted}>{promptSummary(prompt)}</span>
                <span style={rowMeta}>
                  {(prompt.tags ?? []).map((item) => (
                    <span key={item} style={tagChip}>
                      {item}
                    </span>
                  ))}
                  <span style={muted}>
                    {t("manager.list.usage")} {prompt.usageCount}
                  </span>
                </span>
                {deleteError !== null && deleteError.id === prompt.id && (
                  <span role="alert" style={errorText}>
                    <span>{t("error.delete")}</span>
                    <span style={errorDetail} title={deleteError.detail}>
                      {deleteError.detail}
                    </span>
                  </span>
                )}
              </span>
              <span style={actions}>
                <button type="button" style={button} onClick={() => onEdit(prompt)}>
                  {t("manager.list.edit")}
                </button>
                <button
                  type="button"
                  style={{ ...button, opacity: busyId === null ? 1 : 0.6 }}
                  aria-busy={busyId === prompt.id}
                  disabled={busyId !== null}
                  onClick={() => remove(prompt)}
                >
                  {t("manager.list.delete")}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface PromptDetailProps {
  t: ManagerTranslate;
  target: EditTarget;
  onBack: () => void;
}

/**
 * 详情页（简报步骤 4 + 5）：标题 / 正文 / 标签 / 摘要可编辑 → `updatePrompt(id, PromptWritablePatch)`
 * （**不传** `sourceBody` / `aiRefined`，它们不在宿主白名单）；保存成功后 `notifyDataChanged()`。
 *
 * §4.4 的「原文 / 优化稿」并排对比 + 切换承接 §13.8 决定二（P5 期临时落在 AI 结果面板内）：
 * 仅 `canToggle(prompt)` 为真时渲染；切换走 `POST /prompts/:id/rollback`（宿主语义是 **swap**），
 * 用返回的整条 `Prompt` 替换本地态，故可反复点。失败按 R27 走 `error.*` 文案 + `console.warn`。
 */
function PromptDetail({ t, target, onBack }: PromptDetailProps): React.ReactElement {
  const initial = target.kind === "edit" ? target.prompt : null;
  const prefill = target.kind === "create" ? target.prefill : null;
  const [title, setTitle] = React.useState(initial ? initial.title : (prefill?.title ?? ""));
  const [body, setBody] = React.useState(initial ? initial.body : (prefill?.body ?? ""));
  const [tagsText, setTagsText] = React.useState(initial ? (initial.tags ?? []).join(", ") : "");
  const [summary, setSummary] = React.useState(initial ? (initial.summary ?? "") : "");
  /** 本页挂着的库记录：编辑态是宿主返回值，新建态在 create 成功后落库（之前为 null）。 */
  const [current, setCurrent] = React.useState<Prompt | null>(initial);
  /**
   * 当前正文装的是**原文**还是**优化稿**。初值取 false（正文 = 优化稿）：唯一会写 `sourceBody`
   * 的路径是 §4.4 的 AI 写回缝（`sourceBody ← 旧 body`），即刚写回时 body 是新稿、sourceBody 是原文；
   * 之后每次切换（swap）两边互换，故该标志随之取反。
   */
  const [bodyIsOriginal, setBodyIsOriginal] = React.useState(false);
  const [busy, setBusy] = React.useState<"idle" | "saving" | "toggling">("idle");
  const [failure, setFailure] = React.useState<{ key: PromptEnhancerKey; detail: string } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const blankBody = body.trim() === "";

  /**
   * 保存：新建走 `createFromCapture`（R28 的唯一落库入口，内部已广播数据变更，并承载 §4.4 的
   * 淘汰二次确认），编辑走 `updatePrompt`（直连 PUT，故由本组件广播）；两者成功后其它组件都会重拉。
   * 淘汰确认里被取消（`ok: false`）时**静默回到原状态**：不创建、不留半成品、不渲染成错误。
   */
  const save = (): void => {
    if (busy !== "idle" || blankBody) return;
    const editing = current;
    // 白名单字段（PromptWritablePatch）：标题走 clampTitle + 首行兜底，标签按逗号切分。
    const input: PromptWriteInput = {
      title: clampTitle(title.trim() || fallbackTitle(body)),
      body,
      tags: parseTagList(tagsText),
      summary: summary.trim(),
    };
    setBusy("saving");
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        if (editing === null) {
          // 入口 A 的创建路径（R28）：与入口 B/C、AI 面板同一落库入口，§4.4 的淘汰预检在那里。
          const outcome = await createFromCapture(input);
          if (!aliveRef.current) return;
          // 用户在淘汰二次确认里取消：未创建任何记录 → 静默回到原状态（不是错误）。
          if (!outcome.ok) return;
          setCurrent(outcome.prompt);
          setTitle(outcome.prompt.title);
          setNotice(outcome.evicted.length > 0 ? t("manager.list.evicted") : t("manager.edit.saved"));
        } else {
          const updated = await api.updatePrompt(editing.id, input);
          if (!aliveRef.current) return;
          setCurrent(updated);
          setTitle(updated.title);
          setBody(updated.body);
          setTagsText((updated.tags ?? []).join(", "));
          setSummary(updated.summary ?? "");
          setNotice(t("manager.edit.saved"));
          // 编辑路径直连 PUT，广播由本组件负责（创建路径的广播在 createFromCapture 内）。
          notifyDataChanged();
        }
      } catch (err) {
        console.warn("[prompt-enhancer] 提示词保存失败", err);
        if (!aliveRef.current) return;
        setFailure({ key: editing === null ? "error.create" : "error.save", detail: reasonOf(err) });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };

  /** §4.4 切换：宿主执行 swap(body, sourceBody)，返回值整条替换本地态（可反复点）。 */
  const toggle = (): void => {
    if (busy !== "idle" || current === null) return;
    const id = current.id;
    setBusy("toggling");
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        const swapped = await api.rollbackPrompt(id);
        if (!aliveRef.current) return;
        setCurrent(swapped);
        setBody(swapped.body);
        setBodyIsOriginal((prev) => !prev);
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] 原文 / 优化稿切换失败", err);
        if (!aliveRef.current) return;
        // R27：切换失败**不得**复用 ai.* 系（那是 AI 调用文案）。404 = 记录已不存在（复用 P4 键），
        // 其余（宿主此路由只另有 400「没有可回退的原文」）走新键 error.rollbackNoSource。
        const notFound = err instanceof ApiError && err.status === 404;
        setFailure({
          key: notFound ? "error.noPrompt" : "error.rollbackNoSource",
          detail: reasonOf(err),
        });
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    })();
  };

  const originalBody = current === null ? "" : bodyIsOriginal ? current.body : (current.sourceBody ?? "");
  const refinedBody = current === null ? "" : bodyIsOriginal ? (current.sourceBody ?? "") : current.body;
  const busyButton = blankBody || busy !== "idle";

  return (
    <>
      <span style={dialogTitle}>
        {t(target.kind === "create" ? "manager.edit.newTitle" : "manager.edit.editTitle")}
      </span>
      <div style={fieldRow}>
        <span style={fieldLabel}>{t("manager.edit.title")}</span>
        <input
          type="text"
          aria-label={t("manager.edit.title")}
          value={title}
          onChange={(ev) => setTitle(ev.target.value)}
          style={{ ...textInput, flex: "1 1 auto" }}
        />
      </div>
      <div style={fieldRow}>
        <span style={fieldLabel}>{t("manager.edit.body")}</span>
        <textarea
          aria-label={t("manager.edit.body")}
          value={body}
          rows={8}
          onChange={(ev) => setBody(ev.target.value)}
          style={textArea}
        />
      </div>
      <div style={fieldRow}>
        <span style={fieldLabel}>{t("manager.edit.tags")}</span>
        <input
          type="text"
          aria-label={t("manager.edit.tags")}
          placeholder={t("manager.edit.tagsPlaceholder")}
          value={tagsText}
          onChange={(ev) => setTagsText(ev.target.value)}
          style={{ ...textInput, flex: "1 1 auto" }}
        />
      </div>
      <div style={fieldRow}>
        <span style={fieldLabel}>{t("manager.edit.summary")}</span>
        <input
          type="text"
          aria-label={t("manager.edit.summary")}
          value={summary}
          onChange={(ev) => setSummary(ev.target.value)}
          style={{ ...textInput, flex: "1 1 auto" }}
        />
      </div>
      {blankBody && <span style={muted}>{t("manager.edit.bodyRequired")}</span>}
      {notice !== null && (
        <span role="status" aria-live="polite" style={muted}>
          {notice}
        </span>
      )}
      {failure !== null && (
        <span role="alert" style={errorText}>
          <span>{t(failure.key)}</span>
          <span style={errorDetail} title={failure.detail}>
            {failure.detail}
          </span>
        </span>
      )}
      <div style={actions}>
        <button type="button" style={button} onClick={onBack}>
          {t("manager.edit.back")}
        </button>
        <button
          type="button"
          style={{ ...primaryButton, opacity: busyButton ? 0.6 : 1, cursor: busyButton ? "default" : "pointer" }}
          aria-busy={busy === "saving"}
          disabled={busyButton}
          onClick={save}
        >
          {busy === "saving" ? t("manager.edit.saving") : t("manager.edit.save")}
        </button>
      </div>
      {current !== null && canToggle(current) && (
        <>
          <span style={dialogTitle}>
            {t("manager.compare.original")} / {t("manager.compare.refined")}
          </span>
          <div style={compareGrid}>
            <span style={compareBlock}>
              <span style={compareHead}>{t("manager.compare.original")}</span>
              <span style={compareBody}>{originalBody}</span>
            </span>
            <span style={compareBlock}>
              <span style={compareHead}>{t("manager.compare.refined")}</span>
              <span style={compareBody}>{refinedBody}</span>
            </span>
          </div>
          <span style={muted}>
            {t(bodyIsOriginal ? "manager.compare.showingOriginal" : "manager.compare.showingRefined")}
          </span>
          <div style={actions}>
            <button
              type="button"
              style={{ ...primaryButton, opacity: busy === "idle" ? 1 : 0.6 }}
              aria-busy={busy === "toggling"}
              disabled={busy !== "idle"}
              onClick={toggle}
            >
              {busy === "toggling" ? t("manager.compare.toggling") : t("manager.compare.toggle")}
            </button>
          </div>
        </>
      )}
    </>
  );
}
