// LOCAL pre-commit build (NOT part of the Vercel prebuild — the trial sources
// don't exist on Vercel). Run after build_audit_pack.py:
//
//   node web/scripts/build-audit-trajectories.mjs
//
// For each verdict in web/lib/audit_pack.json it emits two normalized
// trajectories under web/public/audit-traj/<rollout_id>/ :
//   agent.json  — the ORIGINAL agent's rollout (from trials_extracted/)
//   judge.json  — the JUDGE's audit trace (composer-2.5, from the run output)
// plus manifest.json mapping rollout_id → which traces are present. The
// /audit/<id>/<which>/ viewer fetches these statically. Committed to the repo.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeTrajectory, trajTimingMeta } from "./summarize-trajectory.mjs";
import { scrubStep, scrub } from "./scrub-secrets.mjs";

// Verifier logs (test_stdout.txt) can be large; the failure usually lands near
// the end, but the setup/command lives at the top — keep both ends if oversized.
const VERIFIER_CAP = 220_000;
function capLog(text) {
  if (text.length <= VERIFIER_CAP) return text;
  const head = text.slice(0, 40_000);
  const tail = text.slice(text.length - 170_000);
  const dropped = text.length - head.length - tail.length;
  return `${head}\n\n… [${dropped.toLocaleString()} bytes truncated] …\n\n${tail}`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = join(__dirname, "..");
const REPO = join(WEB, "..");
const PACK = join(WEB, "lib", "audit_pack.json");
const TRIALS_ROOT = join(REPO, "harbor-index-trials", "trials_extracted");
const JUDGE_OUTS = [
  join(REPO, "bottomup_judge", "tasks", "run20_out"),
  join(REPO, "bottomup_judge", "tasks", "rerun7_out"),
  join(REPO, "bottomup_judge", "tasks", "judge20_fresh_out"),  // composer-2.5 judge traces
  join(REPO, "bottomup_judge", "tasks", "judge_tb3_out"),      // composer-2.5 TB3 judge traces
  join(REPO, "bottomup_judge", "tasks", "judge_formalcrypto_out"), // formal-crypto (replaces broken math-pdf)
  join(REPO, "bottomup_judge", "tasks", "judge3x3_out"),          // 3 hard-core tasks x 3 models (composer/Modal)
  join(REPO, "bottomup_judge", "tasks", "judge_hc47_out"),        // 47 hard-core tasks x 3 models (composer/Daytona)
];
const COMPOSER_PACK = join(WEB, "lib", "composer_audit_pack.json");
const TB3_PACK = join(WEB, "lib", "tb3_audit_pack.json");
// TB3 intervention re-run arms — each trial dir has agent/trajectory.json +
// verifier/test-stdout.txt. These are NOT bottom-up judged (agent.json only),
// surfaced as browsable trials on the merged /tb3/audit page.
const TB3_INTV_ROOTS = ["control", "treatment", "placebo"].map((a) =>
  join(REPO, "bottomup_judge", "tasks", `intervention_tb3_${a}_out`),
);
const OUT = join(WEB, "public", "audit-traj");

const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));
const tryJson = (p) => { try { return readJson(p); } catch { return null; } };

// Walk a judge-run output tree and map rollout_id -> the dir's agent/trajectory.json.
// Each leaf has agent/trajectory.json (the judge's own steps) and
// verifier|artifacts/verdict.json (whose rollout_id field names the rollout).
function indexJudgeTraces() {
  const map = new Map();
  const mtimes = new Map(); // rollout_id -> newest trajectory mtime, so a re-run supersedes
  for (const root of JUDGE_OUTS) {
    if (!existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      const names = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
      if (names.has("agent") && (names.has("verifier") || names.has("artifacts"))) {
        const verdict =
          tryJson(join(dir, "verifier", "verdict.json")) || tryJson(join(dir, "artifacts", "verdict.json"));
        const trajPath = join(dir, "agent", "trajectory.json");
        const rid = verdict?.rollout_id;
        if (rid && existsSync(trajPath)) {
          const mt = statSync(trajPath).mtimeMs;
          if (!mtimes.has(rid) || mt > mtimes.get(rid)) { mtimes.set(rid, mt); map.set(rid, trajPath); }
        }
      }
      for (const e of entries) if (e.isDirectory()) stack.push(join(dir, e.name));
    }
  }
  return map;
}

function emit(rolloutDir, which, trajPath, meta) {
  const traj = readJson(trajPath);
  const steps = summarizeTrajectory(traj).map(scrubStep);
  const timing = trajTimingMeta(traj);
  const model = traj?.agent?.model_name ?? meta.agent_model ?? null;
  const harness = traj?.agent?.name ?? meta.harness ?? null;
  writeFileSync(
    join(rolloutDir, `${which}.json`),
    JSON.stringify(
      {
        meta: {
          rollout_id: meta.rollout_id, task_id: meta.task_id, which,
          label: which === "agent" ? "Original agent rollout" : "Judge audit trace",
          model, harness, n_steps: steps.length, ...timing,
        },
        steps,
      },
      null,
      0,
    ) + "\n",
  );
  return steps.length;
}

