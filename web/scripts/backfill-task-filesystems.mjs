#!/usr/bin/env node
/**
 * Backfill COPY-based task filesystem snapshots for all annotation-pack trials.
 *
 * Usage: node scripts/backfill-task-filesystems.mjs
 *
 * Env:
 *   HARBOR_BACKFILL_CONCURRENCY — parallel trial workers (default 6)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTaskFilesystemSnapshot, findTaskDir, mergeTrajectoryReadSeeds } from "./build-task-filesystem.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..");

const SAMPLE = join(repoRoot, "aft_compare", "sample_stratified35.jsonl");
const TRIALS_ROOT = join(repoRoot, "harbor-index-trials", "trials_extracted");
const publicTrials = join(webRoot, "public", "annotate", "trials");
const committedTrials = join(repoRoot, "aft_compare", "annotation_public", "trials");
const CONCURRENCY = Math.max(1, Number(process.env.HARBOR_BACKFILL_CONCURRENCY) || 6);

function slug(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

function formatSummaryLine(s) {
  const warn = s.warnings?.length ? ` (${s.warnings.length} warning(s))` : "";
  const docker = s.dockerExtracted ? `, docker=${s.dockerExtracted}` : "";
  const bench = (s.benchmark ?? "?").padEnd(16);
  return `  ${s.annId}  ${bench}  ${String(s.fileCount).padStart(6)} file(s)${docker}${warn}${s.reason ? ` — ${s.reason}` : ""}`;
}

function printSummaryTable(summary) {
  const header = ["trial", "benchmark", "files", "docker", "notes"];
  const rows = summary.map((s) => {
    const notes = s.reason
      ? s.reason
      : s.dockerExtracted
        ? "docker base image"
        : s.warnings?.length
          ? `${s.warnings.length} warning(s)`
          : "copy/trajectory";
    return [
      s.annId,
      s.benchmark ?? "?",
      String(s.fileCount),
      s.dockerExtracted ? String(s.dockerExtracted) : "—",
      notes,
    ];
  });
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log("\n" + fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(fmt(row));
}

function processTrial(row, i) {
  const annId = `trial-${String(i + 1).padStart(2, "0")}`;
  const benchmark = row.benchmark ?? "?";
  const trialSlug = slug(`${row.task}__${row.trial_id}`);
  const outDir = join(publicTrials, trialSlug);
  const committedDir = join(committedTrials, trialSlug);

  try {
    mkdirSync(outDir, { recursive: true });
    mkdirSync(committedDir, { recursive: true });

    const taskDir = findTaskDir(repoRoot, TRIALS_ROOT, row.task, row.trial_id);
    if (!taskDir) {
      return { annId, benchmark, trialSlug, available: false, fileCount: 0, reason: "no task dir" };
    }

    const result = buildTaskFilesystemSnapshot(taskDir, outDir);
    const trajPath = join(TRIALS_ROOT, row.task, row.trial_id, "trajectory.json");
    const manifestPath = join(outDir, "filesystem.json");
    if (result.available && existsSync(trajPath) && existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const readSeeds = mergeTrajectoryReadSeeds(trajPath, join(outDir, "fs"), manifest.tree);
      if (readSeeds.fileCount > 0) {
        manifest.generated_at = new Date().toISOString();
        manifest.trajectory_read_seeds = readSeeds.fileCount;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      }
    }
    if (existsSync(join(outDir, "filesystem.json"))) {
      cpSync(join(outDir, "filesystem.json"), join(committedDir, "filesystem.json"));
      const fsDir = join(outDir, "fs");
      if (existsSync(fsDir)) {
        cpSync(fsDir, join(committedDir, "fs"), { recursive: true });
      }
    }

    return {
      annId,
      benchmark,
      trialSlug,
      available: result.available,
      fileCount: result.fileCount ?? 0,
      dockerExtracted: result.dockerExtracted ?? 0,
      warnings: result.warnings ?? [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return { annId, benchmark, trialSlug, available: false, fileCount: 0, reason: msg, warnings: [] };
  }
}

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await Promise.resolve().then(() => fn(items[i], i));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const started = Date.now();
  const sample = readFileSync(SAMPLE, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  console.log(`backfill-task-filesystems: ${sample.length} trials, concurrency=${CONCURRENCY}`);

  const summary = await runWithConcurrency(sample, CONCURRENCY, (row, i) => {
    const result = processTrial(row, i);
    console.log(formatSummaryLine(result));
    return result;
  });

  for (const packPath of [
    join(webRoot, "data", "annotate", "pack.json"),
    join(repoRoot, "aft_compare", "annotation_pack", "pack.json"),
  ]) {
    if (!existsSync(packPath)) continue;
    const pack = JSON.parse(readFileSync(packPath, "utf-8"));
    for (const s of summary) {
      const trial = pack.trials.find((t) => t.id === s.annId);
      if (trial) trial.presentation.filesystem_available = s.available;
    }
    writeFileSync(packPath, JSON.stringify(pack, null, 2) + "\n");
  }

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  const dockerTrials = summary.filter((s) => s.dockerExtracted > 0).length;
  const failed = summary.filter((s) => s.reason && !s.available);
  console.log(
    `backfill-task-filesystems: done in ${elapsedSec}s — ${summary.length} trials, ${dockerTrials} docker-extracted, ${failed.length} failed`,
  );
  printSummaryTable(summary);
}

main();
