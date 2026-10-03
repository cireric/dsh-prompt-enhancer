import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

/**
 * 屏蔽 Node 内置 `node:sqlite` 的实验特性警告，并提供惰性同步加载。
 *
 * 该警告（ExperimentalWarning: SQLite is an experimental feature...）在首次加载
 * node:sqlite 模块时经 process.emitWarning 输出一次。既然产物是 ESM，静态
 * `import ... from "node:sqlite"` 会被提升到模块体之前求值，从而先于任何静音
 * 代码触发警告。因此这里改用 `createRequire` 在运行时惰性加载 node:sqlite：
 * 先安装静音拦截，真正调用加载时警告已被过滤掉，其余警告一切照旧。
 *
 * 注：Node 24 已不再打印该警告（实测），保留拦截是为兼容 engines 允许的 Node 22。
 */
// 在 ESM 产物中同步 require 内置模块：createRequire 以本文件为基准解析
const requireBuiltin = createRequire(import.meta.url);

/** node:sqlite 模块中 DatabaseSync 构造函数的类型。 */
type SqliteModule = { DatabaseSync: typeof DatabaseSync };

let sqliteMod: SqliteModule | undefined;

/** 警告是否属于「node:sqlite 实验特性」这一类（warning 可能是字符串，也可能是带 .message 的 Error）。 */
function isSqliteExperimentalWarning(args: unknown[]): boolean {
  const warning = args[0];
  const message =
    typeof warning === "string" ? warning : warning instanceof Error ? warning.message : "";
  return typeof message === "string" && message.includes("SQLite is an experimental feature");
}

/**
 * 惰性获取 node:sqlite 模块（首次调用时才真正加载）。
 *
 * ⚠️ 静音**只在加载窗口内**生效，加载完立刻还原（审查 #10-①）：旧实现把 `process.emitWarning`
 * 改写留在模块顶层、且永不恢复——一个插件把全局宿主对象的函数换掉且不留恢复路径，是能在别人的
 * 进程里制造「警告凭空消失」的改动，代价远超它省下的一行噪声。真正的警告在 `require` 期间发出，
 * 所以窗口收窄到这里既不丢功能，也不再改动宿主进程的全局状态。
 */
function loadSqlite(): SqliteModule {
  if (sqliteMod) return sqliteMod;
  const original = process.emitWarning;
  process.emitWarning = ((...args: unknown[]) => {
    if (isSqliteExperimentalWarning(args)) return;
    return (original as (...a: unknown[]) => unknown)(...args);
  }) as typeof process.emitWarning;
  try {
    sqliteMod = requireBuiltin("node:sqlite") as SqliteModule;
  } finally {
    process.emitWarning = original; // 无论加载成功与否都还原（异常路径同样不留全局改动）
  }
  return sqliteMod;
}

/** 打开一个 SQLite 数据库连接实例。 */
export function createDatabase(path: string): DatabaseSync {
  return new (loadSqlite().DatabaseSync)(path);
}
