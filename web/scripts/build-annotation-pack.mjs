#!/usr/bin/env node
/**
 * Build blind human-annotation pack for the iter-11 stratified-35 sample.
 *
 * Sources:
 *   - aft_compare/sample_stratified35.jsonl
 *   - Judge report buckets under AFT_REPORTS_ROOT (default repo/../data path)
 *   - Trial artifacts under harbor-index-trials/trials_extracted/
 *
 * Outputs (under web/):
 *   - data/annotate/pack.json          — served to annotators (no judge identity)
 *   - public/annotate/trials/<slug>/   — trajectory + verifier context
 *   - ../aft_compare/annotation_judge_map.json — admin-only mapping (NOT copied to web/data)
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  buildTaskFilesystemSnapshot,
  findTaskDir,
  mergeTrajectoryReadSeeds,
  resolveHaeIndexDir,
} from "./build-task-filesystem.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");

const SAMPLE = join(repoRoot, "aft_compare", "sample_stratified35.jsonl");
const REPORTS_ROOT = process.env.AFT_REPORTS_ROOT || "/data/aft_reports";
const TRIALS_ROOT = join(repoRoot, "harbor-index-trials", "trials_extracted");

/** Seconds the agent ran before the Daytona agent-timeout cut it off, read from
 *  a trial's result.json (AgentTimeoutError). null if not a timeout / unreadable.
 *  Verifier timeouts are a different thing — intentionally excluded. */
function detectAgentTimeoutS(resultPath) {
  try {
    const ei = JSON.parse(readFileSync(resultPath, "utf-8"))?.exception_info;
    if (ei?.exception_type === "AgentTimeoutError") {
      const m = /timed out after\s+([\d.]+)\s*seconds/i.exec(ei.exception_message || "");
      return m ? Math.round(parseFloat(m[1])) : 0;
    }
  } catch {
    /* no result.json / unreadable */
  }
  return null;
}

// 2026-05-28: 3-judge cross-family aggregation on the may26 stratified-35
// sample — composer-2.5, gpt-5.5/high, and claude-opus-4-7/high — pool all
// 15 runs per trial and union failure modes / majority closeness.
// One trial (sunblaze-ucb_cybergym_oss-fuzz_42535468) is missing the 5 opus
// reports: claude-opus-4-7 deterministically refuses it under Anthropic's
// cyber-safeguard (stop_reason: refusal). That trial falls back to 10 reports.
const JUDGES = [
  {
    key: "may26-3judge",
    buckets: [
      ...[1, 2, 3, 4, 5].map((r) => `cursor-composer-2-5-may26-r${r}`),
      ...[1, 2, 3, 4, 5].map((r) => `gpt-5.5-may26-r${r}`),
      ...[1, 2, 3, 4, 5].map((r) => `claude-opus-4-7-may26-r${r}`),
    ],
  },
];

