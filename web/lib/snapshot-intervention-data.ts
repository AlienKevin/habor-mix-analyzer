import pack from "./snapshot_intervention_pack.json";

export type SnapBaseline = {
  reward?: number | null;
  n_steps?: number;
  session_id?: string | null;
};

export type SnapRow = {
  task: string;
  status?: "complete" | "boot_stalled" | "pending";
  root_step: number | null;
  step_action: string | null;
  confidence: string | null;
  gap_type: string | null; // "knowledge" | "validation" | ...
  hint: string | null;
  failure_mode: string | null;
  baseline: SnapBaseline;
  treatment_rewards: number[];
  placebo_rewards: number[];
  treatment_pass: number;
  treatment_n: number;
  placebo_pass: number;
  placebo_n: number;
  treatment_rate: number | null;
  placebo_rate: number | null;
  treatment_v2_rewards?: number[];
  treatment_v2_pass?: number;
  treatment_v2_n?: number;
  treatment_v2_rate?: number | null;
};

export type SnapAgg = { pass: number; n: number; rate: number | null };

export type SnapPack = {
  agent: string;
  environment: string;
  method: string;
  k_per_arm: number;
  rows: SnapRow[];
  aggregate: { treatment: SnapAgg; placebo: SnapAgg };
  significance?: { method: string; p_one_sided: number | null };
};

export function loadSnapshotIntervention(): SnapPack {
  return pack as SnapPack;
}

export function pctOf(r: number | null | undefined): string {
  if (r == null) return "—";
  return `${Math.round(r * 100)}%`;
}
