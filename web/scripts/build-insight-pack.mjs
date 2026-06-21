// LOCAL pre-commit build (the insight run output isn't on Vercel). Run after the
// insightfulness judge:  node web/scripts/build-insight-pack.mjs
// Collects per-task insight reports from bottomup_judge/tasks/insight_out/, dedupes
// by task_id (latest run wins), secret-scrubs the prose, and writes the committed
// web/lib/insight_pack.json that the /insightfulness pages render.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrub } from "./scrub-secrets.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const JUDGE = join(WEB, "..", "bottomup_judge");
const OUT_ROOT = join(JUDGE, "tasks", process.env.INSIGHT_OUT_DIR || "insight_out");
const TASKS_DIR = join(JUDGE, "tasks", "insight");
const PACK = join(WEB, "lib", "insight_pack.json");

const SECTIONS = [
  "tldr", "main_insight", "why_it_matters", "evidence_from_trajectories",
  "surface_failure_vs_root_cause", "intended_vs_unexpected_insight",
  "generalizability", "confounds", "implications_for_future_design",
];

function findReports(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) findReports(p, acc);
    else if (e.name === "report.json") acc.push(p);
  }
  return acc;
}

// The canonical scope: exactly the task dirs staged under tasks/insight. Reports
// for any other task_id (e.g. one-off audit extras left in the out dir) are dropped.
const validTasks = (() => {
  try { return new Set(readdirSync(TASKS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)); }
  catch { return new Set(); }
})();
const nTotal = validTasks.size;

// dedupe by task_id, latest mtime wins
const byTask = new Map();
for (const p of findReports(OUT_ROOT).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)) {
  let d;
  try { d = JSON.parse(readFileSync(p, "utf-8")); } catch { continue; }
  if (!d.task_id) continue;
  if (validTasks.size && !validTasks.has(d.task_id)) continue;
  for (const s of SECTIONS) if (typeof d[s] === "string") d[s] = scrub(d[s]);
  byTask.set(d.task_id, {
    task_id: d.task_id,
    benchmark: d.benchmark ?? d.task_id.split(/[-_]/)[0],
    n_trials: d.n_trials ?? null,
    insightfulness: ["high", "medium", "low"].includes(d.insightfulness) ? d.insightfulness : "low",
    ...Object.fromEntries(SECTIONS.map((s) => [s, d[s] ?? ""])),
  });
}

const order = { high: 0, medium: 1, low: 2 };
const reports = [...byTask.values()].sort(
  (a, b) => order[a.insightfulness] - order[b.insightfulness] || a.benchmark.localeCompare(b.benchmark) || a.task_id.localeCompare(b.task_id),
);
const counts = reports.reduce((m, r) => ((m[r.insightfulness] = (m[r.insightfulness] || 0) + 1), m), {});

const pack = {
  judge: "cursor/composer-2.5 (Cursor) on Daytona",
  generated_for: "Harbor-index per-task insightfulness audit — the task + ALL its trial trajectories judged together",
  prompt_source: "insightfulness_prompt.md (Slimshilin), tightened — \"high\" requires a generalizable capability gap most current models lack",
  n_total: nTotal || reports.length,
  n_done: reports.length,
  run_in_progress: nTotal > reports.length && !process.env.INSIGHT_FINAL,
  summary: { high: counts.high || 0, medium: counts.medium || 0, low: counts.low || 0 },
  reports,
};
writeFileSync(PACK, JSON.stringify(pack, null, 2) + "\n");
console.log(`wrote ${PACK}: ${reports.length}/${pack.n_total} reports | ${JSON.stringify(pack.summary)}`);
