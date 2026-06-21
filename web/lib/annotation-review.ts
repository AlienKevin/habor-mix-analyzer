"use client";

import type { AnnotationTrial, AnnotatorBundle, TrialReview, Verdict } from "./annotation-types";
import { isTrialComplete } from "./annotation-storage";
import { pullBundleFromServer } from "./annotation-sync";

type Presentation = AnnotationTrial["presentation"];

/** Fetch each named annotator's full bundle from the cloud. Missing/errored
 *  ones resolve to null (e.g. annotator hasn't started, or no token). */
export async function loadAnnotatorBundles(
  names: string[],
): Promise<Record<string, AnnotatorBundle | null>> {
  const entries = await Promise.all(
    names.map(async (n) => {
      try {
        return [n, await pullBundleFromServer(n)] as const;
      } catch {
        return [n, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export function reviewFor(bundle: AnnotatorBundle | null, trialId: string): TrialReview | null {
  return bundle?.reviews?.[trialId] ?? null;
}

/** Has this annotator finished the trial (all labels verdicted, or task flagged
 *  broken)? */
export function annotatorDone(review: TrialReview | null, presentation: Presentation): boolean {
  return isTrialComplete(
    review ?? undefined,
    presentation.failure_modes.map((f) => f.id),
  );
}

export type LabelAgreement = {
  key: string;
  label: string;
  a: Verdict | null;
  b: Verdict | null;
  /** both reviewers gave a verdict */
  comparable: boolean;
  /** true=match, false=mismatch, null=not comparable */
  match: boolean | null;
};

export type TrialAgreement = {
  rows: LabelAgreement[];
  comparable: number;
  matched: number;
  /** matched / comparable, or null when nothing is comparable yet */
  pct: number | null;
};

function fmVerdict(review: TrialReview | null, fmId: string): Verdict | null {
  return review?.failure_modes.find((r) => r.id === fmId)?.overall ?? null;
}

/** Per-label agree/disagree concordance between two reviewers on one trial. */
export function trialAgreement(
  presentation: Presentation,
  reviewA: TrialReview | null,
  reviewB: TrialReview | null,
): TrialAgreement {
  const rows: LabelAgreement[] = [];

  const ca = reviewA?.closeness ?? null;
  const cb = reviewB?.closeness ?? null;
  rows.push({
    key: "closeness",
    label: "Closeness",
    a: ca,
    b: cb,
    comparable: ca != null && cb != null,
    match: ca != null && cb != null ? ca === cb : null,
  });

  for (const fm of presentation.failure_modes) {
    const a = fmVerdict(reviewA, fm.id);
    const b = fmVerdict(reviewB, fm.id);
    rows.push({
      key: fm.id,
      label: fm.name || fm.id,
      a,
      b,
      comparable: a != null && b != null,
      match: a != null && b != null ? a === b : null,
    });
  }

  const comparable = rows.filter((r) => r.comparable).length;
  const matched = rows.filter((r) => r.match === true).length;
  return { rows, comparable, matched, pct: comparable ? matched / comparable : null };
}

export type PairAggregate = {
  bothDone: number;
  trials: number;
  comparable: number;
  matched: number;
  pct: number | null;
};

/** Aggregate agreement for a reviewer pair across a set of trials. */
export function pairAggregate(
  trials: AnnotationTrial[],
  bundleA: AnnotatorBundle | null,
  bundleB: AnnotatorBundle | null,
): PairAggregate {
  let comparable = 0;
  let matched = 0;
  let bothDone = 0;
  for (const t of trials) {
    const ra = reviewFor(bundleA, t.id);
    const rb = reviewFor(bundleB, t.id);
    if (annotatorDone(ra, t.presentation) && annotatorDone(rb, t.presentation)) bothDone += 1;
    const ag = trialAgreement(t.presentation, ra, rb);
    comparable += ag.comparable;
    matched += ag.matched;
  }
  return {
    bothDone,
    trials: trials.length,
    comparable,
    matched,
    pct: comparable ? matched / comparable : null,
  };
}

export function formatPct(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct * 100)}%`;
}
