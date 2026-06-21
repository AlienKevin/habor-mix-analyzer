#!/usr/bin/env node
/**
 * Verify workspace seed + replay for a single annotation trial.
 *
 * Usage: node scripts/verify-workspace-seed.mjs trial-32
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTaskFilesystemSnapshot,
  findTaskDir,
  mergeTrajectoryReadSeeds,
} from "./build-task-filesystem.mjs";
import {
  collectTreePaths,
  extractEditSteps,
  inferWorkdir,
  snapshotAtStep,
  trajectoryHasWorkspaceFiles,
} from "../lib/trajectory-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");
const TRIALS_ROOT = join(repoRoot, "harbor-index-trials", "trials_extracted");

const annId = process.argv[2] ?? "trial-32";
const pack = JSON.parse(
  readFileSync(join(repoRoot, "aft_compare", "annotation_pack", "pack.json"), "utf-8"),
);
const trial = pack.trials.find((t) => t.id === annId);
if (!trial) {
  console.error(`Unknown trial id: ${annId}`);
  process.exit(1);
}

const slug = trial.slug;
const outDir = join(webRoot, "public", "annotate", "trials", slug);
const taskDir = findTaskDir(repoRoot, TRIALS_ROOT, trial.task, trial.trial_id);
const trajPath = join(TRIALS_ROOT, trial.task, trial.trial_id, "trajectory.json");
const summaryPath = join(outDir, "trajectory.summary.json");

if (taskDir) {
  buildTaskFilesystemSnapshot(taskDir, outDir);
  const manifestPath = join(outDir, "filesystem.json");
  if (existsSync(trajPath) && existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const readSeeds = mergeTrajectoryReadSeeds(trajPath, join(outDir, "fs"), manifest.tree);
    if (readSeeds.fileCount > 0) {
      manifest.trajectory_read_seeds = readSeeds.fileCount;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    }
  }
}

const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
const manifest = existsSync(join(outDir, "filesystem.json"))
  ? JSON.parse(readFileSync(join(outDir, "filesystem.json"), "utf-8"))
  : null;

/** @type {{ path: string, content?: string }[]} */
const seedFiles = [];
if (manifest) {
  const walk = (nodes) => {
    for (const n of nodes ?? []) {
      if (n.type === "file" && n.url && !n.binary) {
        const abs = join(outDir, n.url);
        if (existsSync(abs)) seedFiles.push({ path: n.path, content: readFileSync(abs, "utf-8") });
      } else if (n.children) walk(n.children);
    }
  };
  walk(manifest.tree);
}

const workdir = inferWorkdir(summary.steps, manifest?.workdir ?? manifest?.primary_root);
const edits = extractEditSteps(summary.steps, workdir);
const last = summary.steps[summary.steps.length - 1]?.index ?? summary.steps.length - 1;
const snap = snapshotAtStep(summary.steps, last, seedFiles, workdir);
const hasFiles = trajectoryHasWorkspaceFiles(summary.steps, seedFiles, workdir);

console.log(`Trial: ${annId} (${slug})`);
if (manifest?.docker_image) {
  console.log(`  docker image: ${manifest.docker_image}`);
  console.log(`  docker extracted: ${manifest.docker_file_count ?? 0} file(s) from ${(manifest.docker_extracted_paths ?? []).join(", ")}`);
}
if (manifest?.trajectory_read_seeds) {
  console.log(`  trajectory read seeds: ${manifest.trajectory_read_seeds}`);
}
console.log(`  workdir: ${workdir}`);
console.log(`  seed files: ${seedFiles.length}`);
console.log(`  edit steps: ${edits.length}`);
console.log(`  replay paths: ${collectTreePaths(snap).length}`);
console.log(`  trajectoryHasWorkspaceFiles: ${hasFiles}`);
if (seedFiles.length) {
  console.log(`  seeded paths: ${seedFiles.map((s) => s.path).join(", ")}`);
}
process.exit(hasFiles ? 0 : 1);