function slug(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

function loadReport(bucket, task, trialId) {
  const p = join(REPORTS_ROOT, bucket, `${task}__${trialId}.report.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function stripCode(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([A-Z]\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

function majorityCloseness(reports) {
  const counts = new Map();
  for (const r of reports) {
    const c = r?.outcome?.closeness ?? r?.closeness;
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = null;
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function pickVariant(seed, variants) {
  if (variants.length === 0) return null;
  const h = createHash("sha256").update(seed).digest();
  return variants[h[0] % variants.length];
}

function unionFailureModes(reports, task, trialId) {
  /** @type {Map<string, { aft: Record<string,string>, variants: Array<{ name: string, description: string, evidence_quote: string, step_indices: number[] }> }>} */
  const modes = new Map();
  for (const r of reports) {
    for (const m of r.failure_modes ?? []) {
      const aft = m.aft ?? {};
      const codes = {
        A: stripCode(aft.A) ?? "",
        B: stripCode(aft.B) ?? "",
        C: stripCode(aft.C) ?? "",
        D: stripCode(aft.D) ?? "",
      };
      const key = [codes.A, codes.B, codes.C, codes.D].join("|");
      if (!key.replace(/\|/g, "")) continue;
      const variant = {
        name: m.name ?? "",
        description: m.description ?? "",
        evidence_quote: m.evidence_quote ?? "",
        step_indices: normalizeStepIndices(m.step_indices ?? []),
      };
      const prev = modes.get(key);
      if (prev) prev.variants.push(variant);
      else modes.set(key, { aft: codes, variants: [variant] });
    }
  }
  // No vote filter: show every distinct AFT-4-tuple any judge emitted on this
  // trial (dedup by tuple, so identical tuples from different runs collapse
  // into one card; pickVariant below still picks one variant's name/quote
  // deterministically). Surfaces the full label diversity for the annotator
  // instead of hiding minority labels behind a majority threshold.
  return [...modes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { aft, variants }], i) => {
      const picked = pickVariant(`${task}::${trialId}::${key}`, variants);
      return {
        id: `fm-${i}`,
        name: picked?.name ?? "",
        description: picked?.description ?? "",
        evidence_quote: picked?.evidence_quote ?? "",
        step_indices: picked?.step_indices ?? [],
        aft,
      };
    });
}

function findLabbenchFigurePath(taskDir) {
  for (const rel of ["environment/workspace/figure.jpg", "figure.jpg"]) {
    const p = join(taskDir, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

function pickJudgeIndex(task, trialId) {
  const h = createHash("sha256").update(`${task}::${trialId}`).digest();
  return h[0] % JUDGES.length;
}

function findInstructionPath(task, trialId) {
  const trialDir = join(TRIALS_ROOT, task, trialId);
  const candidates = [];

  const resultPath = join(trialDir, "result.json");
  if (existsSync(resultPath)) {
    try {
      const result = JSON.parse(readFileSync(resultPath, "utf-8"));
      for (const p of [result?.task_id?.path, result?.config?.task?.path]) {
        if (p) candidates.push(join(repoRoot, "task_dataset", p, "instruction.md"));
      }
    } catch {
      /* ignore */
    }
  }

  // may26+ flat hae-index-src clone — direct name + task.toml name-index resolve
  const hae = resolveHaeIndexDir(repoRoot, task);
  if (hae) candidates.push(join(hae, "instruction.md"));

  for (const env of ["daytona", "modal"]) {
    candidates.push(
      join(repoRoot, "task_dataset", "harbor-index", "datasets", env, task, "instruction.md"),
    );
  }

  if (task.startsWith("gaia2-cli_")) {
    const token = task.slice("gaia2-cli_".length).replace(/_/g, "-").toLowerCase();
    const daytonaDir = join(repoRoot, "task_dataset", "harbor-index", "datasets", "daytona");
    if (existsSync(daytonaDir)) {
      for (const name of readdirSync(daytonaDir)) {
        if (name.toLowerCase().includes(token)) {
          candidates.push(join(daytonaDir, name, "instruction.md"));
        }
      }
    }
  }

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function auditStepIndex(n) {
  if (n == null || n === "") return null;
  const v = Number(n);
  // Judge reports cite trajectory step_id (1-based); UI/trajectory use 0-based indices.
  return Number.isFinite(v) ? v - 1 : null;
}

function normalizeStepIndices(indices) {
  return [...new Set((indices ?? []).map(auditStepIndex).filter((i) => i != null && i >= 0))].sort(
    (a, b) => a - b,
  );
}

const TOOL_OUTPUT_MAX = 16_000;

function summarizeToolOutput(content) {
  const text = typeof content === "string" ? content : content == null ? "" : String(content);
  if (text.length === 0) return {};
  if (text.length <= TOOL_OUTPUT_MAX) return { output: text };
  const head = text.slice(0, TOOL_OUTPUT_MAX);
  return { output: head, output_truncated_bytes: text.length - head.length };
}

/**
 * Map tool-call index → observation content. Three upstream conventions seen:
 *   1. `results[].source_call_id` tagged → match by id (harbor-rerun agents).
 *   2. Untagged but `len(results) == len(tool_calls)` → match positionally
 *      (gso, swebench-verified, gaia).
 *   3. Untagged single result with multiple calls → terminus-style batched
 *      step; attach the consolidated output to the LAST call so the
 *      annotator can still see what came back.
 */
function buildCallOutputMap(toolCalls, observationResults) {
  const byIndex = new Map();
  if (!toolCalls.length || !observationResults.length) return byIndex;
  const byId = new Map();
  for (const r of observationResults) {
    if (r && typeof r === "object" && r.source_call_id != null) {
      byId.set(r.source_call_id, r.content);
    }
  }
  const canPositional = observationResults.length === toolCalls.length;
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i] ?? {};
    const id = tc.tool_call_id ?? tc.id;
    if (id != null && byId.has(id)) {
      byIndex.set(i, byId.get(id));
    } else if (canPositional) {
      const r = observationResults[i];
      if (r && typeof r === "object" && "content" in r) byIndex.set(i, r.content);
    }
  }
  if (
    byIndex.size === 0 &&
    observationResults.length === 1 &&
    toolCalls.length > 1
  ) {
    const r = observationResults[0];
    if (r && typeof r === "object" && "content" in r) {
      for (let i = 0; i < toolCalls.length; i++) byIndex.set(i, r.content);
    }
  }
  return byIndex;
}

// For each separator step, remap its 0-based index to the next surviving step
// (or the previous one if the trajectory ends on a run of separators). The
// judges cite the actual ACTION step that follows a content-block separator
// 99% of the time, so this forwards judge-cited step_indices / step_where_lost
// to the right anchor when the viewer hides the separator.
function buildSeparatorRemap(summarySteps) {
  const remap = new Map();
  for (let i = 0; i < summarySteps.length; i++) {
    if (summarySteps[i].kind !== "tool_use_block_separator") continue;
    let target = null;
    for (let j = i + 1; j < summarySteps.length; j++) {
      if (summarySteps[j].kind !== "tool_use_block_separator") {
        target = summarySteps[j].index; break;
      }
    }
    if (target == null) {
      for (let j = i - 1; j >= 0; j--) {
        if (summarySteps[j].kind !== "tool_use_block_separator") {
          target = summarySteps[j].index; break;
        }
      }
    }
    if (target != null) remap.set(summarySteps[i].index, target);
  }
  return remap;
}

function remapStepIndices(arr, remap) {
  if (!arr || !arr.length || !remap.size) return arr ?? [];
  return [...new Set(arr.map((i) => (remap.has(i) ? remap.get(i) : i)))].sort((a, b) => a - b);
}

function remapStep(v, remap) {
  if (v == null || !remap.size) return v;
  return remap.has(v) ? remap.get(v) : v;
}

// Some harness/adapter combinations record assistant CONTENT BLOCKS raw in
// ATIF `message` instead of unwrapping them — the trajectory ends up with
// JSON like {"type":"redacted_thinking","data":"openrouter.reasoning:<b64>"}
// or {"type":"text","text":"<the message>"}. The first is not actually
// encrypted — OpenRouter passes hy3-preview's reasoning through wrapped in
// Anthropic's redacted_thinking envelope, base64-encoding the underlying
// {"text":"…","type":"reasoning.text"} payload (2,050 such steps across 127
// trials in the bundled corpus, all claude-code × tencent/hy3-preview-…).
// The second is just Anthropic's standard text content block stored verbatim
// (~4 steps on skillsbench × glm-5.1 / MiniMax).
//
// Without this decoder, both render as "No agent message" fallbacks even
// when they carry thousands of useful characters. Returns
//   { kind: "reasoning" | "message", text }
// so the caller can route the decoded payload to the appropriate summary
// field, or null if the message isn't an envelope we recognise.
function decodeContentBlockEnvelope(rawMessage) {
  if (!rawMessage || !rawMessage.startsWith('{"type":')) return null;
  try {
    const env = JSON.parse(rawMessage);
    if (env?.type === "redacted_thinking") {
      const data = env.data;
      if (typeof data !== "string" || !data.startsWith("openrouter.reasoning:")) return null;
      const b64 = data.slice("openrouter.reasoning:".length);
      const inner = JSON.parse(Buffer.from(b64 + "==", "base64").toString("utf-8"));
      return typeof inner.text === "string"
        ? { kind: "reasoning", text: inner.text.trim() }
        : null;
    }
    if (env?.type === "text" && typeof env.text === "string") {
      return { kind: "message", text: env.text.trim() };
    }
  } catch {
    /* not parseable as JSON */
  }
  return null;
}

function summarizeTrajectory(traj) {
  const steps = traj?.steps ?? [];
  // Per-step wall-clock timing from ATIF `timestamp`s (epoch ms; null when a
  // step has no parseable timestamp). `dur_ms` = gap to the next timestamped
  // step; `elapsed_ms` = time since the first timestamped step.
  const tsMs = steps.map((s) => {
    const t = Date.parse(s?.timestamp ?? "");
    return Number.isNaN(t) ? null : t;
  });
  const firstTs = tsMs.find((t) => t != null) ?? null;
  return steps.map((s, arrayIndex) => {
    const stepId = s.step_id != null ? Number(s.step_id) : arrayIndex + 1;
    const index = Number.isFinite(stepId) ? stepId - 1 : arrayIndex;
    const rawMessage = String(s.message ?? s.text ?? "").trim();
    const decoded = decodeContentBlockEnvelope(rawMessage);
    const message =
      decoded?.kind === "message" ? decoded.text :
      decoded?.kind === "reasoning" ? "" :
      rawMessage;
    const reasoning =
      String(s.reasoning_content ?? "").trim() ||
      (decoded?.kind === "reasoning" ? decoded.text : "");
    const toolCalls = Array.isArray(s.tool_calls) ? s.tool_calls : [];
    const observationResults = Array.isArray(s.observation?.results) ? s.observation.results : [];
    const outputByIndex = buildCallOutputMap(toolCalls, observationResults);
    const role = s.source ?? s.role ?? "unknown";

    // Some adapters (notably claude-code paired with vendor-prefixed model
    // names like `MiniMax/MiniMax-M2.7` or `moonshotai/kimi-k2.6`, and
    // gemini-cli's user-role observation placeholders) emit one ATIF step
    // per CONTENT BLOCK rather than per turn. The block-only step has no
    // message / reasoning / tool_calls — the meaningful content sits on the
    // adjacent steps. Tag any empty step (regardless of role) so the viewer
    // hides it cleanly and downstream analysis can recognise the artifact
    // without re-deriving the pattern.
    const isBlockSeparator = !message && !reasoning && toolCalls.length === 0;

    const thisTs = tsMs[arrayIndex];
    let nextTs = null;
    for (let j = arrayIndex + 1; j < tsMs.length; j++) {
      if (tsMs[j] != null) {
        nextTs = tsMs[j];
        break;
      }
    }
    const durMs = thisTs != null && nextTs != null ? nextTs - thisTs : null;
    const elapsedMs = thisTs != null && firstTs != null ? thisTs - firstTs : null;

    return {
      index,
      step_id: stepId,
      role,
      text: message,
      ...(reasoning ? { reasoning } : {}),
      tool_calls: toolCalls.map((tc, i) => ({
        name: tc.function_name ?? tc.name ?? "tool",
        args: JSON.stringify(tc.arguments ?? tc.args ?? {}),
        ...(outputByIndex.has(i) ? summarizeToolOutput(outputByIndex.get(i)) : {}),
      })),
      ...(isBlockSeparator ? { kind: "tool_use_block_separator" } : {}),
      ...(durMs != null ? { dur_ms: durMs } : {}),
      ...(elapsedMs != null ? { elapsed_ms: elapsedMs } : {}),
    };
  });
}

/** Total wall-clock span of the run (first → last timestamped step). */
function trajTimingMeta(traj) {
  const ts = (traj?.steps ?? [])
    .map((s) => Date.parse(s?.timestamp ?? ""))
    .filter((t) => !Number.isNaN(t));
  if (ts.length < 2) return {};
  const min = Math.min(...ts);
  return { total_ms: Math.max(...ts) - min, started_at: new Date(min).toISOString() };
}

function main() {
  if (!existsSync(SAMPLE)) {
    console.warn(`build-annotation-pack: missing ${SAMPLE}; skipping`);
    return;
  }

  const sample = readFileSync(SAMPLE, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const packTrials = [];
  const judgeMap = [];

  const dataDir = join(webRoot, "data", "annotate");
  const publicTrials = join(webRoot, "public", "annotate", "trials");
  const committedPack = join(repoRoot, "aft_compare", "annotation_pack", "pack.json");
  const committedTrials = join(repoRoot, "aft_compare", "annotation_public", "trials");

  if (!existsSync(REPORTS_ROOT)) {
    if (existsSync(committedPack)) {
      mkdirSync(dataDir, { recursive: true });
      // Patch agent_timeout_s onto the restored pack from each trial's committed
      // result.json (read from the committed source, before the copy). The full
      // rebuild — which bakes this into the committed pack — only runs where the
      // judge reports live; this keeps the timeout badge working on deploys that
      // just restore the committed pack (e.g. Vercel). Written before the copy
      // so a cp hiccup can't drop it.
      const pack = JSON.parse(readFileSync(committedPack, "utf-8"));
      for (const t of pack.trials ?? []) {
        t.agent_timeout_s =
          detectAgentTimeoutS(join(committedTrials, t.slug, "result.json")) ??
          detectAgentTimeoutS(join(TRIALS_ROOT, t.task, t.trial_id, "result.json"));
      }
      writeFileSync(join(dataDir, "pack.json"), JSON.stringify(pack, null, 2) + "\n");
      if (existsSync(committedTrials)) {
        try {
          mkdirSync(publicTrials, { recursive: true });
          cpSync(committedTrials, publicTrials, { recursive: true, force: true });
        } catch (e) {
          // public trials are also committed under web/public; the pack (with
          // agent_timeout_s) is already written, so a copy hiccup is non-fatal.
          console.warn(`build-annotation-pack: restore copy of public trials skipped — ${e.message}`);
        }
      }
      console.log("build-annotation-pack: AFT_REPORTS_ROOT missing — restored committed pack (+agent_timeout_s)");
      return;
    }
    console.warn(`build-annotation-pack: missing ${REPORTS_ROOT} and no committed pack; skipping`);
    return;
  }

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(publicTrials, { recursive: true });

  for (let i = 0; i < sample.length; i++) {
    const row = sample[i];
    const { task, trial_id: trialId, benchmark, harness, model } = row;
    const annId = `trial-${String(i + 1).padStart(2, "0")}`;
    const trialSlug = slug(`${task}__${trialId}`);

    const judge = JUDGES[pickJudgeIndex(task, trialId)];
    const reports = judge.buckets
      .map((b) => loadReport(b, task, trialId))
      .filter(Boolean);

    let ref, closeness, failureModes;
    if (reports.length >= 3) {
      ref = reports[0];
      closeness = majorityCloseness(reports);
      failureModes = unionFailureModes(reports, task, trialId);
    } else if (reports.length > 0) {
      console.warn(`build-annotation-pack: ${task}/${trialId} — only ${reports.length} reports (need ≥3 for majority); using first report, empty failure modes`);
      ref = reports[0];
      closeness = reports[0].outcome?.closeness ?? null;
      failureModes = [];
    } else {
      // No judge reports yet — stub from result.json so the trial still
      // shows up in /annotate (with no failure modes to review).
      const resultPath = join(TRIALS_ROOT, task, trialId, "result.json");
      let resultJson = null;
      try {
        resultJson = JSON.parse(readFileSync(resultPath, "utf-8"));
      } catch {}
      ref = {
        trial: {
          id: trialId,
          harness: harness ?? resultJson?.agent_info?.name ?? null,
          model: model ?? resultJson?.agent_info?.model_info?.name ?? null,
          reward: resultJson?.verifier_result?.rewards?.reward ?? null,
        },
        outcome: {},
      };
      closeness = null;
      failureModes = [];
      console.warn(`build-annotation-pack: ${task}/${trialId} — no judge reports yet (stub entry)`);
    }

    const trialDir = join(TRIALS_ROOT, task, trialId);
    const outDir = join(publicTrials, trialSlug);
    mkdirSync(outDir, { recursive: true });

    // Daytona agent timeout badge (see detectAgentTimeoutS). Baked into the
    // committed pack so the restore path on Vercel keeps it too.
    const agentTimeoutS = detectAgentTimeoutS(join(trialDir, "result.json"));

    let instructionAvailable = false;
    const instructionSrc = findInstructionPath(task, trialId);
    if (instructionSrc) {
      cpSync(instructionSrc, join(outDir, "instruction.md"));
      instructionAvailable = true;
    }

    let filesystemAvailable = false;
    const taskDir = findTaskDir(repoRoot, TRIALS_ROOT, task, trialId);
    if (taskDir) {
      const fsResult = buildTaskFilesystemSnapshot(taskDir, outDir);
      filesystemAvailable = fsResult.available;

      const trajPath = join(trialDir, "trajectory.json");
      const manifestPath = join(outDir, "filesystem.json");
      if (filesystemAvailable && existsSync(trajPath) && existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        const readSeeds = mergeTrajectoryReadSeeds(trajPath, join(outDir, "fs"), manifest.tree);
        if (readSeeds.fileCount > 0) {
          manifest.generated_at = new Date().toISOString();
          manifest.trajectory_read_seeds = readSeeds.fileCount;
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
        }
      }

      if (fsResult.warnings?.length) {
        console.warn(`build-annotation-pack: ${annId} filesystem — ${fsResult.warnings.join("; ")}`);
      }
    }

    let figureAvailable = false;
    if (taskDir && task.startsWith("labbench-")) {
      const figureSrc = findLabbenchFigurePath(taskDir);
      if (figureSrc) {
        cpSync(figureSrc, join(outDir, "figure.jpg"));
        figureAvailable = true;
      }
    }

    // Summarize the trajectory early so we can derive a separator-step
    // remap and apply it to every judge-cited step index BEFORE we freeze the
    // presentation. The viewer hides separator steps; if we didn't forward
    // citations that land on them, those labels would lose their anchor.
    let summaryStepsOut = null;
    let summaryMeta = {};
    let separatorRemap = new Map();
    const trajPathForSummary = join(trialDir, "trajectory.json");
    if (existsSync(trajPathForSummary)) {
      const traj = JSON.parse(readFileSync(trajPathForSummary, "utf-8"));
      summaryStepsOut = summarizeTrajectory(traj);
      summaryMeta = trajTimingMeta(traj);
      separatorRemap = buildSeparatorRemap(summaryStepsOut);
    }

    const failureModesRemapped = failureModes.map((fm) => ({
      ...fm,
      step_indices: remapStepIndices(fm.step_indices, separatorRemap),
    }));

    packTrials.push({
      id: annId,
      slug: trialSlug,
      task,
      trial_id: trialId,
      benchmark,
      harness,
      agent_model: model,
      reward: ref.trial?.reward ?? null,
      agent_timeout_s: agentTimeoutS,
      presentation: {
        closeness,
        step_where_lost: remapStep(auditStepIndex(ref.outcome?.step_where_lost), separatorRemap),
        unproductive_iteration_count: ref.outcome?.unproductive_iteration_count ?? null,
        headline: ref.outcome?.headline ?? "",
        what_verifier_checked: ref.outcome?.what_verifier_checked ?? "",
        what_agent_produced: ref.outcome?.what_agent_produced ?? "",
        exact_failure_quote: ref.outcome?.exact_failure_quote ?? "",
        test_stdout_available: ref.outcome?.test_stdout_available ?? false,
        instruction_available: instructionAvailable,
        figure_available: figureAvailable,
        filesystem_available: filesystemAvailable,
        failure_modes: failureModesRemapped,
      },
    });

    judgeMap.push({
      id: annId,
      task,
      trial_id: trialId,
      judge: judge.key,
      n_reports: reports.length,
    });

    for (const fname of ["test_stdout.txt", "result.json"]) {
      const src = join(trialDir, fname);
      if (existsSync(src)) cpSync(src, join(outDir, fname));
    }
    if (summaryStepsOut) {
      writeFileSync(
        join(outDir, "trajectory.summary.json"),
        JSON.stringify({ ...summaryMeta, steps: summaryStepsOut }, null, 2),
      );
    }
  }

  const pack = {
    generated_at: new Date().toISOString(),
    rubric: "iter-11",
    n_trials: packTrials.length,
    instructions:
      "Review the automated audit at cited trajectory steps. Mark agree or disagree for closeness and each failure-mode label. The judge model is hidden to reduce bias.",
    trials: packTrials,
  };

  writeFileSync(join(dataDir, "pack.json"), JSON.stringify(pack, null, 2) + "\n");
  writeFileSync(
    join(repoRoot, "aft_compare", "annotation_judge_map.json"),
    JSON.stringify({ generated_at: pack.generated_at, trials: judgeMap }, null, 2) + "\n",
  );

  const committedPackDir = join(repoRoot, "aft_compare", "annotation_pack");
  const committedPublic = join(repoRoot, "aft_compare", "annotation_public", "trials");
  mkdirSync(committedPackDir, { recursive: true });
  writeFileSync(join(committedPackDir, "pack.json"), JSON.stringify(pack, null, 2) + "\n");
  // Wipe the committed trials dir before copying. Without this the cpSync
  // can abort mid-tree with EEXIST when a previous build left a dir where
  // the new tree has a file (or vice versa — common with filesystem.json
  // snapshots regenerating differently). The abort silently leaves trials
  // later in iteration order with stale or missing assets — e.g. trial-33
  // and trial-35 were missing their committed instruction.md so Vercel
  // served 404 on /annotate/trials/<slug>/instruction.md and the viewer
  // stuck on "Loading…". Force-clearing is safe: every trial in the sample
  // gets re-staged below by the cpSync.
  rmSync(committedPublic, { recursive: true, force: true });
  mkdirSync(committedPublic, { recursive: true });
  cpSync(publicTrials, committedPublic, { recursive: true });

  console.log(
    `build-annotation-pack: ${packTrials.length} trials → data/annotate/pack.json + public/annotate/trials/`,
  );
}

main();
