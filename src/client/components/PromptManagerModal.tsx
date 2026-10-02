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
  clampTitle,
  type Prompt,
  type PromptSort,
  type PromptWritablePatch,
} from "../../types.ts";
import { canToggle } from "../utils/ai-flow.ts";
import { deletePrompts } from "../utils/prompt-meta.ts";
import { ApiError, api } from "../utils/api.ts";
import { useSettings } from "../utils/settings-store.ts";
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
  dialogHeaderBottom,
  dialogHeaderTop,
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
// T7 ⑧-①：决策**只在 `applyToggleDirection` 内求值一次**，组件不再 import `toggleDirectionWrite`
// （那正是「同一纯决策两处求值」的第二个调用点）；`oppositeDirection` 同理——翻转后的方向由返回值
// `applied.next` 给出（本地态与落库值是**同一个值**，不再各算一遍）。
import {
  UNKNOWN_READING,
  applyToggleDirection,
  compareLabelKeys,
  loadStoredDirection,
  readRefinedDirection,
  shouldAcceptLateRead,
} from "../utils/refined-direction.ts";
import type { CapturePayload, ManagerPanel } from "../utils/ui-state.ts";
import { closeManager, openManager, takeCapture, useCapture } from "../utils/ui-state.ts";
import { ImportExportModal } from "./ImportExportModal.tsx";
import { RecycleManagePanel } from "./RecycleManagePanel.tsx";
import { SkillBadge } from "./SkillBadge.tsx";
import { SkillExportModal } from "./SkillExportModal.tsx";
import { TagManagePanel } from "./TagManagePanel.tsx";
// type-only：面板值住在弹窗宿主（PromptSurfaceHost），本文件只消费它（类型擦除 → 无运行期循环）。
import type { ManagerPanelValue } from "./PromptSurfaceHost.tsx";
import { reasonOf } from "../../err-text.ts";

/** 面板文案取值器：即 `PropsLocale<'prompt-enhancer'>` 的 `t`。 */
export type ManagerTranslate = TranslateNS<"prompt-enhancer">;

