#!/usr/bin/env node
/**
 * Build an agent-visible filesystem snapshot from a Harbor task's environment/Dockerfile.
 * Copies text files into public trial artifacts and writes filesystem.json.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix } from "node:path";
import { scrub } from "./scrub-secrets.mjs";

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".jsonl",
  ".py",
  ".sh",
  ".bash",
  ".csv",
  ".tsv",
  ".yaml",
  ".yml",
  ".toml",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".sql",
  ".html",
  ".css",
  ".xml",
  ".ini",
  ".cfg",
  ".conf",
  ".fasta",
  ".fa",
  ".r",
  ".R",
  ".ipynb",
  ".dockerfile",
  ".gitignore",
  ".env.example",
]);

const MAX_TEXT_BYTES = 256 * 1024;
const AGENT_ROOTS = ["/workspace", "/app", "/testbed"];

function isProbablyText(filePath, size) {
  if (size > MAX_TEXT_BYTES) return false;
  const ext = posix.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  const base = basename(filePath).toLowerCase();
  if (base === "dockerfile" || base === "makefile" || base.startsWith("readme")) return true;
  return false;
}

function normalizeContainerPath(raw, workdir) {
  let p = String(raw ?? "").trim();
  if (!p || p === ".") return workdir;
  if (!p.startsWith("/")) return posix.join(workdir, p);
  return posix.normalize(p);
}

function parseDockerfile(content) {
  /** @type {{ workdir: string, copies: { srcs: string[], dest: string }[], mkdirs: Set<string>, hasCapsuleDownload: boolean, hasRemoteDownload: boolean, hasGitClone: boolean, baseImages: string[] }} */
  const merged = {
    workdir: "/",
    copies: [],
    mkdirs: new Set(),
    hasCapsuleDownload: false,
    hasRemoteDownload: false,
    hasGitClone: false,
    baseImages: [],
    /** `ln -sf <target> <link>` symlinks the agent works through, e.g.
     *  /workspace/pandas-dev__pandas → /testbed (harbor adapters expose the
     *  base image's repo under a clean /workspace/<name> path). */
    symlinks: [],
  };

  const stages = content.split(/^FROM\s+/im);
  const stageBodies = stages.length > 1 ? stages.slice(1) : [content];

  for (const stageBody of stageBodies) {
    const stageLines = stageBody.split("\n");
    const baseRef = stageLines[0]?.trim().split(/\s+/)[0];
    if (baseRef) merged.baseImages.push(baseRef);

    let workdir = "/";
    for (const rawLine of stageLines.slice(1)) {
      const line = rawLine.split("#")[0].trim();
      if (!line) continue;

      const workdirMatch = line.match(/^WORKDIR\s+(.+)$/i);
      if (workdirMatch) {
        workdir = normalizeContainerPath(workdirMatch[1], workdir);
        merged.workdir = workdir;
        continue;
      }

      const copyMatch = line.match(/^(?:COPY|ADD)\s+(.+)$/i);
      if (copyMatch) {
        const tokens = copyMatch[1]
          .split(/\s+/)
          .map((t) => t.replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        if (tokens.length >= 2) {
          const dest = tokens[tokens.length - 1];
          const srcs = tokens.slice(0, -1);
          merged.copies.push({
            srcs,
            dest: normalizeContainerPath(dest, workdir),
          });
        }
        continue;
      }

      // `ln -s[f] <target> <link>` — capture symlinks whose link is the agent's
      // /workspace/<name> path so the viewer can show the alias for the real root.
      const lnMatch = line.match(/\bln\s+-s[a-z]*\s+(\S+)\s+(\S+)/i);
      if (lnMatch) {
        const strip = (s) => s.replace(/[;\\&|]+$/, "");
        const target = strip(lnMatch[1]);
        const link = strip(lnMatch[2]);
        if (link.startsWith("/workspace") && target.startsWith("/")) {
          merged.symlinks.push({ link, target });
        }
      }

      const mkdirMatch = line.match(/^RUN\s+.*mkdir\s+(?:-p\s+)?(.+)$/i);
      if (mkdirMatch) {
        for (const part of mkdirMatch[1].split(/\s+/)) {
          const cleaned = part.replace(/&&.*$/, "").replace(/\\/g, "");
          if (cleaned.startsWith("/")) merged.mkdirs.add(posix.normalize(cleaned));
        }
      }

      if (/download_capsule\.py/i.test(line)) merged.hasCapsuleDownload = true;
      if (/\bgit\s+clone\b/i.test(line)) merged.hasGitClone = true;
      if (/\b(wget|curl)\b/i.test(line) && /https?:\/\//i.test(line)) merged.hasRemoteDownload = true;
    }
  }

  return merged;
}

function listFilesRecursive(rootDir, rel = "") {
  const abs = join(rootDir, rel);
  if (!existsSync(abs)) return [];
  const st = statSync(abs);
  if (st.isFile()) return [rel.replace(/\\/g, "/")];
  const out = [];
  for (const name of readdirSync(abs)) {
    if (name === ".git") continue;
    out.push(...listFilesRecursive(rootDir, rel ? `${rel}/${name}` : name));
  }
  return out;
}

function ensureDir(tree, absPath) {
  const parts = absPath.split("/").filter(Boolean);
  let nodes = tree;
  let built = "";
  for (const part of parts) {
    built += `/${part}`;
    let node = nodes.find((n) => n.name === part && n.type === "dir");
    if (!node) {
      node = { name: part, path: built, type: "dir", children: [] };
      nodes.push(node);
    }
    nodes = node.children ?? (node.children = []);
  }
}

function addFile(tree, absPath, meta) {
  const parts = absPath.split("/").filter(Boolean);
  const fileName = parts.pop();
  let nodes = tree;
  let built = "";
  for (const part of parts) {
    built += `/${part}`;
    let node = nodes.find((n) => n.name === part && n.type === "dir");
    if (!node) {
      node = { name: part, path: built, type: "dir", children: [] };
      nodes.push(node);
    }
    nodes = node.children ?? (node.children = []);
  }
  const existing = nodes.find((n) => n.name === fileName && n.type === "file");
  if (existing) {
    Object.assign(existing, meta, { path: absPath, type: "file", name: fileName });
    return;
  }
  nodes.push({
    name: fileName,
    path: absPath,
    type: "file",
    ...meta,
  });
}

function treeHasFile(tree, absPath) {
  const parts = absPath.split("/").filter(Boolean);
  const fileName = parts.pop();
  let nodes = tree;
  for (const part of parts) {
    const node = nodes.find((n) => n.name === part && n.type === "dir");
    if (!node?.children) return false;
    nodes = node.children;
  }
  return nodes.some((n) => n.name === fileName && n.type === "file");
}

function countAgentRootFiles(tree) {
  let count = 0;
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === "file" && isAgentVisiblePath(node.path)) count += 1;
      else if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return count;
}

