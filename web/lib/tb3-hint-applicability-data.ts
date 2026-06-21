import pack from "./tb3_hint_applicability_pack.json";

export type HAMode = "same" | "related" | "passed_that_step_failed_later" | "different" | "infra_timeout";
export type HATrial = {
  trial_id: string;
  task: string;
  arm: "treatment" | "placebo";
  reward: number | null;
  exhibits_diagnosed_mode: HAMode;
  hint_relevant: string | null;
  hint_heeded: string | null;
  actual_failure_mode: string;
  reason: string;
  is_infra: boolean;
  has_traj: boolean;
};
export type HAArm = {
  modes: Record<HAMode, number>;
  n: number;
  same_genuine: number;
  genuine: number;
  same_pct: number;
};
export type HATask = {
  task: string;
  n: number;
  modes: Partial<Record<HAMode, number>>;
  failure_mode: string;
  hint: string;
};
export type HintApplicabilityPack = {
  agent: string;
  judge: string;
  n_total: number;
  n_infra: number;
  n_genuine: number;
  same_among_genuine: { n: number; total: number; pct: number };
  arm: { treatment: HAArm; placebo: HAArm };
  hint_relevant: Record<string, number>;
  fix_then_fail: { n: number; treatment_genuine: number };
  note_math_pdf: string;
  per_task: HATask[];
  trials: HATrial[];
};

export function loadHintApplicabilityPack(): HintApplicabilityPack {
  return pack as HintApplicabilityPack;
}

export const HA_MODE_ORDER: HAMode[] = ["same", "related", "passed_that_step_failed_later", "different", "infra_timeout"];
export const HA_MODE_STYLE: Record<HAMode, { label: string; bar: string; badge: string }> = {
  same: { label: "same diagnosed mode", bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
  related: { label: "related (right area, botched)", bar: "bg-sky-500", badge: "bg-sky-100 text-sky-800 ring-sky-300" },
  passed_that_step_failed_later: { label: "passed it, failed later", bar: "bg-violet-500", badge: "bg-violet-100 text-violet-800 ring-violet-300" },
  different: { label: "different failure", bar: "bg-amber-500", badge: "bg-amber-100 text-amber-900 ring-amber-300" },
  infra_timeout: { label: "infra / ungradeable", bar: "bg-slate-400", badge: "bg-slate-100 text-slate-700 ring-slate-300" },
};
