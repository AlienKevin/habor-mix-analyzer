// LOCAL pre-commit build (NOT part of the Vercel prebuild — trials_extracted does
// not exist on Vercel). Run after build-insight-pack.mjs:
//
//   node web/scripts/build-insight-trajectories.mjs
//
// For each of the 100 insight tasks (web/lib/insight_pack.json), emit reference
// trajectories under web/public/insight-traj/<task_id>/ so the /insightfulness
// review page can show "what the agents actually did":
//   manifest.json — { task_id, representative, n_total, trials:[{uuid,model,harness,reward,cost_usd,n_steps,passed}] }
//   rep.json      — { meta, steps }   the REPRESENTATIVE trial at FULL fidelity (default view)
//   all.json      — { trials:[{uuid,meta,steps}] }  EVERY trial at BROWSE fidelity
//                    (reasoning stripped, tool output capped) so the rest are browsable cheaply
// plus a top-level index.json { <task_id>: {representative,n_total} }. Committed to the repo.
//
// insight task_id === trials_extracted/<task_id>/ dir name (verified 1:1 for all 100).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeTrajectory, trajTimingMeta } from "./summarize-trajectory.mjs";
import { scrubStep, scrub } from "./scrub-secrets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = join(__dirname, "..");
const REPO = join(WEB, "..");
const PACK = join(WEB, "lib", "insight_pack.json");
const TRIALS_ROOT = join(REPO, "harbor-index-trials", "trials_extracted");
const OUT = join(WEB, "public", "insight-traj");

// Browse fidelity: the non-default trials are a reference, not the focus — drop the
// (very large) reasoning content and cap tool output hard so all ~18 per task pack
// into one cheap fetch. The representative keeps full fidelity (rep.json).
const BROWSE_OUTPUT_CAP = 1500;

const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));
const tryJson = (p) => { try { return readJson(p); } catch { return null; } };

// Write an emitted bundle, failing the whole build if a secret survived. scrubStep
// only redacts the named free-text fields (text/reasoning/tool args+output); if any
// other field ever carries a secret, scrub() of the whole serialized body would
// change it. This is the regression guard for the class of leak that already
// happened here once (committed trajectories leaking provider keys).
function writeChecked(path, obj, label) {
  const body = JSON.stringify(obj, null, 0) + "\n";
  if (scrub(body) !== body) {
    throw new Error(`SECRET survived scrub in ${label} (${path}) — aborting; an un-scrubbed field leaked a credential.`);
  }
  writeFileSync(path, body);
}

function trialMeta(resultJson, traj, uuid, nSteps) {
  const cfgAgent = resultJson?.config?.agent ?? {};
  const reward = resultJson?.verifier_result?.rewards?.reward ?? null;
  return {
    uuid,
    model: cfgAgent.model_name ?? traj?.agent?.model_name ?? null,
    harness: cfgAgent.name ?? traj?.agent?.name ?? null,
    reward,
    cost_usd: resultJson?.agent_result?.cost_usd ?? null,
    n_steps: nSteps,
    passed: reward != null && reward >= 1,
  };
}

// Strip reasoning + cap tool outputs on an already-summarized+scrubbed step array.
function toBrowse(steps) {
  return steps.map((s) => {
    const { reasoning, ...rest } = s;
    return {
      ...rest,
      tool_calls: (s.tool_calls ?? []).map((tc) => {
        if (typeof tc.output !== "string" || tc.output.length <= BROWSE_OUTPUT_CAP) return tc;
        const prev = tc.output_truncated_bytes ?? 0;
        const head = tc.output.slice(0, BROWSE_OUTPUT_CAP);
        return { ...tc, output: head, output_truncated_bytes: prev + (tc.output.length - head.length) };
      }),
    };
  });
}

function main() {
  if (!existsSync(PACK)) { console.error(`missing ${PACK}`); process.exit(1); }
  if (!existsSync(TRIALS_ROOT)) { console.error(`missing ${TRIALS_ROOT}`); process.exit(1); }
  const pack = readJson(PACK);
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const index = {};
  let nTasks = 0, nTrials = 0, missing = [];

  for (const r of pack.reports) {
    const taskId = r.task_id;
    const taskDir = join(TRIALS_ROOT, taskId);
    if (!existsSync(taskDir)) { missing.push(taskId); continue; }
    const uuids = readdirSync(taskDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    // Summarize every trial once (full), keep meta for selection + manifest.
    const trials = [];
    for (const uuid of uuids) {
      const trajPath = join(taskDir, uuid, "trajectory.json");
      if (!existsSync(trajPath)) continue;
      const traj = tryJson(trajPath);
      if (!traj) continue;
      const fullSteps = summarizeTrajectory(traj).map(scrubStep);
      const timing = trajTimingMeta(traj);
      const meta = { ...trialMeta(tryJson(join(taskDir, uuid, "result.json")), traj, uuid, fullSteps.length), ...timing };
      trials.push({ meta, fullSteps });
      nTrials++;
    }
    if (!trials.length) { missing.push(taskId); continue; }

    // Representative = highest reward, then most steps (most complete run).
    trials.sort((a, b) =>
      (b.meta.reward ?? -1) - (a.meta.reward ?? -1) || (b.meta.n_steps ?? 0) - (a.meta.n_steps ?? 0));
    const rep = trials[0];

    const taskOut = join(OUT, taskId);
    mkdirSync(taskOut, { recursive: true });

    writeChecked(
      join(taskOut, "rep.json"),
      { meta: { task_id: taskId, ...rep.meta }, steps: rep.fullSteps },
      `${taskId}/rep.json`,
    );

    writeChecked(
      join(taskOut, "all.json"),
      { trials: trials.map((t) => ({ uuid: t.meta.uuid, meta: { task_id: taskId, ...t.meta }, steps: toBrowse(t.fullSteps) })) },
      `${taskId}/all.json`,
    );

    writeChecked(
      join(taskOut, "manifest.json"),
      { task_id: taskId, representative: rep.meta.uuid, n_total: trials.length, trials: trials.map((t) => t.meta) },
      `${taskId}/manifest.json`,
    );

    index[taskId] = { representative: rep.meta.uuid, n_total: trials.length };
    nTasks++;
  }

  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 0) + "\n");
  console.log(`insight-traj: ${nTasks} tasks, ${nTrials} trials emitted -> ${OUT}`);
  if (missing.length) console.log(`  no trials for ${missing.length}: ${missing.join(", ")}`);
}

main();
