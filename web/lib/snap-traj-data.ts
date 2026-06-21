import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "public", "snap-traj");

export type SnapRunInfo = {
  run_id: string;
  kind: string;
  hidx: string | null;
  label: string;
  pass: boolean;
  has_why: boolean;
};

export function snapTrajTasks(): string[] {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export function snapTrajRuns(task: string): SnapRunInfo[] {
  const idx = join(ROOT, task, "index.json");
  if (!existsSync(idx)) return [];
  try {
    return (JSON.parse(readFileSync(idx, "utf-8")).runs ?? []) as SnapRunInfo[];
  } catch {
    return [];
  }
}

/** Every {task, run} pair for generateStaticParams over the run viewer route. */
export function allSnapTrajParams(): { task: string; run: string }[] {
  const out: { task: string; run: string }[] = [];
  for (const task of snapTrajTasks()) {
    for (const r of snapTrajRuns(task)) out.push({ task, run: r.run_id });
  }
  return out;
}
