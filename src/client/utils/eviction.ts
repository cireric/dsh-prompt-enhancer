import { selectEvictions } from "../../eviction-order.ts";
import type { Prompt } from "../../types.ts";

/** 预演新增条目后的淘汰名单。新条目计入总数，候选仅来自现有条目。 */
export function previewEvictions(prompts: Prompt[], maxCount: number, incoming: number = 1): Prompt[] {
  return selectEvictions(prompts, prompts.length + incoming - maxCount);
}
