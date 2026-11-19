/** 两端共用 HTTP 请求体上限，浏览器另用同一上限检查文件字节数。 */
export const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;

export function makeImportRequest(backup: unknown, confirm?: boolean) {
  return { backup, confirm };
}

/** 预览的 false 比确认的 true 多一字节，导出及文件校验按较长信封留出空间。 */
export const IMPORT_REQUEST_OVERHEAD = JSON.stringify(makeImportRequest(null, false)).length - "null".length;
