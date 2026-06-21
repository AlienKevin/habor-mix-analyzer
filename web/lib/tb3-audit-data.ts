import tb3pack from "./tb3_audit_pack.json";
import tb3iv from "./tb3_intervention_pack.json";
import tb3trials from "./tb3_trials_pack.json";
import type { AuditPack, Verdict } from "./audit-data";
import type { InterventionPack } from "./intervention-data";

export function loadTb3AuditPack(): AuditPack {
  return tb3pack as AuditPack;
}

export type Tb3InterventionPack = InterventionPack & { running?: boolean };
export function loadTb3InterventionPack(): Tb3InterventionPack {
  return tb3iv as Tb3InterventionPack;
}

// ---- per-task trials pack (audit trial + intervention re-runs) ----
export type Tb3Arm = "audit" | "control" | "treatment" | "placebo";
export type Tb3Trial = {
  rollout_id: string;
  arm: Tb3Arm;
  reward: number | null;
  binary_pass: number;
  status: string | null;
  agent_timeout_s: number | null;
  error_type: string | null;
  has_agent: boolean;
  has_judge: boolean;
};
export type Tb3TaskIntervention = {
  control: string | null;
  placebo: string | null;
  treatment: string | null;
  control_rate: number | null;
  placebo_rate: number | null;
  treatment_rate: number | null;
  corroborated: boolean;
  failure_mode: string | null;
  hint: string | null;
};
export type Tb3Task = {
  task_id: string;
  benchmark: string | null;
  verdict: {
    rollout_id: string;
    outcome_class: Verdict["outcome_class"];
    binary_reward: number;
    reward: number | null;
    status: string | null;
    truly_solved: boolean;
    confidence: string;
    summary: string;
  };
  intervention: Tb3TaskIntervention | null;
  any_timeout: boolean;
  n_errored: number;
  error_types: Record<string, number>;
  trials: Tb3Trial[];
};
export type Tb3TrialsPack = {
  generated_for: string | null;
  agent: string;
  judge: string | null;
  k: number;
  n_tasks: number;
  tasks: Tb3Task[];
};

export function loadTb3TrialsPack(): Tb3TrialsPack {
  return tb3trials as Tb3TrialsPack;
}
export function tb3Tasks(): Tb3Task[] {
  return loadTb3TrialsPack().tasks;
}
export function tb3TaskFor(taskId: string): Tb3Task | null {
  return tb3Tasks().find((t) => t.task_id === taskId) ?? null;
}

const ARM_LABEL: Record<Tb3Arm, string> = {
  audit: "audit (judged)",
  control: "control (no hint)",
  treatment: "treatment (targeted hint)",
  placebo: "placebo (generic hint)",
};
export function tb3ArmLabel(a: Tb3Arm): string {
  return ARM_LABEL[a] ?? a;
}

/** Every browsable trial rollout_id (audit + intervention) for generateStaticParams. */
export function tb3AllTrialIds(): string[] {
  const ids: string[] = [];
  for (const t of tb3Tasks()) for (const tr of t.trials) if (tr.has_agent) ids.push(tr.rollout_id);
  return ids;
}

/** Locate a trial (and its task) by rollout_id across all tasks. */
export function tb3TrialMeta(rolloutId: string): { task: Tb3Task; trial: Tb3Trial } | null {
  for (const task of tb3Tasks()) {
    const trial = task.trials.find((tr) => tr.rollout_id === rolloutId);
    if (trial) return { task, trial };
  }
  return null;
}

// Original judged-verdict lookups (audit trials only).
export function tb3Verdict(id: string): Verdict | null {
  return loadTb3AuditPack().verdicts.find((v) => v.rollout_id === id) ?? null;
}
export function tb3VerdictIds(): string[] {
  return loadTb3AuditPack().verdicts.map((v) => v.rollout_id);
}

export type Tb3ReRun = { arm: Tb3Arm; auditRolloutId: string | null; hint: string | null } | null;

/** Resolve any trial id to a Verdict (real for judged audit trials, synthetic for
 *  intervention re-runs) plus re-run context (null when judged). */
export function tb3VerdictResolved(id: string): { verdict: Verdict; reRun: Tb3ReRun } | null {
  const real = tb3Verdict(id);
  if (real) return { verdict: real, reRun: null };
  const m = tb3TrialMeta(id);
  if (!m) return null;
  const { task, trial } = m;
  const verdict: Verdict = {
    rollout_id: trial.rollout_id,
    task_id: task.task_id,
    trial_id: trial.rollout_id.split("__").pop() ?? trial.rollout_id,
    agent_model: "cursor/composer-2.5",
    harness: "cursor-cli",
    benchmark: task.benchmark,
    verifier_signal: {
      binary_reward: trial.binary_pass,
      reward: trial.reward,
      status: trial.status,
      reward_metric: null,
    },
    judge_verdict: { task_truly_solved: false, confidence: "—", summary: "" },
    outcome_class: "TN",
    outcome_rationale: "",
    evidence: [],
    verifier_or_task_concern: null,
  };
  return {
    verdict,
    reRun: {
      arm: trial.arm,
      auditRolloutId: task.verdict.rollout_id,
      hint: trial.arm === "treatment" ? task.intervention?.hint ?? null : null,
    },
  };
}
