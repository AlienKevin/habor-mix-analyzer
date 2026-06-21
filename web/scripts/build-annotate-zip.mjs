#!/usr/bin/env node
/**
 * Build a Harbor-format zip of every trial in the annotation pack — task
 * sources, the agent's trajectory, the verifier result, AND every judge
 * audit (composer + gpt + opus, may26 k=5 each) under jobs/<...>/audits/.
 *
 * Layout (per the Harbor upload spec):
 *
 *   harbor-annotate-bundle.zip
 *   └─ <task-name>/
 *      ├─ instruction.md
 *      ├─ task.toml
 *      ├─ environment/Dockerfile  (+ rest of environment/)
 *      ├─ tests/  solution/  README.md   (when present)
 *      └─ jobs/
 *         └─ <task-name>__<trialId>/
 *            ├─ agent/trajectory.json
 *            ├─ config.json                (synthesised: agent.name + .model_name)
 *            ├─ result.json
 *            ├─ verifier/reward.txt        (when result.json has a reward)
 *            ├─ verifier/test-stdout.txt   (when present)
 *            └─ audits/
 *               ├─ composer__r{1..5}.report.json
 *               ├─ gpt__r{1..5}.report.json
 *               └─ opus__r{1..5}.report.json
 *
 * The audits directory is the only Harbor-format extension — the rest of the
 * tree is what Harbor's importer expects.
 *
 * Outputs:
 *   web/public/annotate/harbor-annotate-bundle.zip       — served by Next.js
 *   aft_compare/annotation_pack/harbor-annotate-bundle.zip — committed fallback
 *
 * If AFT_REPORTS_ROOT is missing (Vercel build), the committed fallback is
 * copied into the public dir, matching the build-annotation-pack pattern.
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHaeIndexDir } from "./build-task-filesystem.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");

const SAMPLE = join(repoRoot, "aft_compare", "sample_stratified35.jsonl");
const TRIALS_ROOT = join(repoRoot, "harbor-index-trials", "trials_extracted");
const REPORTS_ROOT = process.env.AFT_REPORTS_ROOT || "/data/aft_reports";

const PUBLIC_ZIP = join(webRoot, "public", "annotate", "harbor-annotate-bundle.zip");
const COMMITTED_ZIP = join(
  repoRoot, "aft_compare", "annotation_pack", "harbor-annotate-bundle.zip",
);
// Extras: one trajectory per distinct (agent, model) per task, beyond the 35
// sample trials. Pre-fetched into EXTRAS_ROOT by
// aft_compare/scripts/fetch_zip_trajectories.py; enumerated by
// EXTRAS_MANIFEST. No audits for these (they were never judged).
const EXTRAS_ROOT = "/data/_annotate_zip_extras";
const EXTRAS_MANIFEST = join(
  repoRoot, "aft_compare", "annotation_pack", "zip_extras_manifest.jsonl",
);

const JUDGE_BUCKETS = [
  ...[1, 2, 3, 4, 5].map((r) => ({ family: "composer", round: r,
    bucket: `cursor-composer-2-5-may26-r${r}` })),
  ...[1, 2, 3, 4, 5].map((r) => ({ family: "gpt", round: r,
    bucket: `gpt-5.5-may26-r${r}` })),
  ...[1, 2, 3, 4, 5].map((r) => ({ family: "opus", round: r,
    bucket: `claude-opus-4-7-may26-r${r}` })),
];

function copyOptional(src, dest, opts = {}) {
  if (!existsSync(src)) return false;
  cpSync(src, dest, opts);
  return true;
}

function fmtMB(p) {
  return (statSync(p).size / (1024 * 1024)).toFixed(1);
}

function main() {
  if (!existsSync(SAMPLE)) {
    console.warn(`build-annotate-zip: missing ${SAMPLE}; skipping`);
    return;
  }
  mkdirSync(dirname(PUBLIC_ZIP), { recursive: true });

  if (!existsSync(REPORTS_ROOT)) {
    if (existsSync(COMMITTED_ZIP)) {
      cpSync(COMMITTED_ZIP, PUBLIC_ZIP);
      console.log(
        `build-annotate-zip: AFT_REPORTS_ROOT missing — restored committed zip (${fmtMB(PUBLIC_ZIP)} MB)`,
      );
      return;
    }
    console.warn(
      `build-annotate-zip: missing ${REPORTS_ROOT} and no committed zip; skipping`,
    );
    return;
  }

  const sample = readFileSync(SAMPLE, "utf-8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));

  const stage = mkdtempSync(join(tmpdir(), "harbor-zip-"));
  const stagedTasks = new Set();
  let nTrials = 0;
  let nAudits = 0;
  let nMissingTaskDir = 0;
  let nMissingTraj = 0;

  for (const row of sample) {
    const { task, trial_id: trialId, harness, model } = row;
    const taskDir = resolveHaeIndexDir(repoRoot, task);
    if (!taskDir) { nMissingTaskDir++; continue; }
    const taskName = taskDir.split("/").pop();
    const trialName = `${taskName}__${trialId}`;

    // 1. task sources (only once per task-name — multiple trials share one task)
    const taskZipDir = join(stage, taskName);
    if (!stagedTasks.has(taskName)) {
      mkdirSync(taskZipDir, { recursive: true });
      for (const f of ["instruction.md", "task.toml", "README.md"]) {
        copyOptional(join(taskDir, f), join(taskZipDir, f));
      }
      for (const d of ["environment", "tests", "solution"]) {
        copyOptional(join(taskDir, d), join(taskZipDir, d), { recursive: true });
      }
      stagedTasks.add(taskName);
    }

    // 2. trial-level files under jobs/<task>__<trialId>/
    const jobDir = join(taskZipDir, "jobs", trialName);
    mkdirSync(jobDir, { recursive: true });

    const trialSrc = join(TRIALS_ROOT, task, trialId);

    // agent/trajectory.json
    const trajSrc = join(trialSrc, "trajectory.json");
    if (existsSync(trajSrc)) {
      mkdirSync(join(jobDir, "agent"), { recursive: true });
      cpSync(trajSrc, join(jobDir, "agent", "trajectory.json"));
    } else {
      nMissingTraj++;
    }

    // result.json (passes through)
    let resultObj = null;
    const resultSrc = join(trialSrc, "result.json");
    if (existsSync(resultSrc)) {
      cpSync(resultSrc, join(jobDir, "result.json"));
      try { resultObj = JSON.parse(readFileSync(resultSrc, "utf-8")); } catch { /* ignore */ }
    }

    // config.json (synthesised — Harbor importer reads agent.name + .model_name)
    const cfg = {
      agent: {
        name: harness ?? resultObj?.agent_info?.name ?? null,
        model_name: model ?? resultObj?.agent_info?.model_info?.name ?? null,
      },
    };
    writeFileSync(join(jobDir, "config.json"), JSON.stringify(cfg, null, 2));

    // verifier/reward.txt + test-stdout.txt
    const verifierDir = join(jobDir, "verifier");
    mkdirSync(verifierDir, { recursive: true });
    const reward =
      resultObj?.verifier_result?.rewards?.reward ??
      resultObj?.reward ??
      null;
    if (reward !== null && reward !== undefined) {
      writeFileSync(join(verifierDir, "reward.txt"), String(reward));
    }
    copyOptional(
      join(trialSrc, "test_stdout.txt"),
      join(verifierDir, "test-stdout.txt"),
    );

    // 3. audits — composer + gpt + opus, k=5 each. May be partial (e.g. opus
    // refusal on the cybergym trial); each file is copied if present.
    const auditsDir = join(jobDir, "audits");
    mkdirSync(auditsDir, { recursive: true });
    for (const { family, round, bucket } of JUDGE_BUCKETS) {
      const src = join(REPORTS_ROOT, bucket, `${task}__${trialId}.report.json`);
      if (existsSync(src)) {
        cpSync(src, join(auditsDir, `${family}__r${round}.report.json`));
        nAudits++;
      }
    }

    nTrials++;
  }

  // 3.5. Extras — one trial per distinct (agent, model) per task that wasn't
  // already in the sample. No audits. Each extra was pre-staged at
  // EXTRAS_ROOT/<task>/<trial_id>/{trajectory.json,result.json,test_stdout.txt}
  // by the Python fetcher. Trials whose tarball lacked a trajectory are
  // listed in the manifest but skipped here.
  let nExtras = 0;
  let nExtrasNoTraj = 0;
  if (existsSync(EXTRAS_MANIFEST) && existsSync(EXTRAS_ROOT)) {
    const extras = readFileSync(EXTRAS_MANIFEST, "utf-8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l));
    for (const e of extras) {
      const { task, trial_id: trialId, agent, model } = e;
      const taskDir = resolveHaeIndexDir(repoRoot, task);
      if (!taskDir) continue;
      const taskName = taskDir.split("/").pop();
      const trialName = `${taskName}__${trialId}`;
      const extraSrc = join(EXTRAS_ROOT, task, trialId);
      const trajSrc = join(extraSrc, "trajectory.json");
      if (!existsSync(trajSrc)) { nExtrasNoTraj++; continue; }

      const taskZipDir = join(stage, taskName);
      // sample loop should have already staged this task's sources, but defend
      // in case a task only has extras (no sample row) for some reason
      if (!stagedTasks.has(taskName)) {
        mkdirSync(taskZipDir, { recursive: true });
        for (const f of ["instruction.md", "task.toml", "README.md"]) {
          copyOptional(join(taskDir, f), join(taskZipDir, f));
        }
        for (const d of ["environment", "tests", "solution"]) {
          copyOptional(join(taskDir, d), join(taskZipDir, d), { recursive: true });
        }
        stagedTasks.add(taskName);
      }

      const jobDir = join(taskZipDir, "jobs", trialName);
      mkdirSync(jobDir, { recursive: true });
      mkdirSync(join(jobDir, "agent"), { recursive: true });
      cpSync(trajSrc, join(jobDir, "agent", "trajectory.json"));

      let resultObj = null;
      const resultSrc = join(extraSrc, "result.json");
      if (existsSync(resultSrc)) {
        cpSync(resultSrc, join(jobDir, "result.json"));
        try { resultObj = JSON.parse(readFileSync(resultSrc, "utf-8")); } catch { /* ignore */ }
      }

      const cfg = {
        agent: {
          name: agent ?? resultObj?.agent_info?.name ?? null,
          model_name: model ?? resultObj?.agent_info?.model_info?.name ?? null,
        },
      };
      writeFileSync(join(jobDir, "config.json"), JSON.stringify(cfg, null, 2));

      const verifierDir = join(jobDir, "verifier");
      mkdirSync(verifierDir, { recursive: true });
      const reward =
        resultObj?.verifier_result?.rewards?.reward ??
        resultObj?.reward ?? null;
      if (reward !== null && reward !== undefined) {
        writeFileSync(join(verifierDir, "reward.txt"), String(reward));
      }
      copyOptional(join(extraSrc, "test_stdout.txt"), join(verifierDir, "test-stdout.txt"));
      nExtras++;
    }
  }

  // 4. zip the staging dir
  if (existsSync(PUBLIC_ZIP)) rmSync(PUBLIC_ZIP);
  execSync(`cd "${stage}" && zip -qr "${PUBLIC_ZIP}" .`);

  mkdirSync(dirname(COMMITTED_ZIP), { recursive: true });
  cpSync(PUBLIC_ZIP, COMMITTED_ZIP);

  rmSync(stage, { recursive: true });

  const warn = [];
  if (nMissingTaskDir) warn.push(`${nMissingTaskDir} trials skipped (no task dir)`);
  if (nMissingTraj) warn.push(`${nMissingTraj} trajectory.json missing`);
  if (nExtrasNoTraj) warn.push(`${nExtrasNoTraj} extras skipped (no trajectory)`);
  console.log(
    `build-annotate-zip: ${nTrials} judged + ${nExtras} extras = ${nTrials + nExtras} trials, ` +
    `${stagedTasks.size} task dirs, ${nAudits} audits → ` +
    `${fmtMB(PUBLIC_ZIP)} MB${warn.length ? ` (warnings: ${warn.join("; ")})` : ""}`,
  );
}

main();