export interface PromptManagerModalProps {
  /** 宿主的命名空间翻译函数（由 `PromptSurfaceHost` 透传，面板自身不注册字典）。 */
  t: ManagerTranslate;
  /** 当前页签（来自 ui-state 的 store；切换走 `openManager`）。 */
  panel: ManagerPanel;
  /** 管理面板栈的**追加面板值**（规格 §7.6）：`'skill'` = 技能导出页，`null` = 当前页签内容。 */
  panelValue: ManagerPanelValue;
  /** 置位/清位面板值（唯一持有者是 `PromptSurfaceHost`——弹窗宿主的单一真源）。 */
  onPanelValue: (value: ManagerPanelValue) => void;
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
export function PromptManagerModal({ t, panel, panelValue, onPanelValue }: PromptManagerModalProps): React.ReactElement {
  /**
   * 尺寸走设置（规格 §4.2），读法改为**共享响应式 store**（P8 T1）：`panelWidth/panelHeight`
   * 因此即时生效——设置页改完不重开面板，这里就按新尺寸重渲染。无 scope 时 store 给默认值。
   */
  const settings = useSettings();
  const [target, setTarget] = React.useState<EditTarget | null>(null);
  /** 沉淀载荷快照（ui-state 的 store）：非 null 说明入口 B/C 刚推进来一段正文。 */
  const capture = useCapture();

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

  /** 内容区此刻展示的是技能导出页（`'skill'` 面板值）。激活态 / aria 的唯一派生点。 */
  const showingSkill = panelValue === "skill";

  /** 换页签：离开详情页**与技能导出页**，再让 store 换页签（幂等由 store 负责）。 */
  const openPanel = (next: ManagerPanel): void => {
    setTarget(null);
    onPanelValue(null);
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
      {/*
        头部两行化（P8 T9，用户反馈 F2）：第 1 行 = 标题 + 关闭（`marginLeft: "auto"` 推到行尾）；
        第 2 行 = 四页签 + 导出为技能（同款推右）。改前四者同挤一行 nowrap，
        默认面板宽 420 下页签被右侧按钮裁切。三块锚点 / aria / onClick 语义逐字未动。
      */}
      <div style={dialogHeader}>
        <div style={dialogHeaderTop}>
          <span style={dialogTitle}>{t("manager.title")}</span>
          <button type="button" style={{ ...button, marginLeft: "auto" }} onClick={closeManager}>
            {t("manager.close")}
          </button>
        </div>
        <div style={dialogHeaderBottom}>
          {/*
            R-P7-X 要求 4（无障碍错位）：技能导出页在场时，内容区展示的**不是**任何页签的内容，
            故四个页签一律 `aria-selected={false}`、也不再高亮——视觉与读屏必须说同一件事。
            （激活态与 aria 取自**同一个**派生值 `showingSkill`，避免两处各自判断后漂移。）
          */}
          <div role="tablist" aria-label={t("manager.title")} style={dialogTabs}>
            {PANEL_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={!showingSkill && panel === id}
                style={dialogTab(!showingSkill && panel === id)}
                onClick={() => openPanel(id)}
              >
                {t(PANEL_LABEL[id])}
              </button>
            ))}
          </div>
          {/* 工具栏的「导出为技能」（规格 §7.6）：打开管理面板栈的 `'skill'` 页。
              T5 活体探针锚点（声明式渲染，非 DOM 注入）。 */}
          <button
            type="button"
            data-prompt-enhancer-skill-open=""
            style={{ ...button, marginLeft: "auto" }}
            onClick={() => {
              /**
               * 要求 5（返回落点与文案一致）：进技能页与**换页签**同款——先离开详情页（`setTarget(null)`），
               * 于是「返回管理面板」的落点**确定**：一律回到当前页签的内容区（列表 / 标签 / 回收站 / 导入导出），
               * 不会是「刚才那张没保存的详情页」。丢弃未保存详情的代价与既有「点页签换页」逐字相同
               * （P6 起的既有交互模型，不是本轮新引入的差异）。
               */
              setTarget(null);
              onPanelValue("skill");
            }}
          >
            {t("manager.skill.open")}
          </button>
        </div>
      </div>
      <div
        role="tabpanel"
        // 要求 4：标签与**实际内容**一致——技能页在场时报技能页的名字，不报当前页签名。
        aria-label={showingSkill ? t("manager.skill.title") : t(PANEL_LABEL[panel])}
        style={dialogBody}
      >
        {showingSkill ? (
          /* 技能导出页（规格 §7.6）：管理面板栈里的一页，与详情页同级（都在本卡片的内容区）。 */
          <SkillExportModal t={t} onBack={() => onPanelValue(null)} />
        ) : (
          <>
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
          </>
        )}
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

