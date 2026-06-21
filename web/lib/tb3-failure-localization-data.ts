import pack from "./tb3_failure_localization_pack.json";

export type Tb3FailLocTrial = {
  trial_id: string;
  task: string;
  reward: number | null;
  n_steps: number;
  key_step: number | null;
  key_step_frac: number | null;
  localization: "single_step" | "few_steps" | "diffuse";
  failure_kind: string;
  reason: string;
  is_infra: boolean;
  has_traj: boolean;
};
export type Tb3FailLocPack = {
  agent: string;
  arm: string;
  benchmark: string;
  n_total: number;
  n_task_failures: number;
  n_infra: number;
  localization_taskfail: Record<string, number>;
  localization_infra: Record<string, number>;
  failure_kind_taskfail: Record<string, number>;
  position_hist: number[];
  median_frac: number;
  trials: Tb3FailLocTrial[];
};

export function loadTb3FailLocPack(): Tb3FailLocPack {
  return pack as Tb3FailLocPack;
}
