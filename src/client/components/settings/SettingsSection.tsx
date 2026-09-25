/**
 * 设置页 section（P8 T4 / 验收 12、19 的一半）：把 13 个设置字段做成宿主设置页的**一页**。
 *
 * 座位契约（本宿主 0.1.5-rc.2 实测）：`settings.section` 是 `kind: list` / `scope: root`，
 * 属主 props **只有** `{ close }`（`packages/client/ui-settings/src/client/contract/slots.ts:123-126`
 * 的 `SettingsSectionOwnerProps`，渲染点 `ui-settings-general/.../SettingsRoot.tsx:95` 的
 * `renderSlot('settings.section', { close: onClose }, { only: active })`）⇒ 本页的数据一律经**自己的**
 * import 面与 store 到达，属主不供任何数据；`close` 在本页没有用途（不离开设置），故不接收。
 *
 * 纪律：
 *  · 读**只**经 `useSettings()`（订阅式单一真源，D-P8-2），本文件不存第二份设置缓存；
 *  · 写一律 `updateSettings({ [字段]: 值 })`——**单字段一次写**，不做批量 mutate（D-P8-7）；
 *    唯一的数组形式服务 provider→model 联动（切 provider 时旧 model 可能已不属于它），仍逐字段写；
 *  · 每行控件在写入期 `disabled` + `aria-busy`；失败**可见**（行内 `role="alert"` + `console.warn`）；
 *  · 行序与覆盖关系由 `SETTINGS_KEYS` 逐键派发（switch 穷尽到 `never`：漏一个键即编译期报错）
 *    ⇒ 13 键 = 11 行（AI 模型行覆盖 provider+model，面板尺寸行覆盖宽+高）；
 *  · 零 DOM 写入、零 keydown|keyup|keypress 监听（硬约束 3）：数值框用 `onChange`（记草稿）+
 *    `onBlur`（提交），不抢键事件。
 */
import * as React from "react";
import type { PropsLocale, PropsRuntime, TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
// type-only：拉入 ui-settings 的 SlotMap 合并（'settings.section' 座位与 SettingsSectionOwnerProps）
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import { SETTINGS_KEYS } from "../../../settings-shape.ts";
import type { PluginSettings } from "../../../types.ts";
import { type AiSelectable, api } from "../../utils/api.ts";
import { errorDetail, errorText, muted, select, textInput } from "../../utils/dialog-style.ts";
import { updateSettings, useSettings } from "../../utils/settings-store.ts";
import { TOKEN } from "../../utils/theme.ts";

/** 一行的数值边界（与宿主 schema 逐格同值：`src/host/settings.ts:37-38,47` 的 step/min/max）。 */
interface NumberBounds { min: number; max: number }
/** 面板宽 / 高：宿主 schema `z.number().step(1).min(200).max(2000)`。 */
const PANEL_SIZE_BOUNDS: NumberBounds = { min: 200, max: 2000 };
/** 存储上限：宿主 schema `z.number().step(1).min(1).max(10000)`（超限淘汰在宿主侧）。 */
const MAX_PROMPT_COUNT_BOUNDS: NumberBounds = { min: 1, max: 10000 };

/** 一次写入失败的可读面：固定文案（走 `t`）+ 宿主原文（同一份进控制台）。 */
interface WriteFailure { message: string; detail: string }
interface WriteTools {
  pending: boolean;
  failure: WriteFailure | null;
  write: (patch: Partial<PluginSettings>, field: string) => void;
  writeSequence: (patches: Partial<PluginSettings>[], field: string) => void;
}

/**
 * 写入的 UI 三态（写入期禁用 + 失败行内可见）。
 *
 * `patches` 里**每个对象只含一个键**（D-P8-7）：数组形式只服务 provider→model 这种必须成对更新的
 * 联动，仍是逐字段 `scope.set` / `PUT`，不是一次多字段 patch。`updateSettings` 失败**抛出**
 * （P8 T1 的契约），故这里必有一处 `then` 的拒绝分支：行内出 `role="alert"`、控制台留原文，
 * 绝不静默吞掉（全局规则「错误可见」）。
 */
function useWrite(t: TranslateNS<"prompt-enhancer">): WriteTools {
  const [pending, setPending] = React.useState(false);
  const [failure, setFailure] = React.useState<WriteFailure | null>(null);
  const run = (patches: Partial<PluginSettings>[], field: string): void => {
    if (patches.length === 0) return;
    setPending(true);
    setFailure(null);
    (async () => {
      for (const patch of patches) await updateSettings(patch);
    })().then(
      () => { setPending(false); },
      (err: unknown) => {
        setPending(false);
        setFailure({
          message: t("settings.saveFailed"),
          detail: err instanceof Error ? err.message : String(err),
        });
        console.warn("[prompt-enhancer] 保存设置失败（" + field + "）", err);
      },
    );
  };
  return {
    pending,
    failure,
    write: (patch, field) => { run([patch], field); },
    writeSequence: (patches, field) => { run(patches, field); },
  };
}

const SECTION: React.CSSProperties = { display: "flex", flexDirection: "column", padding: "0 0 8px", fontSize: 12 };
const SECTION_TITLE: React.CSSProperties = { color: TOKEN.fg, fontSize: 12, fontWeight: 600, margin: "0 0 4px" };
/** 一行：行首标签 + 控件区；换行容器让行内错误能独占一整行。 */
const ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  padding: "7px 0",
  borderTop: `1px solid ${TOKEN.border}`,
};
/** 行首标签：固定栏宽，11 行的控件左缘对齐。 */
const ROW_LABEL: React.CSSProperties = { color: TOKEN.fg, fontSize: 12, flex: "0 0 168px" };
const ROW_CONTROL: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  flex: "1 1 220px",
  minWidth: 0,
};
/** 错误块独占一行（`1 1 100%` 在 wrap 容器里换行），不挤控件。 */
const ERROR_SLOT: React.CSSProperties = { flex: "1 1 100%" };
const NUMBER: React.CSSProperties = { ...textInput, width: 72 };
const SEPARATOR: React.CSSProperties = { color: TOKEN.muted };