function isDockerAvailable() {
  if (process.env.HARBOR_SKIP_DOCKER === "1") return false;
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

function dockerPathExists(imageRef, containerPath) {
  const r = spawnSync(
    "docker",
    ["run", "--rm", "--entrypoint", "test", imageRef, "-e", containerPath],
    { stdio: "ignore", timeout: 120_000 },
  );
  return r.status === 0;
}

function collectDockerExtractPaths(parsed) {
  /** @type {Set<string>} */
  const paths = new Set();
  for (const root of AGENT_ROOTS) paths.add(root);
  if (parsed.workdir && isAgentVisiblePath(parsed.workdir)) paths.add(parsed.workdir);
  for (const dir of parsed.mkdirs) {
    if (isAgentVisiblePath(dir)) paths.add(dir);
  }
  return [...paths].sort();
}

/**
 * Pull a Docker image and copy agent-visible paths into the snapshot tree.
 *
 * @param {string} imageRef
 * @param {string[]} containerPaths
 * @param {string} fsOut
 * @param {Array<{ name: string, path: string, type: string, size?: number, binary?: boolean, url?: string, children?: unknown[] }>} tree
 * @param {string[]} warnings
 */
function extractFromDockerImage(imageRef, containerPaths, fsOut, tree, warnings) {
  if (!imageRef || imageRef === "scratch") {
    return { fileCount: 0, paths: [], image: imageRef };
  }

  try {
    execFileSync("docker", ["pull", imageRef], { stdio: "pipe", timeout: 600_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    warnings.push(`Docker pull failed for ${imageRef}: ${msg}`);
    return { fileCount: 0, paths: [], image: imageRef };
  }

  let cid;
  try {
    cid = execFileSync("docker", ["create", imageRef], { encoding: "utf-8", timeout: 120_000 }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    warnings.push(`Docker create failed for ${imageRef}: ${msg}`);
    return { fileCount: 0, paths: [], image: imageRef };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "harbor-docker-fs-"));
  const extractedPaths = [];
  const beforeCount = countFiles(tree);

  try {
    for (const containerPath of containerPaths) {
      if (!dockerPathExists(imageRef, containerPath)) continue;

      const localName = containerPath.replace(/^\//, "").replace(/\//g, "__") || "root";
      const localDest = join(tmpDir, localName);

      try {
        execFileSync("docker", ["cp", `${cid}:${containerPath}`, localDest], {
          stdio: "pipe",
          timeout: 600_000,
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
        warnings.push(`Docker cp failed for ${containerPath}: ${msg}`);
        continue;
      }

      if (!existsSync(localDest)) continue;
      ingestFilesIntoTree(localDest, containerPath, fsOut, tree);
      extractedPaths.push(containerPath);
    }
  } finally {
    try {
      execFileSync("docker", ["rm", "-f", cid], { stdio: "ignore", timeout: 60_000 });
    } catch {
      /* ignore */
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }

  sortTree(tree);
  return {
    fileCount: countFiles(tree) - beforeCount,
    paths: extractedPaths,
    image: imageRef,
  };
}

function sortTree(nodes) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) {
    if (n.children) sortTree(n.children);
  }
}

function ingestFilesIntoTree(srcAbs, destBasePath, fsOut, tree) {
  const srcStat = statSync(srcAbs);
  const files = srcStat.isDirectory() ? listFilesRecursive(srcAbs) : [""];

  for (const relFile of files) {
    const srcFile = srcStat.isDirectory() ? join(srcAbs, relFile) : srcAbs;
    let destPath;
    if (srcStat.isDirectory()) {
      destPath = relFile ? posix.join(destBasePath, relFile) : destBasePath;
    } else {
      destPath = posix.join(destBasePath, basename(srcAbs));
    }
    destPath = posix.normalize(destPath);

    const size = statSync(srcFile).size;
    const relOut = destPath.replace(/^\//, "");
    const text = isProbablyText(destPath, size);
    if (text) {
      // Only text files are referenced via the tree's `url` (the workspace
      // panel previews them). Binary/oversize files (Dockerfile data
      // tarballs, large CSV fixtures, etc.) live as metadata-only entries —
      // no point copying their bytes into fs/.
      const outFile = join(fsOut, relOut);
      mkdirSync(dirname(outFile), { recursive: true });
      cpSync(srcFile, outFile);
    }
    addFile(tree, destPath, {
      size,
      binary: !text,
      url: text ? `fs/${relOut}` : undefined,
    });
  }
}

/** Harbor task definition paths shown under virtual /task/ (instruction.md excluded — shown above). */
const TASK_DEFINITION_PATHS = ["task.toml", "tests", "environment"];

function addTaskDefinitionTree(taskDir, fsOut, tree, warnings) {
  ensureDir(tree, "/task");

  for (const rel of TASK_DEFINITION_PATHS) {
    const srcAbs = join(taskDir, rel);
    if (!existsSync(srcAbs)) {
      warnings.push(`Missing task definition: ${rel}`);
      continue;
    }
    const destBase = rel === "task.toml" ? "/task" : `/task/${rel}`;
    ingestFilesIntoTree(srcAbs, destBase, fsOut, tree);
  }
}

function isAgentVisiblePath(path) {
  if (path.startsWith("/tests") || path.startsWith("/oracle") || path.startsWith("/logs")) return false;
  if (AGENT_ROOTS.some((r) => path === r || path.startsWith(`${r}/`))) return true;
  if (path.startsWith("/root/")) return true;
  return false;
}

/**
 * @param {string} taskDir absolute path to task root (contains environment/)
 * @param {string} outDir absolute path to trial public dir
 */
export function buildTaskFilesystemSnapshot(taskDir, outDir) {
  const envDir = join(taskDir, "environment");
  const dockerfilePath = join(envDir, "Dockerfile");
  if (!existsSync(dockerfilePath)) {
    return { available: false, reason: "no Dockerfile" };
  }

  const dockerfile = readFileSync(dockerfilePath, "utf-8");
  const parsed = parseDockerfile(dockerfile);
  const fsOut = join(outDir, "fs");
  if (existsSync(fsOut)) rmSync(fsOut, { recursive: true, force: true });
  mkdirSync(fsOut, { recursive: true });

  /** @type {Array<{ name: string, path: string, type: string, size?: number, binary?: boolean, url?: string, children?: unknown[] }>} */
  const tree = [];
  /** @type {string[]} */
  const warnings = [];

  for (const copy of parsed.copies) {
    const destLooksLikeDir =
      copy.dest.endsWith("/") || copy.srcs.length > 1 || !posix.extname(posix.basename(copy.dest));
    for (const src of copy.srcs) {
      const srcAbs = join(envDir, src);
      if (!existsSync(srcAbs)) {
        warnings.push(`Missing COPY source: ${src}`);
        continue;
      }
      const srcStat = statSync(srcAbs);
      const files = srcStat.isDirectory() ? listFilesRecursive(srcAbs) : [""];

      for (const relFile of files) {
        const srcFile = srcStat.isDirectory() ? join(srcAbs, relFile) : srcAbs;
        let destPath;
        const destBase = copy.dest.replace(/\/$/, "");
        if (srcStat.isDirectory()) {
          destPath = relFile ? posix.join(destBase, relFile) : destBase;
        } else if (destLooksLikeDir) {
          destPath = posix.join(destBase, basename(src));
        } else {
          destPath = copy.dest;
        }
        destPath = posix.normalize(destPath);

        if (!isAgentVisiblePath(destPath)) continue;

        const size = statSync(srcFile).size;
        const relOut = destPath.replace(/^\//, "");
        const text = isProbablyText(destPath, size);
        if (text) {
          const outFile = join(fsOut, relOut);
          mkdirSync(dirname(outFile), { recursive: true });
          cpSync(srcFile, outFile);
        }
        addFile(tree, destPath, {
          size,
          binary: !text,
          url: text ? `fs/${relOut}` : undefined,
        });
      }
    }
  }

  for (const dir of parsed.mkdirs) {
    if (!isAgentVisiblePath(dir)) continue;
    ensureDir(tree, dir);
  }

  if (isAgentVisiblePath(parsed.workdir)) {
    ensureDir(tree, parsed.workdir);
  }

  if (parsed.hasCapsuleDownload) {
    warnings.push(
      "Dockerfile downloads task data at image build time (e.g. HuggingFace capsule); only static COPY sources are included here.",
    );
  }

  const agentCopyCount = parsed.copies.filter((copy) => isAgentVisiblePath(copy.dest)).length;
  let dockerExtract = null;
  if (isDockerAvailable() && countAgentRootFiles(tree) === 0 && parsed.baseImages.length > 0) {
    dockerExtract = extractFromDockerImage(
      parsed.baseImages[0],
      collectDockerExtractPaths(parsed),
      fsOut,
      tree,
      warnings,
    );
    if (dockerExtract.fileCount > 0) {
      warnings.push(
        `Extracted ${dockerExtract.fileCount} file(s) from Docker image ${dockerExtract.image} (${dockerExtract.paths.join(", ") || "no paths"}).`,
      );
    }
  }

  if (agentCopyCount === 0 && parsed.baseImages.length > 0 && !dockerExtract?.fileCount) {
    if (!isDockerAvailable()) {
      warnings.push(
        `No local COPY sources for agent roots; /testbed or /workspace likely comes from base image (${parsed.baseImages[0]}). Docker unavailable — trajectory Read snapshots may be included when available.`,
      );
    } else {
      warnings.push(
        `No local COPY sources for agent roots; base image ${parsed.baseImages[0]} could not be extracted. Trajectory Read snapshots may be included when available.`,
      );
    }
  }
  if (parsed.hasGitClone) {
    warnings.push("Dockerfile clones a repository at build time; cloned tree is not available locally.");
  }
  if (parsed.hasRemoteDownload) {
    warnings.push("Dockerfile downloads remote files (wget/curl); downloaded content is not included here.");
  }

  addTaskDefinitionTree(taskDir, fsOut, tree, warnings);

  sortTree(tree);

  const primaryRoot =
    AGENT_ROOTS.find((r) => tree.some((n) => n.path === r)) ??
    tree.find((n) => n.path === "/task")?.path ??
    (tree[0]?.path ?? parsed.workdir);

  const manifest = {
    generated_at: new Date().toISOString(),
    source_task: taskDir,
    dockerfile: "environment/Dockerfile",
    workdir: parsed.workdir,
    primary_root: primaryRoot,
    note:
      "Agent-visible files from environment/Dockerfile COPY/ADD, Docker base-image extraction when available, plus Harbor task definition under /task/ (task.toml, tests/, environment/). instruction.md is shown above; solution/ and runtime verifier mounts are excluded.",
    warnings,
    tree,
  };

  if (parsed.symlinks?.length) {
    manifest.workspace_aliases = parsed.symlinks;
  }

  if (dockerExtract?.fileCount) {
    manifest.docker_image = dockerExtract.image;
    manifest.docker_extracted_paths = dockerExtract.paths;
    manifest.docker_file_count = dockerExtract.fileCount;
  }

  writeFileSync(join(outDir, "filesystem.json"), JSON.stringify(manifest, null, 2) + "\n");
  return {
    available: true,
    fileCount: countFiles(tree),
    warnings,
    dockerExtracted: dockerExtract?.fileCount ?? 0,
  };
}

function stripLineNumberPrefixes(text) {
  return String(text)
    .split("\n")
    .map((line) => {
      const m = line.match(/^\d+\t(.*)$/);
      return m ? m[1] : line;
    })
    .join("\n");
}

function extractReadSnapshotsFromStep(step) {
  /** @type {{ path: string, content: string }[]} */
  const out = [];
  const candidates = [
    step.extra?.tool_result_metadata?.tool_use_result?.file,
    step.extra?.metadata?.tool_use_result?.file,
    step.observation?.results?.[0]?.file,
  ];

  for (const file of candidates) {
    if (!file || typeof file.filePath !== "string" || typeof file.content !== "string") continue;
    out.push({ path: file.filePath, content: file.content });
  }

  if (out.length > 0) return out;

  const obsContent = step.observation?.results?.[0]?.content;
  const args = step.tool_calls?.[0]?.arguments ?? step.extra?.raw_arguments;
  const filePath = args?.file_path ?? args?.path;
  if (typeof obsContent === "string" && typeof filePath === "string") {
    out.push({ path: filePath, content: stripLineNumberPrefixes(obsContent) });
  }

  return out;
}

/**
 * Merge Read-tool file snapshots from a full trajectory into the filesystem tree.
 * Helps base-image tasks (SWE-bench/SWT-bench) where /testbed is not COPY'd locally.
 *
 * @param {string} trajPath
 * @param {string} fsOut
 * @param {Array<{ name: string, path: string, type: string, size?: number, binary?: boolean, url?: string, children?: unknown[] }>} tree
 */
export function mergeTrajectoryReadSeeds(trajPath, fsOut, tree) {
  if (!existsSync(trajPath)) return { fileCount: 0 };

  let traj;
  try {
    traj = JSON.parse(readFileSync(trajPath, "utf-8"));
  } catch {
    return { fileCount: 0 };
  }

  /** @type {Map<string, string>} */
  const latestByPath = new Map();

  for (const step of traj.steps ?? []) {
    const fn = step.tool_calls?.[0]?.function_name ?? step.extra?.tool_use_name;
    if (fn !== "Read") continue;
    for (const snap of extractReadSnapshotsFromStep(step)) {
      if (!isAgentVisiblePath(snap.path)) continue;
      if (!isProbablyText(snap.path, Buffer.byteLength(snap.content, "utf-8"))) continue;
      latestByPath.set(snap.path, snap.content);
    }
  }

  let added = 0;
  for (const [destPath, content] of latestByPath) {
    if (treeHasFile(tree, destPath)) continue;
    const relOut = destPath.replace(/^\//, "");
    const outFile = join(fsOut, relOut);
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, scrub(content), "utf-8");

    addFile(tree, destPath, {
      size: Buffer.byteLength(content, "utf-8"),
      binary: false,
      url: `fs/${relOut}`,
    });
    added += 1;
  }

  if (added > 0) sortTree(tree);
  return { fileCount: added };
}

function countFiles(nodes) {
  let n = 0;
  for (const node of nodes) {
    if (node.type === "file") n += 1;
    else if (node.children) n += countFiles(node.children);
  }
  return n;
}

// Cache the task.toml [task].name → dir index for the flat hae-index-src clone
// (the may26+ source of truth — replaces the daytona/modal split). gaia2 tasks
// and several others are renamed on disk but keep their original name in
// task.toml, so this name-index is what bridges them.
//
// task.toml stores names with `/` separators (`aa-lcr/aa-lcr-18`,
// `sunblaze-ucb/cybergym_oss-fuzz_42535468`, `gaia2-cli/0857/l1...`) but the
// matview / trial-name format collapses every `/` into `_`
// (`aa-lcr_aa-lcr-18`, `sunblaze-ucb_cybergym_oss-fuzz_42535468`,
// `gaia2-cli_0857_l1...`) — so we index both forms to bridge them.
let _haeNameIndex = null;
function buildHaeNameIndex(repoRoot) {
  if (_haeNameIndex) return _haeNameIndex;
  const root = join(repoRoot, "task_dataset", "hae-index-src", "harbor-index", "datasets");
  _haeNameIndex = new Map();
  if (!existsSync(root)) return _haeNameIndex;
  for (const name of readdirSync(root)) {
    const tt = join(root, name, "task.toml");
    if (!existsSync(tt)) continue;
    try {
      const m = readFileSync(tt, "utf-8").match(/^[\t ]*name[\t ]*=[\t ]*"([^"]+)"/m);
      if (!m) continue;
      const dir = join(root, name);
      const tomlName = m[1];
      if (!_haeNameIndex.has(tomlName)) _haeNameIndex.set(tomlName, dir);
      // also index the trial-format (slashes collapsed to underscores)
      const trialFormat = tomlName.replace(/\//g, "_");
      if (!_haeNameIndex.has(trialFormat)) _haeNameIndex.set(trialFormat, dir);
    } catch {
      /* ignore */
    }
  }
  return _haeNameIndex;
}

/**
 * Resolve a task to its dir under task_dataset/hae-index-src/harbor-index/
 * datasets/, either by direct name match or via the task.toml [task].name index.
 * Returns the absolute dir path or null.
 */
export function resolveHaeIndexDir(repoRoot, task) {
  if (!task) return null;
  const direct = join(repoRoot, "task_dataset", "hae-index-src", "harbor-index", "datasets", task);
  if (existsSync(direct)) return direct;
  return buildHaeNameIndex(repoRoot).get(task) ?? null;
}

/**
 * Resolve canonical task directory for a trial (same logic as annotation pack builder).
 */
export function findTaskDir(repoRoot, trialsRoot, task, trialId) {
  const trialDir = join(trialsRoot, task, trialId);
  const candidates = [];

  const resultPath = join(trialDir, "result.json");
  if (existsSync(resultPath)) {
    try {
      const result = JSON.parse(readFileSync(resultPath, "utf-8"));
      for (const p of [result?.task_id?.path, result?.config?.task?.path]) {
        if (p) candidates.push(join(repoRoot, "task_dataset", p));
      }
    } catch {
      /* ignore */
    }
  }

  // may26+ flat hae-index-src clone — direct name + task.toml name-index resolve
  const hae = resolveHaeIndexDir(repoRoot, task);
  if (hae) candidates.push(hae);

  for (const env of ["daytona", "modal"]) {
    candidates.push(join(repoRoot, "task_dataset", "harbor-index", "datasets", env, task));
  }

  if (task.startsWith("gaia2-cli_")) {
    const token = task.slice("gaia2-cli_".length).replace(/_/g, "-").toLowerCase();
    const daytonaDir = join(repoRoot, "task_dataset", "harbor-index", "datasets", "daytona");
    if (existsSync(daytonaDir)) {
      for (const name of readdirSync(daytonaDir)) {
        if (name.toLowerCase().includes(token)) {
          candidates.push(join(daytonaDir, name));
        }
      }
    }
  }

  for (const c of candidates) {
    if (existsSync(join(c, "environment", "Dockerfile"))) return c;
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}
