import { insightTaskIds } from "./insight-data";

/** The five insight auditors. Each of the 100 tasks is owned by exactly one of
 *  them (single-owner audit — no double review). */
export const INSIGHT_ANNOTATORS = ["lin", "haowei", "zixuan", "crystal", "kevin"] as const;
export type InsightAnnotatorName = (typeof INSIGHT_ANNOTATORS)[number];

// Even round-robin over the task_ids (sorted for stability, independent of the
// pack's level ordering): task i → annotator[i % 5], so exactly 20 each and a
// benchmark/level mix per person rather than one person getting all the "high"s.
const ASSIGNMENTS: Record<string, InsightAnnotatorName> = (() => {
  const ids = [...insightTaskIds()].sort();
  const m: Record<string, InsightAnnotatorName> = {};
  ids.forEach((id, i) => {
    m[id] = INSIGHT_ANNOTATORS[i % INSIGHT_ANNOTATORS.length];
  });
  return m;
})();

export function assigneeFor(taskId: string): InsightAnnotatorName | null {
  return ASSIGNMENTS[taskId] ?? null;
}

export function tasksFor(name: string): string[] {
  return Object.keys(ASSIGNMENTS).filter((t) => ASSIGNMENTS[t] === name);
}

/** How many tasks each annotator owns (all 20 by construction). */
export function assignmentTotals(): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(INSIGHT_ANNOTATORS.map((n) => [n, 0]));
  for (const name of Object.values(ASSIGNMENTS)) out[name] += 1;
  return out;
}
