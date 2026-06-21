import pack from "./tb3_scope_pack.json";

export type ScopeBaseline = {
  status: "recorded" | "pending" | string;
  pass?: boolean;
  reward?: number;
  snapshots?: number;
};

export type ScopeRow = {
  task: string;
  scope: "done" | "new" | "skipped" | string;
  skip_reason?: string;
  category?: string | null;
  baseline?: ScopeBaseline;
  has_viewer?: boolean;
  n_runs?: number;
};

export type ScopePack = {
  agent: string;
  environment: string;
  n_total: number;
  n_done: number;
  n_new: number;
  n_skipped: number;
  status_note?: string | null;
  rows: ScopeRow[];
};

export function loadScope(): ScopePack {
  return pack as ScopePack;
}

export function scopeRow(task: string): ScopeRow | undefined {
  return (pack as ScopePack).rows.find((r) => r.task === task);
}
