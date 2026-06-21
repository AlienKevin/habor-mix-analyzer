"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TrajectoryStepSummary } from "@/lib/annotation-types";
import AuditStepList, { fmtMs } from "./AuditStepList";
import { trajUrl } from "@/lib/traj-urls";

type Bundle = {
  meta: {
    rollout_id: string;
    task_id: string;
    which: "agent" | "judge";
    label: string;
    model: string | null;
    harness: string | null;
    n_steps: number;
    total_ms?: number;
    started_at?: string;
  };
  steps: TrajectoryStepSummary[];
};

const WHICH_LABEL: Record<string, string> = {
  agent: "Original agent rollout",
  judge: "Judge audit trace",
};

export default function AuditTrajectoryViewer({
  id,
  which,
  taskId,
  renderArcGrids,
  basePath = "/audit",
}: {
  id: string;
  which: "agent" | "judge";
  taskId: string;
  renderArcGrids?: boolean;
  basePath?: string;
}) {
  const [bundle, setBundle] = useState<Bundle | null | "error">(null);

  useEffect(() => {
    let live = true;
    setBundle(null);
    fetch(trajUrl(id, which as "agent" | "judge"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b) => live && setBundle(b))
      .catch(() => live && setBundle("error"));
    return () => {
      live = false;
    };
  }, [id, which]);

  // Steps are client-fetched, so the browser's initial #step-N scroll (e.g. from a
  // citation deep-link) misses the not-yet-rendered content — re-apply it once the
  // bundle renders.
  useEffect(() => {
    if (bundle && bundle !== "error" && typeof window !== "undefined" && window.location.hash) {
      const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  }, [bundle]);

  const other = which === "agent" ? "judge" : "agent";
  const meta = bundle && bundle !== "error" ? bundle.meta : null;
  // Hide content-block-separator steps (no message/reasoning/tool_call payload).
  const steps =
    bundle && bundle !== "error"
      ? bundle.steps.filter((s) => s.kind !== "tool_use_block_separator")
      : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={`${basePath}/${id}/`} className="text-indigo-600 no-underline hover:underline">
          ← back to verdict
        </Link>
        <span className="text-slate-300">·</span>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          <span className="bg-indigo-600 px-2.5 py-1 font-medium text-white">{WHICH_LABEL[which]}</span>
          <Link
            href={`${basePath}/${id}/${other}/`}
            className="bg-white px-2.5 py-1 font-medium text-slate-600 no-underline hover:bg-slate-50"
          >
            {WHICH_LABEL[other]} →
          </Link>
        </div>
      </div>

      <header className="space-y-1 border-b border-slate-200 pb-3">
        <h1 className="text-lg font-bold text-slate-900">
          {which === "judge" ? "Judge audit trace" : "Agent rollout"}{" "}
          <span className="font-mono text-sm font-normal text-slate-500">{taskId}</span>
        </h1>
        <p className="text-xs text-slate-600">
          {which === "judge"
            ? "The judge model's own steps while reading the rollout and writing its verdict."
            : "The original agent's full trajectory for this task — the rollout under audit."}
        </p>
        {meta && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[0.7rem] text-slate-500">
            {meta.model && (
              <span>
                model <span className="font-mono text-slate-700">{meta.model}</span>
              </span>
            )}
            {meta.harness && (
              <span>
                harness <span className="font-mono text-slate-700">{meta.harness}</span>
              </span>
            )}
            <span>
              <span className="font-mono text-slate-700">{steps.length}</span> steps
            </span>
            {meta.total_ms != null && (
              <span>
                wall-clock <span className="font-mono text-slate-700">{fmtMs(meta.total_ms)}</span>
              </span>
            )}
          </div>
        )}
      </header>

      {bundle === null && <p className="text-sm text-slate-500">Loading trajectory…</p>}
      {bundle === "error" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Trajectory not available for this trial.
        </p>
      )}

      {meta && <AuditStepList steps={steps} renderArcGrids={renderArcGrids} />}
    </div>
  );
}
