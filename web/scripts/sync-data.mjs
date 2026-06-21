// Copy task_aggregation/ and result/ from the repo root into web/data/
// so Next.js can statically import the JSONs at build time.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const dataDir = join(webRoot, "data");

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const tasks_agg_src = join(repoRoot, "task_aggregation");
const result_src = join(repoRoot, "result");

if (!existsSync(tasks_agg_src)) {
  console.warn(`warning: ${tasks_agg_src} does not exist; site will have no aggregations`);
} else {
  cpSync(tasks_agg_src, join(dataDir, "task_aggregation"), { recursive: true });
}
if (!existsSync(result_src)) {
  console.warn(`warning: ${result_src} does not exist; site will have no per-trial reports`);
} else {
  cpSync(result_src, join(dataDir, "result"), { recursive: true });
}

const taxonomy_src = join(repoRoot, "failure_taxonomy.json");
if (existsSync(taxonomy_src)) {
  cpSync(taxonomy_src, join(dataDir, "failure_taxonomy.json"));
}

const rubric_src = join(repoRoot, "lin_taxonomy_en.txt");
if (existsSync(rubric_src)) {
  cpSync(rubric_src, join(dataDir, "lin_taxonomy_en.txt"));
}

const full_prompt_src = join(repoRoot, "full_judge_prompt.txt");
if (existsSync(full_prompt_src)) {
  cpSync(full_prompt_src, join(dataDir, "full_judge_prompt.txt"));
}

// Scraped source-paper definitions/examples backing the /aft "Origin" expanders.
const aftSourcesSrc = join(repoRoot, "aft_sources.json");
if (existsSync(aftSourcesSrc)) {
  cpSync(aftSourcesSrc, join(dataDir, "aft_sources.json"));
}

const aftItersSrc = join(repoRoot, "aft_iters");
if (existsSync(aftItersSrc)) {
  cpSync(aftItersSrc, join(dataDir, "aft_iters"), { recursive: true });
}

// AFT audit reports (gpt-5.5/high). Source-of-truth lives at
// repoRoot/aft_compare/ (committed). At build time:
//   * reports/<bucket>/*.report.json  → web/data/aft_compare/<bucket>/
//   * sample.jsonl, docent_ids.json   → web/data/aft_compare/
// (session JSONLs are not served from the site anymore — view via GitHub.)
const aftSrc = join(repoRoot, "aft_compare");
if (existsSync(aftSrc)) {
  const aftDst = join(dataDir, "aft_compare");
  cpSync(join(aftSrc, "reports"), aftDst, { recursive: true });
  for (const name of ["sample.jsonl", "sample_10.jsonl", "docent_ids.json"]) {
    const src = join(aftSrc, name);
    if (existsSync(src)) cpSync(src, join(aftDst, name));
  }
  // Judge-consistency summary (drops at web/data/consistency.json so it can
  // be statically imported by the home page).
  const consistencyJson = join(aftSrc, "consistency.json");
  if (existsSync(consistencyJson)) {
    cpSync(consistencyJson, join(dataDir, "consistency.json"));
  }
  // Previous (iter-11 multi-judge) snapshot, shown in a collapsible panel.
  const consistencyIter11 = join(aftSrc, "consistency.json.iter11-multi");
  if (existsSync(consistencyIter11)) {
    cpSync(consistencyIter11, join(dataDir, "consistency_iter11.json"));
  }
  console.log(`sync-data: AFT audit bundle synced`);
}

// tb-preview AFT reports (claude-opus-4-7 / terminus-2 on terminal-bench
// preview tasks). Mirrors the gpt-5.5-high layout: each bucket lives at
// aft_compare/<bucket>/{reports,sample.jsonl}; we flatten to
// web/data/aft_compare/<bucket>/<task>__<trial>.report.json plus
// web/data/aft_compare/<bucket>/sample.jsonl alongside.
for (const bucket of ["tb-preview"]) {
  const src = join(repoRoot, "aft_compare", bucket);
  if (!existsSync(src)) continue;
  const dst = join(dataDir, "aft_compare", bucket);
  cpSync(join(src, "reports"), dst, { recursive: true });
  const sampleSrc = join(src, "sample.jsonl");
  if (existsSync(sampleSrc)) cpSync(sampleSrc, join(dst, "sample.jsonl"));
  console.log(`sync-data: ${bucket} bundle synced`);
}

const toolChartScript = join(here, "build-tool-action-chart.py");
if (existsSync(toolChartScript)) {
  const py = spawnSync("python3", [toolChartScript], { cwd: webRoot, stdio: "inherit" });
  if (py.status !== 0) {
    console.warn("warning: build-tool-action-chart.py failed");
  } else {
    console.log("sync-data: tool_action_charts.json built");
  }
}

console.log(`sync-data: copied repo data to ${dataDir}`);
console.log(
  "sync-data: if `npm run dev` is already running, restart it — stale .next chunks cause missing-module errors.",
);

const annotationPackScript = join(here, "build-annotation-pack.mjs");
if (existsSync(annotationPackScript)) {
  const node = spawnSync("node", [annotationPackScript], { cwd: webRoot, stdio: "inherit" });
  if (node.status !== 0) {
    console.warn("warning: build-annotation-pack.mjs failed");
  }
}

const tb3PackScript = join(here, "build-tb3-pack.mjs");
if (existsSync(tb3PackScript)) {
  const node = spawnSync("node", [tb3PackScript], { cwd: webRoot, stdio: "inherit" });
  if (node.status !== 0) {
    console.warn("warning: build-tb3-pack.mjs failed");
  }
}

const annotateZipScript = join(here, "build-annotate-zip.mjs");
if (existsSync(annotateZipScript)) {
  const node = spawnSync("node", [annotateZipScript], { cwd: webRoot, stdio: "inherit" });
  if (node.status !== 0) {
    console.warn("warning: build-annotate-zip.mjs failed");
  }
}