/** 一行的骨架。错误由控件自己排在控件区内（每行的错误位置不同，故不做统一槽位）。 */
function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={ROW}>
      <span style={ROW_LABEL}>{label}</span>
      <span style={ROW_CONTROL}>{children}</span>
    </div>
  );
}

/** 行内失败提示：`role="alert"` 的固定文案 + 宿主原文（照 P7 的可见错误口径）。无失败则一个盒子都不出。 */
function WriteError({ failure }: { failure: WriteFailure | null }): React.ReactElement | null {
  if (failure === null) return null;
  return (
    <span style={ERROR_SLOT}>
      <span role="alert" style={errorText}>
        <span>{failure.message}</span>
        <span style={errorDetail} title={failure.detail}>{failure.detail}</span>
      </span>
    </span>
  );
}

interface BoolRowProps {
  t: TranslateNS<"prompt-enhancer">;
  /** 字段名：只用于失败时的控制台留痕（界面文案走 label）。 */
  field: string;
  label: string;
  checked: boolean;
  /** 单字段补丁工厂：返回的对象恒只含这一个键（D-P8-7）。 */
  patch: (next: boolean) => Partial<PluginSettings>;
}

/** 复选行：值经 `useSettings()` 读，勾选 ⇒ 一次单字段写，写期禁用 + `aria-busy`。 */
function BoolRow({ t, field, label, checked, patch }: BoolRowProps): React.ReactElement {
  const { pending, failure, write } = useWrite(t);
  return (
    <Row label={label}>
      <input
        type="checkbox"
        aria-label={label}
        aria-busy={pending}
        checked={checked}
        disabled={pending}
        onChange={(ev) => { write(patch(ev.target.checked), field); }}
      />
      <WriteError failure={failure} />
    </Row>
  );
}

interface NumberInputProps {
  t: TranslateNS<"prompt-enhancer">;
  field: string;
  label: string;
  value: number;
  bounds: NumberBounds;
  patch: (next: number) => Partial<PluginSettings>;
}

/**
 * 数值控件（面板宽 / 高 / 存储上限）。
 *
 * 提交时机是 `onBlur`（不是每键一次）：受控输入若在 `onChange` 就写，边界内的多位数字根本
 * 敲不进去——第一个字符（如 "8"）越界会被 store 的旧值弹回去；而 `onKeyDown` 是硬约束 3 禁掉的。
 * 故 `onChange` 只记**编辑缓冲**（不是第二份设置缓存：提交后立刻交回 store，设置值仍只经
 * `useSettings()` 读），`onBlur` 校验后提交。
 *
 * 越界 / 非整数一律**不写**（宿主 schema 会拒，且「改了却没生效」比报错更糟）：草稿留在框里，
 * 行内出可读原因，用户改回范围内再提交。
 */
