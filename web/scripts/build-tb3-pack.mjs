#!/usr/bin/env node
/**
 * Build the annotation pack for the terminal-bench preview corpus (tb3).
 *
 * Different shape from build-annotation-pack:
 *   - One report per trial (no k-of-5 majority; reports come straight from
 *     /aft_compare/tb-preview/reports/).
 *   - Trial source data lives at /data/tb-preview-trajs/<task>__<short>/
 *     (matched to AFT reports via the `id` field in result.json), not in
 *     harbor-index-trials/.
 *   - No instruction.md / filesystem.json — tb-preview task data isn't
 *     committed locally, so we lean on the AFT report's
 *     what_verifier_checked text + the trajectory itself.
 *
 * Outputs:
 *   - web/data/tb3_pack.json                     — consumed by /tb3 pages
 *   - web/public/annotate/trials/<slug>/...      — trajectory.summary.json,
 *       result.json, test_stdout.txt (same asset path as the harbor-index pack
 *       so AnnotateTrialForm reuse works unchanged)
 *   - aft_compare/tb-preview/pack.json           — committed copy for Vercel
 *   - aft_compare/tb-preview/public_trials/...   — committed copy of assets
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTaskFilesystemSnapshot, mergeTrajectoryReadSeeds } from "./build-task-filesystem.mjs";
import { scrubStep, scrub } from "./scrub-secrets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");

const REPORTS_DIR = join(repoRoot, "aft_compare", "tb-preview", "reports");
const SAMPLE_PATH = join(repoRoot, "aft_compare", "tb-preview", "sample.jsonl");
const TRAJS_ROOT = process.env.TB3_TRAJS_ROOT || "/data/tb-preview-trajs";
const TASKS_ROOT = process.env.TB3_TASKS_ROOT || join(repoRoot, "task_dataset", "tb3-preview", "repo", "tasks");

const dataDir = join(webRoot, "data");
const publicTrials = join(webRoot, "public", "annotate", "trials");
const committedPack = join(repoRoot, "aft_compare", "tb-preview", "pack.json");
const committedTrials = join(repoRoot, "aft_compare", "tb-preview", "public_trials");

function slug(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

function stripCode(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([A-Z]\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

function auditStepIndex(n) {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v - 1 : null;
}

function normalizeStepIndices(indices) {
  return [...new Set((indices ?? []).map(auditStepIndex).filter((i) => i != null && i >= 0))].sort(
    (a, b) => a - b,
  );
}

// ---------------------------------------------------------------------------
// Trajectory summarizer (mirrors build-annotation-pack.mjs).
// ---------------------------------------------------------------------------
const TOOL_OUTPUT_MAX = 16_000;

function summarizeToolOutput(content) {
  const text = typeof content === "string" ? content : content == null ? "" : String(content);
  if (text.length === 0) return {};
  if (text.length <= TOOL_OUTPUT_MAX) return { output: text };
  const head = text.slice(0, TOOL_OUTPUT_MAX);
  return { output: head, output_truncated_bytes: text.length - head.length };
}

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

function summarizeTrajectory(traj) {
  const steps = traj?.steps ?? [];
  return steps.map((s, arrayIndex) => {
    const stepId = s.step_id != null ? Number(s.step_id) : arrayIndex + 1;
    const index = Number.isFinite(stepId) ? stepId - 1 : arrayIndex;
    const message = String(s.message ?? s.text ?? "").trim();
    const reasoning = String(s.reasoning_content ?? "").trim();
    const toolCalls = Array.isArray(s.tool_calls) ? s.tool_calls : [];
    const observationResults = Array.isArray(s.observation?.results) ? s.observation.results : [];
    const outputByIndex = buildCallOutputMap(toolCalls, observationResults);
    return {
      index,
      step_id: stepId,
      role: s.source ?? s.role ?? "unknown",
      text: message,
      ...(reasoning ? { reasoning } : {}),
      tool_calls: toolCalls.map((tc, i) => ({
        name: tc.function_name ?? tc.name ?? "tool",
        args: JSON.stringify(tc.arguments ?? tc.args ?? {}),
        ...(outputByIndex.has(i) ? summarizeToolOutput(outputByIndex.get(i)) : {}),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// tb-preview trial-dir → trial_id index
// ---------------------------------------------------------------------------
function buildTrialIdIndex() {
  const idx = new Map();
  if (!existsSync(TRAJS_ROOT)) return idx;
  for (const name of readdirSync(TRAJS_ROOT)) {
    const dir = join(TRAJS_ROOT, name);
    let s;
    try {
      s = statSync(dir);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;
    const resultPath = join(dir, "result.json");
    if (!existsSync(resultPath)) continue;
    try {
      const r = JSON.parse(readFileSync(resultPath, "utf-8"));
      if (r?.id) idx.set(r.id, dir);
    } catch {}
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Failure-mode flattener — same shape as the harbor-index pack so
// AnnotateTrialForm renders identically.
// ---------------------------------------------------------------------------
function presentFailureModes(report, trialId) {
  return (report.failure_modes ?? []).map((fm, i) => ({
    id: `fm-${i}`,
    name: fm.name ?? "(unnamed)",
    description: fm.description ?? "",
    evidence_quote: fm.evidence_quote ?? "",
    step_indices: normalizeStepIndices(fm.step_indices),
    aft: {
      A: stripCode(fm.aft?.A) ?? null,
      B: stripCode(fm.aft?.B) ?? null,
      C: stripCode(fm.aft?.C) ?? null,
      D: stripCode(fm.aft?.D) ?? null,
    },
  }));
}

// ---------------------------------------------------------------------------
function restoreCommitted() {
  mkdirSync(dataDir, { recursive: true });
  cpSync(committedPack, join(dataDir, "tb3_pack.json"));
  if (existsSync(committedTrials)) {
    mkdirSync(publicTrials, { recursive: true });
    cpSync(committedTrials, publicTrials, { recursive: true });
  }
}

function main() {
  if (!existsSync(SAMPLE_PATH)) {
    if (existsSync(committedPack)) {
      restoreCommitted();
      console.log("build-tb3-pack: tb-preview sample missing — restored committed pack");
      return;
    }
    console.warn(`build-tb3-pack: missing ${SAMPLE_PATH}; skipping`);
    return;
  }

  // On Vercel /data/tb-preview-trajs/ doesn't exist. If the committed pack is
  // already there, prefer it over a partial regenerate (which would write a
  // pack pointing at trial slugs whose per-trial assets don't exist).
  if (!existsSync(TRAJS_ROOT)) {
    if (existsSync(committedPack)) {
      restoreCommitted();
      console.log(`build-tb3-pack: ${TRAJS_ROOT} missing — restored committed pack`);
      return;
    }
    console.warn(`build-tb3-pack: ${TRAJS_ROOT} missing and no committed pack; skipping`);
    return;
  }

  const sample = readFileSync(SAMPLE_PATH, "utf-8")
    .split("\n").filter(Boolean).map((line) => JSON.parse(line));

  const idx = buildTrialIdIndex();
  console.log(`build-tb3-pack: indexed ${idx.size} tb-preview trial dirs`);

  const trials = [];
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(publicTrials, { recursive: true });
  mkdirSync(committedTrials, { recursive: true });

  for (let i = 0; i < sample.length; i++) {
    const { task, trial_id: trialId } = sample[i];
    const reportPath = join(REPORTS_DIR, `${task}__${trialId}.report.json`);
    if (!existsSync(reportPath)) {
      console.warn(`build-tb3-pack: missing report ${reportPath}; skip`);
      continue;
    }
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));

    const annId = `tb3-${String(i + 1).padStart(2, "0")}`;
    const trialSlug = slug(`${task}__${trialId}`);
    const outDir = join(publicTrials, trialSlug);
    mkdirSync(outDir, { recursive: true });

    // Copy verifier output + result.json + trajectory summary.
    const trialDir = idx.get(trialId);
    let testStdoutAvailable = false;
    let trajPath = null;
    if (trialDir) {
      trajPath = join(trialDir, "agent", "trajectory.json");
      if (existsSync(trajPath)) {
        const traj = JSON.parse(readFileSync(trajPath, "utf-8"));
        writeFileSync(
          join(outDir, "trajectory.summary.json"),
          JSON.stringify({ steps: summarizeTrajectory(traj).map(scrubStep) }, null, 2) + "\n",
        );
      } else {
        trajPath = null;
      }
      const resultPath = join(trialDir, "result.json");
      if (existsSync(resultPath))
        writeFileSync(join(outDir, "result.json"), scrub(readFileSync(resultPath, "utf-8")));
      const stdoutPath = join(trialDir, "verifier", "test-stdout.txt");
      if (existsSync(stdoutPath)) {
        writeFileSync(join(outDir, "test_stdout.txt"), scrub(readFileSync(stdoutPath, "utf-8")));
        testStdoutAvailable = true;
      }
    } else {
      console.warn(`build-tb3-pack: ${task}/${trialId} — no traj dir found in ${TRAJS_ROOT}`);
    }

    // Filesystem snapshot from the tb3-preview task source. Same builder as
    // harbor-index uses; layout matches (task.toml + environment/ + tests/).
    let filesystemAvailable = false;
    let instructionAvailable = false;
    const taskSrcDir = join(TASKS_ROOT, task);
    if (existsSync(taskSrcDir)) {
      const instructionSrc = join(taskSrcDir, "instruction.md");
      if (existsSync(instructionSrc)) {
        cpSync(instructionSrc, join(outDir, "instruction.md"));
        instructionAvailable = true;
      }
      try {
        const fsResult = buildTaskFilesystemSnapshot(taskSrcDir, outDir);
        filesystemAvailable = fsResult.available;
        if (filesystemAvailable && trajPath) {
          const manifestPath = join(outDir, "filesystem.json");
          if (existsSync(manifestPath)) {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
            const readSeeds = mergeTrajectoryReadSeeds(trajPath, join(outDir, "fs"), manifest.tree);
            if (readSeeds.fileCount > 0) {
              manifest.generated_at = new Date().toISOString();
              manifest.trajectory_read_seeds = readSeeds.fileCount;
              writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
            }
          }
        }
        if (fsResult.warnings?.length) {
          console.warn(`build-tb3-pack: ${annId} filesystem — ${fsResult.warnings.join("; ")}`);
        }
      } catch (e) {
        console.warn(`build-tb3-pack: ${annId} filesystem build failed: ${e.message}`);
      }
    }

    trials.push({
      id: annId,
      slug: trialSlug,
      task,
      trial_id: trialId,
      benchmark: report.task?.benchmark ?? task,
      harness: report.trial?.harness ?? null,
      agent_model: report.trial?.model ?? null,
      reward: report.trial?.reward ?? null,
      presentation: {
        closeness: report.outcome?.closeness ?? null,
        step_where_lost: auditStepIndex(report.outcome?.step_where_lost),
        unproductive_iteration_count: report.outcome?.unproductive_iteration_count ?? null,
        headline: report.outcome?.headline ?? "",
        what_verifier_checked: report.outcome?.what_verifier_checked ?? "",
        what_agent_produced: report.outcome?.what_agent_produced ?? "",
        exact_failure_quote: report.outcome?.exact_failure_quote ?? "",
        test_stdout_available: testStdoutAvailable,
        instruction_available: instructionAvailable,
        figure_available: false,
        filesystem_available: filesystemAvailable,
        failure_modes: presentFailureModes(report, trialId),
      },
    });

    // Mirror the per-trial assets to the committed location for Vercel.
    const committedOut = join(committedTrials, trialSlug);
    mkdirSync(committedOut, { recursive: true });
    cpSync(outDir, committedOut, { recursive: true });
  }

  const pack = {
    generated_at: new Date().toISOString(),
    rubric: report_rubric_from(sample),
    n_trials: trials.length,
    instructions: tb3_instructions(),
    trials,
  };
  const packJson = JSON.stringify(pack, null, 2) + "\n";
  writeFileSync(join(dataDir, "tb3_pack.json"), packJson);
  writeFileSync(committedPack, packJson);

  console.log(`build-tb3-pack: ${trials.length} trials → data/tb3_pack.json + public/annotate/trials/`);
}

function report_rubric_from(sample) {
  return "aft-v1-tb-preview";
}

function tb3_instructions() {
  return `Terminal-bench preview annotation pack. Single-judge audit (claude-opus-4-7, high).
Failure modes are presented for review; agree/disagree to indicate whether the
audit's failure-mode call matches what you see in the trajectory.`;
}

main();
