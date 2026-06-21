#!/usr/bin/env node
/** Remove Next.js build cache (fixes missing chunk e.g. ./991.js after HMR / sync-data). */
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] || process.env.NEXT_DIST_DIR || ".next";
const nextDir = resolve(webRoot, target);
const allowedTargets = new Set([".next", ".next-dev"]);

if (!allowedTargets.has(target) || !nextDir.startsWith(resolve(webRoot))) {
  throw new Error(`Refusing to remove unexpected Next.js cache path: ${target}`);
}

if (existsSync(nextDir)) {
  rmSync(nextDir, { recursive: true, force: true });
  console.log(`clean-next: removed ${target}`);
}
