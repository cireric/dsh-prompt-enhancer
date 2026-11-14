import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logDir } from "./paths.ts";

type TraceFields = Record<string, string | number | boolean | undefined>;
export type ReviewTrace = (event: string, fields?: TraceFields) => void;

/** 只记录调用元数据。提示词、模型文本和错误原文均不写入。 */
export function startReviewTrace(operation: string): ReviewTrace {
  const id = randomUUID();
  const started = performance.now();
  return (event, fields) => {
    const time = new Date().toISOString();
    try {
      const dir = logDir();
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      appendFileSync(
        join(dir, `review-${time.slice(0, 10)}.jsonl`),
        JSON.stringify({ time, id, operation, event, elapsedMs: Math.round(performance.now() - started), ...fields }) + "\n",
        { encoding: "utf8", mode: 0o600 },
      );
    } catch (error) {
      const code = safeErrorCode(error);
      console.warn("[prompt-enhancer] AI trace write failed", { id, operation, event, code });
    }
  };
}

export function safeFailureCode(code: unknown): string | undefined {
  return typeof code === "string" && /^[a-z][a-z0-9_-]{0,63}$/i.test(code) ? code : undefined;
}

export function safeErrorCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error
    ? safeFailureCode(error.code)
    : undefined;
}