function NumberInput({ t, field, label, value, bounds, patch }: NumberInputProps): React.ReactElement {
  const { pending, failure, write } = useWrite(t);
  const [draft, setDraft] = React.useState<string | null>(null);
  const [invalid, setInvalid] = React.useState(false);

  const commit = (): void => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(null);
    if (parsed === value) return;
    write(patch(parsed), field);
  };

  return (
    <>
      <input
        type="number"
        style={NUMBER}
        aria-label={label}
        aria-busy={pending}
        min={bounds.min}
        max={bounds.max}
        step={1}
        value={draft ?? String(value)}
        disabled={pending}
        onChange={(ev) => { setDraft(ev.target.value); }}
        onBlur={commit}
      />
      {invalid && (
        <span style={ERROR_SLOT}>
          <span role="alert" style={errorText}>
            <span>{t("settings.numberInvalid") + bounds.min + "–" + bounds.max}</span>
          </span>
        </span>
      )}
      <WriteError failure={failure} />
    </>
  );
}

/** 下拉的一个选项。 */
interface AiOption { value: string; label: string }

/**
 * provider 下拉的选项：**首个恒为「自动发现」（空串）**，其后是宿主给出的可选 provider。
 *
 * 清单非空、而当前存的 provider 不在里面（模型被撤下 / 换了机器）时补一条，让下拉如实显示现状
 * （否则受控 select 会显示成一个与本插件保存值不符的选项）；清单为空（探测失败 / 宿主无模型）
 * 时不补——那种情形按验收要求**只剩「自动发现」**，现状由旁边那行可读文字说明。
 */
function providerOptions(list: readonly AiSelectable[], current: string, auto: string): AiOption[] {
  const options: AiOption[] = [{ value: "", label: auto }];
  for (const item of list) options.push({ value: item.provider, label: item.name });
  if (list.length > 0 && current !== "" && !list.some((item) => item.provider === current)) {
    options.push({ value: current, label: current });
  }
  return options;
}

/** 模型下拉的选项：只列**当前 provider** 的模型，首个同样是「自动发现」（= 让宿主为该 provider 自选）。 */
function modelOptions(list: readonly AiSelectable[], provider: string, current: string, auto: string): AiOption[] {
  const models = list.find((item) => item.provider === provider)?.models ?? [];
  const options: AiOption[] = [{ value: "", label: auto }];
  for (const item of models) options.push({ value: item.id, label: item.name });
  if (models.length > 0 && current !== "" && !models.some((item) => item.id === current)) {
    options.push({ value: current, label: current });
  }
  return options;
}

interface AiModelRowProps {
  t: TranslateNS<"prompt-enhancer">;
  provider: string;
  model: string;
}

/**
 * AI 模型行（TBD-P8-5 选 (a)）：真调 `listAiProviders()` 渲染 provider / 模型**联动**下拉。
 *
 * 探测是有界的（`listAiProviders` 自带 `AI_PROBE_TIMEOUT_MS = 15s` 超时），失败只影响这一行：
 * 行内出可读原因、下拉只剩「自动发现」，其余 10 行照常。provider 为空（自动发现）时模型下拉禁用——
 * 宿主只认 provider+model **同时**有效的手动路由（`src/host/ai.ts:158-166`），空的 provider 下
 * 选模型没有任何作用。
 */
