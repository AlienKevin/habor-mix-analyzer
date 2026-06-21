import type {
  AnnotatorBundle,
  AnnotationPack,
  AnnotationTrial,
  GoldTrial,
  Verdict,
} from "./annotation-types";

function tally(values: (Verdict | null | undefined)[]) {
  const votes: Record<Verdict, number> = { agree: 0, disagree: 0 };
  for (const v of values) {
    if (v) votes[v] += 1;
  }
  const consensus = majority(votes);
  return { votes, consensus };
}

function majority(votes: Record<Verdict, number>): Verdict | null {
  const entries = Object.entries(votes) as [Verdict, number][];
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] === 0) return null;
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
  return entries[0][0];
}

export function aggregateGold(pack: AnnotationPack, bundles: AnnotatorBundle[]): GoldTrial[] {
  const byTrial = new Map<string, AnnotatorBundle[]>();
  for (const b of bundles) {
    for (const key of Object.keys(b.reviews)) {
      if (!byTrial.has(key)) byTrial.set(key, []);
      byTrial.get(key)!.push(b);
    }
  }

  return pack.trials.map((trial) => aggregateTrial(trial, byTrial.get(trial.id) ?? bundles));
}

function aggregateTrial(trial: AnnotationTrial, bundles: AnnotatorBundle[]): GoldTrial {
  const closenessVotes: (Verdict | null)[] = [];
  const fmVotes = new Map<string, (Verdict | null)[]>();

  for (const fm of trial.presentation.failure_modes) {
    fmVotes.set(fm.id, []);
  }

  for (const bundle of bundles) {
    const review = bundle.reviews[trial.id];
    if (!review) continue;
    closenessVotes.push(review.closeness);
    for (const fm of review.failure_modes) {
      const slot = fmVotes.get(fm.id);
      if (!slot) continue;
      slot.push(fm.overall ?? null);
    }
  }

  return {
    trial_key: trial.id,
    annotators: closenessVotes.length,
    closeness: tally(closenessVotes),
    failure_modes: trial.presentation.failure_modes.map((fm) => ({
      id: fm.id,
      overall: tally(fmVotes.get(fm.id) ?? []),
    })),
  };
}

export function parseBundleFiles(files: File[]): Promise<AnnotatorBundle[]> {
  return Promise.all(
    files.map(async (file) => {
      const parsed = JSON.parse(await file.text()) as AnnotatorBundle;
      if (!parsed.annotator || !parsed.reviews) throw new Error(`Invalid file: ${file.name}`);
      return parsed;
    }),
  );
}