  /**
   * 软删除（进回收站，可恢复）→ 成功后广播数据变更让所有消费者重拉。
   *
   * 走 `deletePrompts({ irreversible: false })` 而不是直接 `api.deletePrompt`（T6 / O-1）：
   * 那条路径**一次 meta 清键都不发**——回收站可恢复且复用同一 id，清了键，「删除 → 恢复」会让
   * 方向记录与技能 descriptor 一起消失（重演 I-1）。决策只在 `prompt-meta.ts#deletePrompts` 一处，
   * 本面板不自己复制那条例外。
   */
  const remove = (prompt: Prompt): void => {
    if (busyId !== null) return;
    setBusyId(prompt.id);
    setNotice(null);
    setDeleteError(null);
    deletePrompts({ ids: [prompt.id], irreversible: false, remove: () => api.deletePrompt(prompt.id) }).then(
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
                  {/* 规格 §7.6：列表行也标注技能状态（未导出时不渲染；过期时带「重新导出」）。 */}
                  <SkillBadge t={t} prompt={prompt} />
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
 * §4.4 的「两份正文」并排对比 + 互换承接 §13.8 决定二（P5 期临时落在 AI 结果面板内）：
 * 仅 `canToggle(prompt)` 为真时渲染；切换走 `POST /prompts/:id/rollback`（宿主语义是 **swap**），
 * 用返回的整条 `Prompt` 替换本地态，故可反复点。失败按 R27 走 `error.*` 文案 + `console.warn`。
 *
 * ⚠️ **方向（R59 / F-5 的 I-1，T4 根治；R-P7-AC 修复轮 1 收口）**：`rollback` 是 swap，宿主
 * **不记录方向**——它只对调两份正文（`aiRefined` 原样保留），所以「此刻的 `body` 是哪一侧」必须由
 * 客户端**自己记**。方向**只**来自记录（`pl:refined-dir:<id>`，见 `utils/refined-direction.ts`）：
 *   · 有记录（来源 `record`）⇒ **如实标注**（原文 / 优化稿），切换后落**翻转**后的方向；
 *   · 没有记录 / 读取中（来源 `fallback`）⇒ 退回 P6 的**中性**表述，且**切换后不落库**——猜测不得被
 *     固化（R-P7-AC：`aiRefined` 推断在「切换过奇数次」的旧记录上恰好反相，还会被下一次切换固化成
 *     反相，用户任何操作都修不好）。记录的**播种**在方向真正可知之处：AI 写回缝
 *     （`ai-flow.ts#writeBackRefined` → `seedRefinedDirection`）。
 * 判定、来源、翻转与「方向 → 标注」的映射都在纯逻辑模块里（可单测），本组件只做接线；不引入新存储键、
 * 不改宿主路由，切换按钮与 `canToggle` 守卫保留（能力不减）。
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

  /**
   * 该提示词的**已存方向**（meta 原文文本）——**三态**：
   *   · `null` = **读取中**（meta 还没回来；新建态没有 id，同样按「没有记录」起手）；
   *   · `undefined` = 没有记录 / 读取失败；
   *   · 字符串 = 记录原文。
   * 方向是**持久化**的而不是本组件的局部状态：每次进详情页（含「切一次 → 关面板 → 重开编辑」）都重读。
   * 「读取中」单独成一态是必需的：否则首帧会把「还没读到」当成别的处境，闪一帧方向标注。
   */
  const [storedDirection, setStoredDirection] = React.useState<string | null | undefined>(
    initial === null ? undefined : null,
  );

  /**
   * 本页**已成功切换的次数**（每次挂载从 0 起）。只有一个用途：**迟到的 meta 读结果**若发现自己出生在
   * 一次切换之前，就必须丢弃——那条记录描述的是切换**之前**的内容（R-P7-AE 的第二条修法）。
   */
  const toggleSeqRef = React.useRef(0);

  React.useEffect(() => {
    const id = initial === null ? null : initial.id; // 新建态：还没有 id，也就没有方向记录可读
    if (id === null) return;
    let alive = true;
    const seqAtStart = toggleSeqRef.current;
    void loadStoredDirection(id, api.getMeta).then((raw) => {
      if (!alive) return;
      // 迟到的读：读取开始之后发生过切换 ⇒ 丢弃（`shouldAcceptLateRead` 是纯决策，有用例）。
      if (!shouldAcceptLateRead(toggleSeqRef.current !== seqAtStart)) return;
      setStoredDirection(raw);
    });
    return () => {
      alive = false;
    };
  }, [initial === null ? null : initial.id]);

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

  /**
   * §4.4 切换：宿主执行 swap(body, sourceBody)，返回值整条替换本地态（可反复点）。
   * T4（I-1 根治）：宿主只换正文、不留方向 ⇒ **有记录**时切换要把**翻转后的方向**落 meta；
   * **来源未知**（没有记录 / 脏值 / 读取中 / 读失败）时则**作废**那条记录（R-P7-AE：切换改变了真值，
   * 旧记录不会跟着翻转 ⇒ 留着它就是一条会反相、且用户无法纠正的错记录）。决策是纯函数，组件只接线——
   * 而且只有**一处**接线（T7 ⑧-①：决策在 `applyToggleDirection` 内部求值，组件读它的返回值）。
   */
  const toggle = (): void => {
    if (busy !== "idle" || current === null) return;
    const id = current.id;
    setBusy("toggling");
    setFailure(null);
    setNotice(null);
    void (async () => {
      try {
        const swapped = await api.rollbackPrompt(id);
        // R-P7-AE：切换改变了真值 ⇒ 库里那条记录必须跟着失效（决策是纯函数 toggleDirectionWrite）：
        //   · record ⇒ 写**翻转后的**方向；
        //   · 未知（没有记录 / 脏值 / **读取中** / 读失败）⇒ **作废**（写空串）——宁可退回中性，也不留
        //     一条会反相的陈旧记录；本地态同时回到「没有记录」；
        //   · 只有一侧 ⇒ 什么都不写。
        // 它**不依赖组件是否还在世**（宿主已经 swap 完，记不下来下次打开就会按陈旧记录张冠李戴）；
        // 失败只 warn（内部），不改变下面的结局，也不阻塞广播。
        // T7 ⑧-①：决策只在 `applyToggleDirection` **内部求值一次**，组件读它返回的 `write` / `next`。
        // 返回值是**同步**的（决策同步可得、落库在 `done` 里跑），故下面几行仍与旧形态**同拍**：
        // 同一个提交里换 body + 换本地方向，不会出现「body 已换、标注还是旧的」那一帧错标注。
        const applied = applyToggleDirection(id, current, reading);
        // ↓ 这一行是「**路径 (i) 屏上不闪错**」的唯一保证（T7 ⑧-③ 更正 task-4-report.md:136 的归属）：
        //   迟到的读结果之所以被 `shouldAcceptLateRead` 丢弃，全靠它把 `toggleSeqRef` 推过读取时取的
        //   那份快照（读那侧只负责比对；没有这次自增，比对永远看到「没切换过」⇒ 迟到结果照样上屏）。
        toggleSeqRef.current += 1;
        void applied.done; // 落库**不等**（`done` 绝不 reject；它挂住也不该把面板卡在 toggling）
        if (!aliveRef.current) return;
        setCurrent(swapped);
        setBody(swapped.body);
        // 本地态与落库值同源（**同一个决策、同一个值**）：屏上的标注与下一次读回来的记录必然一致。
        if (applied.write === "persist") setStoredDirection(applied.next);
        else if (applied.write === "clear") setStoredDirection(undefined);
        notifyDataChanged();
      } catch (err) {
        console.warn("[prompt-enhancer] 两份正文互换失败", err);
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

  /**
   * 判定（方向 + **来源**）与两栏标注键：判定只发生在 `refined-direction.ts` 的纯函数里（可单测），
   * 组件只把结果渲染成 `t(...)`。左栏恒是**本页可直接编辑的那一份**（`body`），右栏是 `sourceBody`
   * （`canToggle` 保证它非空）——方向只决定**标注**，不改变两栏的取值。
   *
   * `useMemo` 不是优化而是必需：`readRefinedDirection` 对**脏值**会 `console.warn`，放在 render 体里
   * 会被本页每一次按键（标题 / 正文 / 标签 / 摘要都改 state）重复触发。依赖是**值**：值没变就只算一次。
   */
  const reading = React.useMemo(
    () =>
      current === null || storedDirection === null
        ? UNKNOWN_READING
        : readRefinedDirection(current, storedDirection),
    [current, storedDirection],
  );
  const direction = reading.direction;
  const labels = compareLabelKeys(direction);
  const currentBodyShown = current === null ? "" : current.body;
  const counterpartBody = current === null ? "" : (current.sourceBody ?? "");
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
      {/* 规格 §7.6：详情页与列表行共用同一个徽标组件；重导后宿主回执整条替换本页记录 ⇒ 徽标
          就地消失（详情页不订阅数据变更事件，只靠广播的话它自己不会刷新）。 */}
      {current !== null && (
        <SkillBadge
          t={t}
          prompt={current}
          onReExported={(receipt) => {
            if (!receipt.prompt) {
              // 契约漂移必须可见（宿主技能导出分支一直回 prompt）；缺省时只靠广播，本页不假刷新。
              console.warn("[prompt-enhancer] 重导回执缺少 prompt（契约漂移），详情页无法就地刷新技能状态", receipt);
              return;
            }
            setCurrent(receipt.prompt);
          }}
        />
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
          <span style={dialogTitle}>{t("manager.compare.title")}</span>
          <div style={compareGrid}>
            <span style={compareBlock}>
              <span style={compareHead}>{t(labels.current)}</span>
              <span style={compareBody}>{currentBodyShown}</span>
            </span>
            <span style={compareBlock}>
              <span style={compareHead}>{t(labels.counterpart)}</span>
              <span style={compareBody}>{counterpartBody}</span>
            </span>
          </div>
          {/* 兜底 / 读取中（方向不可知）⇒ P6 的中性表述；有记录 ⇒ 说明它已被记录。 */}
          <span style={muted}>
            {t(labels.neutral ? "manager.compare.unknownDirection" : "manager.compare.directionPersisted")}
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
