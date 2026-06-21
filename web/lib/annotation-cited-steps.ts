import type { AnnotationTrial, TrialReview } from "./annotation-types";

type Presentation = AnnotationTrial["presentation"];

/** 0-based step indices cited by closeness and/or failure-mode labels. */
export function citedStepIndices(presentation: Presentation): number[] {
  const set = new Set<number>();
  if (presentation.step_where_lost != null) set.add(presentation.step_where_lost);
  for (const fm of presentation.failure_modes) {
    for (const s of fm.step_indices) set.add(s);
  }
  return [...set].sort((a, b) => a - b);
}

export function failureModesAtStep(presentation: Presentation, stepIndex: number) {
  return presentation.failure_modes.filter((fm) => fm.step_indices.includes(stepIndex));
}

export function closenessAtStep(presentation: Presentation, stepIndex: number): boolean {
  return presentation.step_where_lost === stepIndex;
}

/** Stable 1-based label numbers: closeness first, then failure modes in pack order. */
export function buildLabelNumbers(presentation: Presentation): {
  closeness: number | null;
  failureModes: Map<string, number>;
} {
  let n = 1;
  let closeness: number | null = null;
  if (presentation.step_where_lost != null) {
    closeness = n++;
  }
  const failureModes = new Map<string, number>();
  for (const fm of presentation.failure_modes) {
    failureModes.set(fm.id, n++);
  }
  return { closeness, failureModes };
}

export function formatCitedSteps(stepIndices: number[]): string {
  return stepIndices.map((s) => s + 1).join(", ");
}

/** Nearest cited step strictly above `current` (0-based), or null. */
export function nearestCitedStepAbove(stepIndices: number[], current: number): number | null {
  const above = stepIndices.filter((s) => s < current);
  return above.length ? Math.max(...above) : null;
}

/** Nearest cited step strictly below `current` (0-based), or null. */
export function nearestCitedStepBelow(stepIndices: number[], current: number): number | null {
  const below = stepIndices.filter((s) => s > current);
  return below.length ? Math.min(...below) : null;
}

export function failureModeBlockId(fmId: string, stepIndex: number): string {
  return `failure-mode-${fmId}-step-${stepIndex}`;
}

export function isCitedStep(presentation: Presentation, stepIndex: number): boolean {
  return closenessAtStep(presentation, stepIndex) || failureModesAtStep(presentation, stepIndex).length > 0;
}

/** Cited step nearest to `stepIndex` (prefer the closest at/above it, else the
 *  closest below). Used to keep the master/detail middle panel anchored on a
 *  labeled step while scrolling through uncited context steps. Null if there
 *  are no cited steps at all. */
export function nearestCitedStep(presentation: Presentation, stepIndex: number): number | null {
  const cited = citedStepIndices(presentation);
  if (cited.length === 0) return null;
  if (cited.includes(stepIndex)) return stepIndex;
  const atOrBelow = cited.filter((s) => s <= stepIndex);
  if (atOrBelow.length) return atOrBelow[atOrBelow.length - 1];
  return cited[0];
}

/** Number of labels (closeness + failure modes) attached to a step. */
export function stepLabelCount(presentation: Presentation, stepIndex: number): number {
  return (
    (closenessAtStep(presentation, stepIndex) ? 1 : 0) +
    failureModesAtStep(presentation, stepIndex).length
  );
}

/** Bare AFT C-subcodes of the failure modes cited at a step (for compact
 *  chips in the step list). De-duplicated, in pack order. */
export function stepSubcodes(presentation: Presentation, stepIndex: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const fm of failureModesAtStep(presentation, stepIndex)) {
    const c = fm.aft.C;
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

export type StepReviewStatus = "none" | "partial" | "reviewed";

/** Review status of a cited step: "reviewed" iff every label citing it has a
 *  verdict (each failure mode's `overall` set, and closeness — if cited here —
 *  has `review.closeness` set); "none" if nothing is set; "partial" otherwise.
 *  Returns "none" for steps with no labels. */
export function stepReviewStatus(
  presentation: Presentation,
  review: TrialReview,
  stepIndex: number,
): StepReviewStatus {
  let total = 0;
  let done = 0;
  if (closenessAtStep(presentation, stepIndex)) {
    total += 1;
    if (review.closeness) done += 1;
  }
  for (const fm of failureModesAtStep(presentation, stepIndex)) {
    total += 1;
    if (review.failure_modes.find((r) => r.id === fm.id)?.overall) done += 1;
  }
  if (total === 0) return "none";
  if (done === 0) return "none";
  return done === total ? "reviewed" : "partial";
}

/** All step indices in the trajectory (0 … totalSteps−1). */
export function fullTrajectoryDisplayIndices(totalSteps: number): number[] {
  if (totalSteps <= 0) return [];
  return Array.from({ length: totalSteps }, (_, i) => i);
}

export function citedSpan(presentation: Presentation): { first: number; last: number } | null {
  const cited = citedStepIndices(presentation);
  if (cited.length === 0) return null;
  return { first: cited[0], last: cited[cited.length - 1] };
}

export type UncitedStepZone = "before" | "between" | "after";

export function uncitedStepZone(presentation: Presentation, stepIndex: number): UncitedStepZone {
  const span = citedSpan(presentation);
  if (!span) return "between";
  if (stepIndex < span.first) return "before";
  if (stepIndex > span.last) return "after";
  return "between";
}

export function uncitedStepHint(zone: UncitedStepZone): string {
  if (zone === "before") return "before cited span";
  if (zone === "after") return "after cited span";
  return "between cited steps";
}

export type TrajectorySegment =
  | { kind: "context"; from: number; to: number; zone: UncitedStepZone }
  | { kind: "cited"; stepIndex: number };

/** Group consecutive uncited steps into ranges; cited steps stay individual. */
export function buildTrajectorySegments(
  presentation: Presentation,
  displaySteps: number[],
): TrajectorySegment[] {
  const segments: TrajectorySegment[] = [];
  let i = 0;
  while (i < displaySteps.length) {
    const stepIndex = displaySteps[i];
    if (isCitedStep(presentation, stepIndex)) {
      segments.push({ kind: "cited", stepIndex });
      i += 1;
      continue;
    }
    const zone = uncitedStepZone(presentation, stepIndex);
    let j = i + 1;
    while (
      j < displaySteps.length &&
      !isCitedStep(presentation, displaySteps[j]) &&
      uncitedStepZone(presentation, displaySteps[j]) === zone
    ) {
      j += 1;
    }
    segments.push({ kind: "context", from: displaySteps[i], to: displaySteps[j - 1], zone });
    i = j;
  }
  return segments;
}

/** @deprecated use fullTrajectoryDisplayIndices when trajectory length is known */
export function trajectoryDisplayIndices(presentation: Presentation): number[] {
  const cited = citedStepIndices(presentation);
  if (cited.length === 0) return [];
  const min = cited[0];
  const max = cited[cited.length - 1];
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}
