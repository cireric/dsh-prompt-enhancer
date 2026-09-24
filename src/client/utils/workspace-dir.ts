/**
 * 目录选择能力的持有与访问（D-P6-4；签名逐字照 R3，T5 的导出按钮消费）。
 *
 * 宿主能力在 ctx.uiWorkspace 上（飞行前 §1.4：workspaces 服务没有 pickDirectory）。插件入口用
 * ctx.inject(["uiWorkspace"], ...) 版本化持有、卸载时复位为 null——本模块不静态 import 宿主包，
 * 也不假设能力一定存在（无该客户端的部署里它缺席）。
 */

let capability: { pickDirectory(): Promise<string | null> } | null = null;

/**
 * 登记 / 复位宿主目录选择能力（null = 没有）。
 * ctx.inject 的回调在服务缺席时也可能被调用（smoke 的假 ctx、无会话部署），故对 undefined 宽容。
 */
export function setDirectoryCapability(cap: { pickDirectory(): Promise<string | null> } | null): void {
  capability = cap ?? null;
}

/** 宿主原生目录选择器是否可用（导出按钮据此渲染为禁用 + 可读原因，不静默）。 */
export function isDirectoryPickerAvailable(): boolean {
  return !!capability && typeof capability.pickDirectory === "function";
}

/**
 * 打开宿主原生目录选择器。
 * @returns 选中目录的绝对路径；用户取消返回 null；能力不可用时**抛可读错误**（不静默、不返回 null）。
 */
export async function pickExportDirectory(): Promise<string | null> {
  // 判据与 isDirectoryPickerAvailable 同源：能力对象形状不符时给可读错误，不漏 TypeError。
  if (!capability || typeof capability.pickDirectory !== "function") {
    throw new Error("宿主未提供目录选择能力（ui-workspace 客户端缺失），无法选择导出目录");
  }
  return capability.pickDirectory();
}
