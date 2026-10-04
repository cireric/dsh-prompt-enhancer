/**
 * 设置页的**纯判定**（审查 #7）：三个函数原先活在 SettingsSection.tsx 里，因为住在组件文件里而
 * 没有任何自动化判据（硬约束 15：本仓无 react-dom/jsdom，node --test 读不了 .tsx）。
 * 它们都是纯粹的「输入 → 输出」，与 React 无关，故下沉到这里单测；组件只做接线。
 */
import type { AiSelectable } from "./api.ts";

/** 下拉的一个选项。 */
export interface AiOption {
  value: string;
  label: string;
}

/**
 * provider 下拉的选项：**首个恒为「自动发现」（空串）**，其后是宿主给出的可选 provider。
 *
 * 清单非空、而当前存的 provider 不在里面（模型被撤下 / 换了机器）时补一条，让下拉如实显示现状
 * （否则受控 select 会显示成一个与本插件保存值不符的选项）；清单为空（探测失败 / 宿主无模型）
 * 时不补——那种情形按验收要求**只剩「自动发现」**，现状由旁边那行可读文字说明。
 */
export function providerOptions(list: readonly AiSelectable[], current: string, auto: string): AiOption[] {
  const options: AiOption[] = [{ value: "", label: auto }];
  for (const item of list) options.push({ value: item.provider, label: item.name });
  if (list.length > 0 && current !== "" && !list.some((item) => item.provider === current)) {
    options.push({ value: current, label: current });
  }
  return options;
}

/** 模型下拉的选项：只列**当前 provider** 的模型，首个同样是「自动发现」（= 让宿主为该 provider 自选）。 */
export function modelOptions(
  list: readonly AiSelectable[],
  provider: string,
  current: string,
  auto: string,
): AiOption[] {
  const models = list.find((item) => item.provider === provider)?.models ?? [];
  const options: AiOption[] = [{ value: "", label: auto }];
  for (const item of models) options.push({ value: item.id, label: item.name });
  if (models.length > 0 && current !== "" && !models.some((item) => item.id === current)) {
    options.push({ value: current, label: current });
  }
  return options;
}

/**
 * 数值输入框的草稿判定：**合法才返回数字**（越界 / 非整数 / 空一律 undefined）。
 *
 * 越界不写的理由（与组件注释同）：宿主 schema 会拒，而「改了却没生效」比报错更糟——草稿留在框里、
 * 行内出可读原因，用户改回范围内再提交。
 */
export function commitNumberDraft(draft: string, bounds: { min: number; max: number }): number | undefined {
  if (draft.trim() === "") return undefined;
  const parsed = Number(draft);
  if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) return undefined;
  return parsed;
}
