import pack from "./insight_pack.json";

export type Insightfulness = "high" | "medium" | "low";

export type InsightReport = {
  task_id: string;
  benchmark: string;
  n_trials: number | null;
  insightfulness: Insightfulness;
  tldr: string;
  main_insight: string;
  why_it_matters: string;
  evidence_from_trajectories: string;
  surface_failure_vs_root_cause: string;
  intended_vs_unexpected_insight: string;
  generalizability: string;
  confounds: string;
  implications_for_future_design: string;
};

export type InsightPack = {
  judge: string;
  generated_for: string;
  prompt_source: string;
  n_total: number;
  n_done: number;
  run_in_progress: boolean;
  summary: { high: number; medium: number; low: number };
  reports: InsightReport[];
};

export function loadInsightPack(): InsightPack {
  return pack as InsightPack;
}
export function insightReport(taskId: string): InsightReport | null {
  return loadInsightPack().reports.find((r) => r.task_id === taskId) ?? null;
}
export function insightTaskIds(): string[] {
  return loadInsightPack().reports.map((r) => r.task_id);
}

export const INSIGHT_STYLE: Record<Insightfulness, { badge: string; tally: string; label: string }> = {
  high: { badge: "bg-emerald-100 text-emerald-800 ring-emerald-300", tally: "border-emerald-200 bg-emerald-50 text-emerald-800", label: "HIGH" },
  medium: { badge: "bg-amber-100 text-amber-900 ring-amber-300", tally: "border-amber-200 bg-amber-50 text-amber-900", label: "MEDIUM" },
  low: { badge: "bg-slate-100 text-slate-700 ring-slate-300", tally: "border-slate-200 bg-slate-50 text-slate-700", label: "LOW" },
};

/** The 8 detail sections after the TLDR lead, in display order. */
export const INSIGHT_SECTIONS: { key: keyof InsightReport; label: string }[] = [
  { key: "main_insight", label: "Main insight" },
  { key: "why_it_matters", label: "Why it matters" },
  { key: "evidence_from_trajectories", label: "Evidence from trajectories" },
  { key: "surface_failure_vs_root_cause", label: "Surface failure vs root cause" },
  { key: "intended_vs_unexpected_insight", label: "Intended vs unexpected insight" },
  { key: "generalizability", label: "Generalizability" },
  { key: "confounds", label: "Confounds" },
  { key: "implications_for_future_design", label: "Implications for future design" },
];