function AiModelRow({ t, provider, model }: AiModelRowProps): React.ReactElement {
  const { pending, failure, write, writeSequence } = useWrite(t);
  /** null = 探测在途；[] = 探测落定但宿主没有可用 provider。 */
  const [list, setList] = React.useState<AiSelectable[] | null>(null);
  const [probeError, setProbeError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    api.listAiProviders().then(
      (value) => { if (alive) setList(value); },
      (err: unknown) => {
        // 卸载后不回写：探测可能要挂满 15s，期间本页可能已被切走（AnimatePresence 之外的现实）。
        if (!alive) return;
        setList([]);
        setProbeError(err instanceof Error ? err.message : String(err));
        console.warn("[prompt-enhancer] AI 可选模型探测失败，设置页的 AI 模型行只保留「自动发现」", err);
      },
    );
    return () => { alive = false; };
  }, []);

  const known = list ?? [];
  const options = providerOptions(known, provider, t("settings.ai.auto"));
  const models = modelOptions(known, provider, model, t("settings.ai.auto"));
  /** 现状在列表里无对应选项（探测失败 / 无模型）且存的值不是「自动」⇒ 至少用文字如实说明。 */
  const storedVisible = list !== null && known.length === 0 && (provider !== "" || model !== "");

  /**
   * 切 provider：旧 model 若不属于新 provider 必须一起清成「自动发现」——否则存下一对
   * 「provider A + provider B 的模型」，下拉会显示一个它自己列不出的值。两次**单字段**写。
   *
   * **写序：先清 model，再换 provider**（T4 评审 R1）。两条写各自可能成功或失败（`useWrite`
   * 逐条 await，第 1 条被拒时第 2 条**不会执行**），故必须问「部分失败留下什么对」：
   *  · 先 model 后 provider：第 1 条成、第 2 条败 ⇒「旧 provider + 自动」；第 1 条败 ⇒ 一条也没落
   *    ⇒「旧 provider + 旧 model」。**两种残局都是合法对**——「自动」= 空串在任何 provider 下都有效
   *    （宿主照常走自动选路）；
   *  · 反过来（先 provider 后 model）则第 1 条成、第 2 条败会落成「**新 provider + 旧 model**」，
   *    正是上面要避免的跨 provider 对：宿主只在 provider+model **同时**有效时才认手动路由
   *    （`src/host/ai.ts:158-166`），这一对会被判为无效。
   * 全成功的两条路径两序语义相同；`nextModel === model` 时本就只有一条 patch，与写序无关。
   */
  const changeProvider = (next: string): void => {
    const owned = known.find((item) => item.provider === next)?.models.some((m) => m.id === model) === true;
    const nextModel = owned ? model : "";
    const patches: Partial<PluginSettings>[] =
      nextModel === model ? [{ aiProvider: next }] : [{ aiModel: nextModel }, { aiProvider: next }];
    writeSequence(patches, "aiProvider");
  };

  return (
    <Row label={t("settings.ai.title")}>
      <select
        aria-label={t("settings.ai.provider")}
        aria-busy={pending}
        style={select}
        value={provider}
        disabled={pending}
        onChange={(ev) => { changeProvider(ev.target.value); }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        aria-label={t("settings.ai.model")}
        aria-busy={pending}
        style={select}
        value={model}
        disabled={pending || provider === ""}
        onChange={(ev) => { write({ aiModel: ev.target.value }, "aiModel"); }}
      >
        {models.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {list === null && <span style={muted}>{t("settings.ai.loading")}</span>}
      {probeError !== null && (
        <span role="alert" style={errorText}>
          <span>{t("settings.ai.probeFailed")}</span>
          <span style={errorDetail} title={probeError}>{probeError}</span>
        </span>
      )}
      {probeError === null && list !== null && list.length === 0 && (
        <span style={muted}>{t("settings.ai.noModels")}</span>
      )}
      {storedVisible && (
        <span style={muted}>
          {t("settings.ai.stored") + provider + " / " + (model === "" ? t("settings.ai.auto") : model)}
        </span>
      )}
      <WriteError failure={failure} />
    </Row>
  );
}

/** 本页的组件 props = 座位属主面（`{ close }`）+ 本插件的 locale 面（`t`）。 */
export type SettingsSectionProps =
  PropsRuntime<"settings.section"> & PropsLocale<"prompt-enhancer">;

/**
 * 逐键派发行：**行序 = `SETTINGS_KEYS`**——13 个键按规范序各走一次，多键行只在其**首键**上渲染，
 * 次键返回 null（AI 模型行覆盖 aiProvider+aiModel，面板尺寸行覆盖 panelWidth+panelHeight）。
 *
 * switch 穷尽到 `never`：`SETTINGS_KEYS` 增删一个键这里就编译不过 ⇒「13 键全覆盖、无遗漏、
 * 无多余第 14 行」是编译期判据，不靠人眼比对。每个 case 的 `patch` 都逐字写出**唯一那个键**
 * （单字段一次写的可读证据）。
 */
function renderRow(
  key: (typeof SETTINGS_KEYS)[number],
  settings: PluginSettings,
  t: TranslateNS<"prompt-enhancer">,
): React.ReactElement | null {
  switch (key) {
    case "aiProvider":
      return <AiModelRow key={key} t={t} provider={settings.aiProvider} model={settings.aiModel} />;
    case "aiModel":
      return null;
    case "panelWidth":
      return (
        <Row key={key} label={t("settings.panelSize")}>
          <NumberInput
            t={t}
            field="panelWidth"
            label={t("settings.panelWidth")}
            value={settings.panelWidth}
            bounds={PANEL_SIZE_BOUNDS}
            patch={(next) => ({ panelWidth: next })}
          />
          <span aria-hidden="true" style={SEPARATOR}>×</span>
          <NumberInput
            t={t}
            field="panelHeight"
            label={t("settings.panelHeight")}
            value={settings.panelHeight}
            bounds={PANEL_SIZE_BOUNDS}
            patch={(next) => ({ panelHeight: next })}
          />
        </Row>
      );
    case "panelHeight":
      return null;
    case "showComposerButton":
      return (
        <BoolRow
          key={key}
          t={t}
          field={key}
          label={t("settings.showComposerButton")}
          checked={settings.showComposerButton}
          patch={(next) => ({ showComposerButton: next })}
        />
      );
    case "composerButtonIconOnly":
      return (
        <BoolRow
          key={key}
          t={t}
          field={key}
          label={t("settings.composerButtonIconOnly")}
          checked={settings.composerButtonIconOnly}
          patch={(next) => ({ composerButtonIconOnly: next })}
        />
      );
    case "showAIPolishButton":
      return (
        <BoolRow
          key={key}
          t={t}
          field={key}
          label={t("settings.showAIPolishButton")}
          checked={settings.showAIPolishButton}
          patch={(next) => ({ showAIPolishButton: next })}
        />
      );
    case "aiPolishButtonIconOnly":
      return (
        <BoolRow
          key={key}
          t={t}
          field={key}
          label={t("settings.aiPolishButtonIconOnly")}
          checked={settings.aiPolishButtonIconOnly}
          patch={(next) => ({ aiPolishButtonIconOnly: next })}
        />
      );
    case "hashTriggerEnabled":
      return (
        <BoolRow
          key={key}
          t={t}
          field={key}
          label={t("settings.hashTriggerEnabled")}
          checked={settings.hashTriggerEnabled}
          patch={(next) => ({ hashTriggerEnabled: next })}
        />
      );
    case "contextRecommendEnabled":
      return (
        <BoolRow
          key={key}
          t={t}
          field={key}
          label={t("settings.contextRecommendEnabled")}
          checked={settings.contextRecommendEnabled}
          patch={(next) => ({ contextRecommendEnabled: next })}
        />
      );
    case "selectionAddEnabled":
      return (
        <BoolRow
          key={key}
          t={t}
          field={key}
          label={t("settings.selectionAddEnabled")}
          checked={settings.selectionAddEnabled}
          patch={(next) => ({ selectionAddEnabled: next })}
        />
      );
    case "showSidebarButton":
      return (
        <BoolRow
          key={key}
          t={t}
          field={key}
          label={t("settings.showSidebarButton")}
          checked={settings.showSidebarButton}
          patch={(next) => ({ showSidebarButton: next })}
        />
      );
    case "maxPromptCount":
      return (
        <Row key={key} label={t("settings.maxPromptCount")}>
          <NumberInput
            t={t}
            field={key}
            label={t("settings.maxPromptCount")}
            value={settings.maxPromptCount}
            bounds={MAX_PROMPT_COUNT_BOUNDS}
            patch={(next) => ({ maxPromptCount: next })}
          />
        </Row>
      );
    default: {
      // 穷尽性锚：13 键全覆盖时这里 key 的类型收窄为 never；SETTINGS_KEYS 多一个键即编译报错。
      const uncovered: never = key;
      return uncovered;
    }
  }
}

/** 设置页内容：13 个字段的当前值**只**从这里来（订阅式单一真源，D-P8-2）。 */
export function SettingsSection({ t }: SettingsSectionProps): React.ReactElement {
  const settings = useSettings();
  return (
    <div style={SECTION}>
      <div style={SECTION_TITLE}>{t("settings.title")}</div>
      {SETTINGS_KEYS.map((key) => renderRow(key, settings, t))}
    </div>
  );
}
