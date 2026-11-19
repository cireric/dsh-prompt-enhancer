// Offline request/response replay through the real host capability; no provider or network.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const variant = option("--variant", "candidate");
const split = option("--split", "all");
assert.ok(["baseline", "candidate"].includes(variant));
assert.ok(["all", "tuning", "holdout"].includes(split));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const rawCases = readFileSync(join(here, "cases.json"));
const baseline = JSON.parse(readFileSync(join(here, "baseline.json"), "utf8"));
assert.equal(sha256(rawCases), baseline.casesSha256, "验收样本冻结后被修改");
const { cases } = JSON.parse(rawCases);
const scratch = mkdtempSync(join(tmpdir(), "dpe-draft-replay-"));
const homeBefore = process.env.DSH_HOME;
process.env.DSH_HOME = join(scratch, "home");
globalThis.__DEV__ = false;
try {
  let sourceRoot = resolve(option("--source-root", root));
  if (variant === "baseline" && !args.includes("--source-root")) {
    cpSync(join(root, "src"), join(scratch, "src"), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"), "dir");
    execFileSync("git", ["apply", "--reverse", join(here, "change.patch")], { cwd: scratch });
    sourceRoot = scratch;
  }
  const sourceHashes = Object.fromEntries(["src/host/ai.ts", "src/host/draft.ts"].map((file) =>
    [file, sha256(readFileSync(join(sourceRoot, file)))]));
  if (variant === "baseline") {
    for (const [file, hash] of Object.entries(sourceHashes)) assert.equal(hash, baseline.relevantFiles[file]);
  }
  const ai = await import(pathToFileURL(join(sourceRoot, "src/host/ai.ts")));
  const { aiResultCache } = await import(pathToFileURL(join(sourceRoot, "src/host/ai-cache.ts")));
  const results = [];
  for (const sample of cases.filter((sample) => split === "all" || sample.split === split)) {
    aiResultCache.clear();
    ai.clearRouteCache();
    const calls = [];
    const events = [];
    ai.registerLlm({
      listProviders: () => [{ id: "replay" }],
      listModels: async () => [{ id: "synthetic-draft-v1" }],
      resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: "off" }], defaultEffort: "off" } }),
      async *stream({ signal, ...options }) {
        signal.throwIfAborted();
        const reply = JSON.stringify(sample.replies[Math.min(calls.length, sample.replies.length - 1)]);
        calls.push({ options, rawReply: reply, finishReason: "stop" });
        yield { type: "text-delta", index: 0, text: reply };
        yield { type: "finish", reason: { kind: "stop" } };
      },
    });
    const settings = { aiProvider: "replay", aiModel: "synthetic-draft-v1" };
    const trace = (event, fields) => events.push({ event, ...fields });
    const result = await ai.draftPromptCore(sample.request, settings, trace);
    const delivered = result.ok ? result.draft.kind === "draft" ? result.draft.body
      : result.draft.questions.map(({ question, options }) => [question, ...options].join("\n")).join("\n") : "";
    const failures = [];
    if (!result.ok || result.draft.kind !== sample.expectedKind) failures.push("decision");
    for (const text of sample.mustInclude) if (!delivered.includes(text)) failures.push(`missing: ${text}`);
    for (const text of sample.mustExclude) if (delivered.includes(text)) failures.push(`forbidden: ${text}`);
    const beforeRepeat = calls.length;
    const initialHit = events.some((e) => e.event === "cache-hit");
    const beforeRepeatEvents = events.length;
    const repeated = await ai.draftPromptCore(sample.request, settings, trace);
    assert.deepEqual(repeated, result);
    assert.equal(calls.length, beforeRepeat, "重复请求必须命中成功缓存");
    results.push({ id: sample.id, split: sample.split, request: sample.request, calls, result,
      deliveredPrompt: delivered, failures, pass: failures.length === 0,
      cache: { initialHit, repeatHit: events.slice(beforeRepeatEvents).some((e) => e.event === "cache-hit") },
      trace: events.filter(({ event }) => ["cache-hit", "candidate-accepted", "candidate-rejected", "round-start"].includes(event)),
      downstreamExecution: null });
  }
  const output = { variant, split, node: process.version, casesSha256: sha256(rawCases), sourceHashes,
    model: "synthetic-draft-v1 (scripted runtime; not a real model)",
    downstreamStatus: "未调用下游模型；仅检查正文交接，执行产物质量待验证。", results };
  writeFileSync(resolve(option("--output", join(here, `${variant}-results.json`))), JSON.stringify(output, null, 2) + "\n");
  for (const { id, pass, failures, calls } of results) console.log(`${pass ? "PASS" : "FAIL"} ${id} calls=${calls.length} ${failures.join("; ")}`);
  if (variant === "candidate") assert.ok(results.every(({ pass }) => pass), "候选版未通过冻结判据");
} finally {
  if (homeBefore === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = homeBefore;
  rmSync(scratch, { recursive: true, force: true });
}
