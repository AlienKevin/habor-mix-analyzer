import pack from "./snapshot_rounds_pack.json";

export type RoundHint = {
  label: string;
  hint: string | null;
  step: number | null;
  pass: boolean;
  n: number;
  outcome?: string | null;
  why?: string | null;
  derived_from?: number[];
  lineage?: string | null;
};

export type Round = {
  hints: RoundHint[];
  treatment_flip: boolean;
  n_hints: number;
  placebo_flip: boolean;
  placebo_n: number;
  diagnosis?: string | null;
};

export type RoundRow = {
  task: string;
  gap_type: string | null;
  root_step: number | null;
  step_action: string | null;
  status: "complete" | "pending" | string;
  baseline_outcome?: string | null;
  why?: string | null;
  round1: Round;
  round2: Round | null;
  ceiling: { pass: boolean; n: number; outcome?: string | null; hint?: string | null } | null;
};

export type RoundsPack = {
  agent: string;
  environment: string;
  method: string;
  rows: RoundRow[];
};

export function loadSnapshotRounds(): RoundsPack {
  return pack as RoundsPack;
}

// Scale-out (tb3_43) tasks re-run on the latest pipeline get the same
// RoundRow shape; kept in a separate pack so the original study stays intact.
import t43pack from "./tb3_43_rounds_pack.json";

export function loadT43Rounds(): RoundsPack {
  return t43pack as RoundsPack;
}

export function t43Row(task: string): RoundRow | undefined {
  return (t43pack as RoundsPack).rows.find((r) => r.task === task);
}
