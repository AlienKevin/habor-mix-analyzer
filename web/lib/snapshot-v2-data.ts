import pack from "./snapshot_v2_pack.json";

export type V2Node = {
  hint?: string | null;
  step?: number | null;
  pass: boolean;
  outcome?: string | null;
  why?: string | null;
  graded?: boolean;
};

export type V2Lane = {
  r1: V2Node;
  r2: V2Node | null;
  placebo: { pass: boolean; graded?: boolean } | null;
};

export type V2Row = {
  task: string;
  lanes: V2Lane[];
  r1_any_flip: boolean;
  r2_any_flip: boolean;
  placebo_any_flip: boolean;
};

export type V2Pack = {
  agent: string;
  environment: string;
  design: string;
  rows: V2Row[];
};

export function loadV2(): V2Pack {
  return pack as V2Pack;
}

export function v2Row(task: string): V2Row | undefined {
  return (pack as V2Pack).rows.find((r) => r.task === task);
}
