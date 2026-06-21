"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrajectoryStepSummary } from "@/lib/annotation-types";

export type InsightTrialMeta = {
  uuid: string;
  task_id?: string;
  model: string | null;
  harness: string | null;
  reward: number | null;
  cost_usd: number | null;
  n_steps: number;
  passed: boolean;
  total_ms?: number;
  started_at?: string;
};

export type InsightManifest = {
  task_id: string;
  representative: string;
  n_total: number;
  trials: InsightTrialMeta[];
};

type RepBundle = { meta: InsightTrialMeta; steps: TrajectoryStepSummary[] };
type AllBundle = { trials: { uuid: string; meta: InsightTrialMeta; steps: TrajectoryStepSummary[] }[] };

const clean = (steps: TrajectoryStepSummary[]) =>
  (steps ?? []).filter((s) => s.kind !== "tool_use_block_separator");

export type InsightTrajectoryState = {
  manifest: InsightManifest | null;
  status: "loading" | "ready" | "error" | "none";
  repUuid: string | null;
  selectedUuid: string | null;
  select: (uuid: string) => void;
  selectedMeta: InsightTrialMeta | null;
  steps: TrajectoryStepSummary[];
  browseLoading: boolean;
};

/**
 * Loads the committed reference trajectories for an insight task:
 *   /insight-traj/<task>/manifest.json  (the trial list)
 *   /insight-traj/<task>/rep.json       (the representative, full fidelity — default view)
 *   /insight-traj/<task>/all.json       (every trial, browse fidelity — lazy, on first "browse")
 * The representative is shown by default; selecting any other trial pulls all.json once.
 */
export function useInsightTrajectory(taskId: string): InsightTrajectoryState {
  const base = `/insight-traj/${encodeURIComponent(taskId)}`;
  const [manifest, setManifest] = useState<InsightManifest | null>(null);
  const [status, setStatus] = useState<InsightTrajectoryState["status"]>("loading");
  const [repSteps, setRepSteps] = useState<TrajectoryStepSummary[]>([]);
  const [repUuid, setRepUuid] = useState<string | null>(null);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [allCache, setAllCache] = useState<Record<string, TrajectoryStepSummary[]>>({});
  const [browseLoading, setBrowseLoading] = useState(false);
  const allLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setManifest(null);
    setRepSteps([]);
    setRepUuid(null);
    setSelectedUuid(null);
    setAllCache({});
    allLoaded.current = false;

    Promise.all([
      fetch(`${base}/manifest.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${base}/rep.json`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([m, rep]: [InsightManifest | null, RepBundle | null]) => {
        if (cancelled) return;
        if (!m || !rep) {
          setStatus("none");
          return;
        }
        setManifest(m);
        setRepUuid(m.representative);
        setSelectedUuid(m.representative);
        setRepSteps(clean(rep.steps));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const ensureAll = useCallback(() => {
    if (allLoaded.current) return;
    allLoaded.current = true;
    setBrowseLoading(true);
    fetch(`${base}/all.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((a: AllBundle | null) => {
        const cache: Record<string, TrajectoryStepSummary[]> = {};
        for (const t of a?.trials ?? []) cache[t.uuid] = clean(t.steps);
        setAllCache(cache);
      })
      .catch(() => {
        allLoaded.current = false;
      })
      .finally(() => setBrowseLoading(false));
  }, [base]);

  const select = useCallback(
    (uuid: string) => {
      setSelectedUuid(uuid);
      if (uuid !== repUuid) ensureAll();
    },
    [repUuid, ensureAll],
  );

  const steps = useMemo(() => {
    if (!selectedUuid) return [];
    if (selectedUuid === repUuid) return repSteps;
    return allCache[selectedUuid] ?? [];
  }, [selectedUuid, repUuid, repSteps, allCache]);

  const selectedMeta = useMemo(
    () => manifest?.trials.find((t) => t.uuid === selectedUuid) ?? null,
    [manifest, selectedUuid],
  );

  return { manifest, status, repUuid, selectedUuid, select, selectedMeta, steps, browseLoading };
}