function main() {
  if (!existsSync(PACK)) { console.error(`missing ${PACK}`); process.exit(1); }
  const pack = readJson(PACK);
  // Also build traj for the composer-2.5 audit set (its agent rollouts live in
  // trials_extracted, its judge traces in judge20_fresh_out).
  const composerVerdicts = existsSync(COMPOSER_PACK) ? readJson(COMPOSER_PACK).verdicts : [];
  const tb3Verdicts = existsSync(TB3_PACK) ? readJson(TB3_PACK).verdicts : [];
  pack.verdicts = [...pack.verdicts, ...composerVerdicts, ...tb3Verdicts];
  const judgeMap = indexJudgeTraces();
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const manifest = {};
  let nAgent = 0, nJudge = 0, nVerifier = 0, missAgent = [], missJudge = [];
  for (const v of pack.verdicts) {
    const rid = v.rollout_id;
    const rolloutDir = join(OUT, rid);
    mkdirSync(rolloutDir, { recursive: true });
    const has = { agent: false, judge: false, verifier: false };

    const trialDir = join(TRIALS_ROOT, v.task_id, v.trial_id);
    const agentTraj = join(trialDir, "trajectory.json");
    if (existsSync(agentTraj)) {
      emit(rolloutDir, "agent", agentTraj, v); has.agent = true; nAgent++;
    } else missAgent.push(rid);

    // The ORIGINAL task verifier's stdout (pytest / checker output) — the "why it
    // failed" that a bare PASS/FAIL hides. Fetched on demand by the verdict pane.
    const verifierLog = join(trialDir, "test_stdout.txt");
    if (existsSync(verifierLog)) {
      const raw = readFileSync(verifierLog, "utf-8");
      writeFileSync(join(rolloutDir, "verifier.txt"), scrub(capLog(raw)));
      has.verifier = true; nVerifier++;
    }

    const judgeTraj = judgeMap.get(rid);
    if (judgeTraj) {
      emit(rolloutDir, "judge", judgeTraj, v); has.judge = true; nJudge++;
    } else missJudge.push(rid);

    manifest[rid] = has;
  }

  // ---- TB3 intervention re-run trials (agent.json + verifier only, no judge) ----
  let nIntv = 0;
  for (const root of TB3_INTV_ROOTS) {
    if (!existsSync(root)) continue;
    for (const ts of readdirSync(root, { withFileTypes: true })) {
      if (!ts.isDirectory()) continue;
      const tsDir = join(root, ts.name);
      for (const trial of readdirSync(tsDir, { withFileTypes: true })) {
        if (!trial.isDirectory() || !trial.name.includes("__")) continue;
        const trialDir = join(tsDir, trial.name);
        const agentTraj = join(trialDir, "agent", "trajectory.json");
        if (!existsSync(agentTraj)) continue;
        const rid = trial.name; // rollout_id == trial dir basename (matches tb3_trials_pack)
        if (manifest[rid]?.agent) continue; // already emitted (dedupe)
        const taskId = tryJson(join(trialDir, "result.json"))?.task_name?.split("/").pop() ?? trial.name.split("__")[0];
        const rolloutDir = join(OUT, rid);
        mkdirSync(rolloutDir, { recursive: true });
        emit(rolloutDir, "agent", agentTraj, { rollout_id: rid, task_id: taskId, agent_model: "cursor/composer-2.5", harness: "cursor-cli" });
        const has = { agent: true, judge: false, verifier: false };
        const vlog = join(trialDir, "verifier", "test-stdout.txt");
        if (existsSync(vlog)) { writeFileSync(join(rolloutDir, "verifier.txt"), scrub(capLog(readFileSync(vlog, "utf-8")))); has.verifier = true; nVerifier++; }
        manifest[rid] = has; nIntv++; nAgent++;
      }
    }
  }

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 0) + "\n");

  console.log(`audit-traj: ${pack.verdicts.length} verdicts -> agent ${nAgent}, judge ${nJudge}, verifier ${nVerifier} (+${nIntv} tb3 intervention trials)`);
  if (missAgent.length) console.log(`  no agent trajectory (${missAgent.length}): ${missAgent.map((r) => r.split("__")[0]).join(", ")}`);
  if (missJudge.length) console.log(`  no judge trace (${missJudge.length}): ${missJudge.map((r) => r.split("__")[0]).join(", ")}`);
}

main();
