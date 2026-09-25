/**
 * 两个 `*IconOnly` 设置的**单一判定**（P8 T2 / D-P8-10）。
 *   `true`  ⇒ 只渲染图标，按钮名进 `aria-label`（无障碍面不丢名字）
 *   `false` ⇒ 图标 + 文字
 * 提到纯函数是为了让「两处判定一致」有自动化判据——本仓库无 react-dom，组件接线只能靠活体。
 */
export function showsLabel(iconOnly: boolean | undefined): boolean {
  return iconOnly === false;
}
