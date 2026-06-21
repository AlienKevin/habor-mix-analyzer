import type { Verdict } from "./annotation-types";

/** One chat message in a trial's reviewer discussion thread. `label` scopes the
 *  message to a per-label thread ("closeness" or a failure-mode id); when absent
 *  the message belongs to the trial-level "general" thread. The reviewers' own
 *  per-label annotation notes are rendered as the seed/first comment of each
 *  label thread (derived from the bundles, not stored here). */
export type AdjudicationMessage = {
  author: string;
  text: string;
  ts: string; // ISO timestamp
  label?: string;
};

/** The reviewers' converged verdicts on the judge's labels (the gold). Mirrors
 *  the agree/disagree shape of a human review but represents the two-reviewer
 *  consensus after discussion. */
export type ConvergedReview = {
  /** Converged decision on whether the task itself is broken. `true` makes the
   *  per-label verdicts (closeness + failure modes) not applicable. `null` =
   *  undecided. Absent on older records → treat as null. */
  task_broken: boolean | null;
  /** Converged decision on whether this experiment/run is broken (cut off,
   *  env failure). Like task_broken, `true` makes per-label verdicts N/A. */
  experiment_broken: boolean | null;
  /** Converged decision on whether the task is non-instructional (low benchmark
   *  signal). Does NOT gate the per-label verdicts — they stay applicable. */
  non_instructional: boolean | null;
  closeness: Verdict | null;
  /** failure-mode id → converged verdict. */
  failure_modes: Record<string, Verdict | null>;
  note: string;
};

/** Per-trial adjudication record: the discussion thread + the converged GT.
 *  Shared across both reviewers via the `harbor-adjudication/<trial>.json`
 *  blob. */
export type AdjudicationRecord = {
  trial_id: string;
  messages: AdjudicationMessage[];
  converged: ConvergedReview;
  finalized: boolean;
  finalized_by: string | null;
  finalized_at: string | null;
  updated_at: string;
};

export function emptyAdjudication(trialId: string): AdjudicationRecord {
  return {
    trial_id: trialId,
    messages: [],
    converged: {
      task_broken: null,
      experiment_broken: null,
      non_instructional: null,
      closeness: null,
      failure_modes: {},
      note: "",
    },
    finalized: false,
    finalized_by: null,
    finalized_at: null,
    updated_at: "",
  };
}
