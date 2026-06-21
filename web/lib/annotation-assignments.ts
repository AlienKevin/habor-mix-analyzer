/**
 * Two-reviewer assignment for the may26 stratified-35 sample.
 *
 * Every trial (trial-01 … trial-35) is double-annotated on a 5-window sliding
 * overlap, so each trial has exactly 2 assigned reviewers:
 *
 *   window 1   trials 1–7    lin · kevin
 *   window 2   trials 8–14   lin · haowei
 *   window 3   trials 15–21  haowei · zixuan
 *   window 4   trials 22–28  zixuan · crystal
 *   window 5   trials 29–35  crystal · kevin
 *
 * Per-annotator ranges: lin 1–14, haowei 8–21, zixuan 15–28, crystal 22–35,
 * kevin 29–35 + 1–7.
 */

export type AnnotatorName = "lin" | "haowei" | "zixuan" | "crystal" | "kevin";

/** Inclusive 1-based trial-number ranges each annotator covers. */
export const ANNOTATOR_RANGES: Record<AnnotatorName, Array<[number, number]>> = {
  lin: [[1, 14]],
  haowei: [[8, 21]],
  zixuan: [[15, 28]],
  crystal: [[22, 35]],
  kevin: [[29, 35], [1, 7]],
};

export const ALL_ANNOTATORS: AnnotatorName[] = ["lin", "haowei", "zixuan", "crystal", "kevin"];

/** trial-08 → 8 (null if not a trial-NN id). */
export function trialNumber(trialId: string): number | null {
  const m = /^trial-0*(\d+)$/.exec(trialId);
  return m ? Number(m[1]) : null;
}

function coversNumber(name: AnnotatorName, n: number): boolean {
  return ANNOTATOR_RANGES[name].some(([a, b]) => n >= a && n <= b);
}

/** The 2 reviewers assigned to a trial, in a stable order. */
export function assignedAnnotators(trialId: string): AnnotatorName[] {
  const n = trialNumber(trialId);
  if (n == null) return [];
  return ALL_ANNOTATORS.filter((name) => coversNumber(name, n));
}

/** All trial NUMBERS (1-based) an annotator is assigned. */
export function trialNumbersFor(name: AnnotatorName): number[] {
  const out: number[] = [];
  for (const [a, b] of ANNOTATOR_RANGES[name]) {
    for (let n = a; n <= b; n++) out.push(n);
  }
  return out.sort((x, y) => x - y);
}

export type AnnotatorPair = [AnnotatorName, AnnotatorName];

/** The 5 unique reviewer pairs (one per window), de-duplicated. */
export const ANNOTATOR_PAIRS: AnnotatorPair[] = (() => {
  const seen = new Set<string>();
  const pairs: AnnotatorPair[] = [];
  for (let n = 1; n <= 35; n++) {
    const who = ALL_ANNOTATORS.filter((name) => coversNumber(name, n));
    if (who.length === 2) {
      const key = [...who].sort().join("|");
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([who[0], who[1]]);
      }
    }
  }
  return pairs;
})();

/** Trial NUMBERS both members of a pair are assigned. */
export function trialNumbersForPair(a: AnnotatorName, b: AnnotatorName): number[] {
  const out: number[] = [];
  for (let n = 1; n <= 35; n++) {
    if (coversNumber(a, n) && coversNumber(b, n)) out.push(n);
  }
  return out;
}
