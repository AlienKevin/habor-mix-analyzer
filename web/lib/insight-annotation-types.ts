/** Per-annotator insightfulness label: the auditor's own high/medium/low rating
 *  for a task (+ optional comment). Shared backend/auth with the trial
 *  annotations, under a distinct blob prefix. */
export type InsightVerdict = "high" | "medium" | "low";

export type InsightReview = {
  verdict: InsightVerdict | null;
  comment: string;
  updated_at: string;
};

export type InsightAnnotationBundle = {
  annotator: string;
  version: 1;
  reviews: Record<string, InsightReview>; // task_id -> review
};
