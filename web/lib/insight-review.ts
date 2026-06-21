"use client";

import type { InsightAnnotationBundle, InsightReview } from "./insight-annotation-types";
import { pullInsightBundle } from "./insight-annotation-sync";

export { INSIGHT_ANNOTATORS } from "./insight-assignments";
export type { InsightAnnotatorName } from "./insight-assignments";

/** Fetch each named annotator's full insight bundle from the cloud. Missing/
 *  errored ones resolve to null (pullInsightBundle swallows errors → local/null). */
export async function loadInsightBundles(
  names: readonly string[],
): Promise<Record<string, InsightAnnotationBundle | null>> {
  const entries = await Promise.all(
    names.map(async (n) => {
      try {
        return [n, await pullInsightBundle(n)] as const;
      } catch {
        return [n, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export function insightReviewFor(bundle: InsightAnnotationBundle | null, taskId: string): InsightReview | null {
  return bundle?.reviews?.[taskId] ?? null;
}

const LEVELS = ["high", "medium", "low"];

/** Has this annotator audited the task (picked a valid high/medium/low rating)?
 *  Guards against stale agree/disagree values from the old rating model. */
export function insightDone(review: InsightReview | null): boolean {
  return review?.verdict != null && LEVELS.includes(review.verdict);
}
