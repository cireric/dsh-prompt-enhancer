/**
 * Host 侧数据文件路径。
 *
 * 目标结构：
 *   $DSH_HOME/prompt-enhancer/
 *   ├── db/prompts.db      # 词库主存储（SQLite）
 *   └── log/ai-YYYY-MM-DD.log
 *
 * ⚠️ 所有函数都是**调用期求值**——不要在模块顶层缓存路径：
 * 测试会在自己的进程里把 `DSH_HOME` 指向临时目录后再 import 本模块，
 * 这是本项目唯一的 db 路径注入方式（生产代码不含任何 test-only API）。
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** DSH 数据根目录（可由环境变量覆盖）。 */
export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** 插件数据根目录：$DSH_HOME/prompt-enhancer/ */
export function dataDir(): string {
  return join(dshHome(), "prompt-enhancer");
}

/** 词库 SQLite 数据库文件：$DSH_HOME/prompt-enhancer/db/prompts.db */
export function dbPath(): string {
  return join(dataDir(), "db", "prompts.db");
}

/** AI 诊断日志目录：$DSH_HOME/prompt-enhancer/log/ */
export function logDir(): string {
  return join(dataDir(), "log");
}
