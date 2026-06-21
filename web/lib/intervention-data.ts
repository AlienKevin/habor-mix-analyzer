import pack from "./intervention_pack.json";

export type InterventionRow = {
  task: string;
  outcome: string;
  failure_mode: string;
  hint: string;
  control: string;
  treatment: string;
  placebo: string;
  control_rate: number | null;
  treatment_rate: number | null;
  placebo_rate: number | null;
  corroborated: boolean;
};

export type InterventionPack = {
  agent: string;
  judge: string;
  k: number;
  arms: string[];
  aggregate: Record<string, { pass: number; n: number; rate: number | null }>;
  n_tested: number;
  n_corroborated: number;
  rows: InterventionRow[];
};

export function loadInterventionPack(): InterventionPack {
  return pack as InterventionPack;
}

export const pct = (r: number | null | undefined): string =>
  r == null ? "—" : `${Math.round(r * 100)}%`;
