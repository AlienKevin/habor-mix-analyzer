#!/usr/bin/env node
// Upload all trajectory files from public/audit-traj/ to Vercel Blob.
// Outputs public/audit-traj-blob-manifest.json mapping rollout_id → { agent, judge, verifier } → blob URL.
// Run once (or after new trajectories are added). After this, gitignore the heavy trajectory files.

import { put } from "@vercel/blob";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const TRAJ_DIR = join(process.cwd(), "public", "audit-traj");
const MANIFEST_OUT = join(process.cwd(), "public", "audit-traj-blob-manifest.json");

async function uploadFile(filepath, pathname) {
  const data = readFileSync(filepath);
  const ext = filepath.endsWith(".txt") ? "text/plain" : "application/json";
  const blob = await put(pathname, data, {
    access: "public",
    contentType: ext,
    addRandomSuffix: false,
    storeId: process.env.HARBOR_STORE_ID,
  });
  return blob.url;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN not set");
    process.exit(1);
  }
  if (!process.env.HARBOR_STORE_ID) {
    console.error("HARBOR_STORE_ID not set");
    process.exit(1);
  }

  const existing = {};
  if (existsSync(MANIFEST_OUT)) {
    try { Object.assign(existing, JSON.parse(readFileSync(MANIFEST_OUT, "utf-8"))); } catch {}
  }
  const manifest = { ...existing };

  const dirs = readdirSync(TRAJ_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== "manifest.json")
    .map(d => d.name);

  let uploaded = 0, skipped = 0;
  for (const rid of dirs) {
    const dir = join(TRAJ_DIR, rid);
    if (!manifest[rid]) manifest[rid] = {};

    for (const which of ["agent.json", "judge.json", "verifier.txt"]) {
      const fp = join(dir, which);
      if (!existsSync(fp)) continue;

      const key = which.replace(".json", "").replace(".txt", "");
      if (manifest[rid][key]) { skipped++; continue; }

      const pathname = `audit-traj/${rid}/${which}`;
      try {
        const url = await uploadFile(fp, pathname);
        manifest[rid][key] = url;
        uploaded++;
        if (uploaded % 50 === 0) console.log(`  uploaded ${uploaded}...`);
      } catch (e) {
        console.error(`  failed ${pathname}: ${e.message}`);
      }
    }
  }

  writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`done: ${uploaded} uploaded, ${skipped} skipped, ${Object.keys(manifest).length} rollouts`);
  console.log(`manifest -> ${MANIFEST_OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
