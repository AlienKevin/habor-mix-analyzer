"use client";

import AuditStepList, { fmtMs } from "@/app/_components/audit/AuditStepList";
import type { InsightTrajectoryState, InsightTrialMeta } from "./useInsightTrajectory";

function trialLabel(t: InsightTrialMeta, isRep: boolean): string {
  const harness = t.harness ?? "agent";
  const outcome = t.passed ? "✓ solved" : t.reward != null ? `✗ reward ${t.reward}` : "✗";
  return `${harness} · ${outcome} · ${t.n_steps} steps${isRep ? "  (representative)" : ""}`;
}

/** Reference trajectory viewer for an insight task: a trial selector (the
 *  representative is shown by default; pick another to browse the rest) over the
 *  committed /insight-traj bundles, plus the ordered step list. */
export default function InsightTrajectoryViewer({ traj }: { traj: InsightTrajectoryState }) {
  const { manifest, status, selectedUuid, select, selectedMeta, steps, browseLoading, repUuid } = traj;

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Agent trajectory</span>
          {manifest && (
            <span className="text-[0.65rem] text-slate-400">
              {manifest.n_total} trial{manifest.n_total === 1 ? "" : "s"} judged
            </span>
          )}
        </div>
        {manifest && manifest.trials.length > 0 && (
          <select
            value={selectedUuid ?? ""}
            onChange={(e) => select(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            title="Switch trial — the representative is shown by default"
          >
            {manifest.trials.map((t) => (
              <option key={t.uuid} value={t.uuid}>
                {trialLabel(t, t.uuid === repUuid)}
              </option>
            ))}
          </select>
        )}
        {selectedMeta && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] text-slate-400">
            {selectedMeta.model && <span className="font-mono text-slate-600">{selectedMeta.model}</span>}
            <span>{selectedMeta.n_steps} steps</span>
            {selectedMeta.total_ms != null && <span>{fmtMs(selectedMeta.total_ms)}</span>}
            <span className={selectedMeta.passed ? "text-emerald-600" : "text-slate-400"}>
              {selectedMeta.passed ? "solved" : `reward ${selectedMeta.reward ?? "—"}`}
            </span>
            <span className="font-mono text-slate-300">{selectedMeta.uuid.slice(0, 8)}</span>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {status === "loading" && <p className="text-xs text-slate-400">Loading trajectory…</p>}
        {status === "none" && (
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            No reference trajectories were committed for this task.
          </p>
        )}
        {status === "error" && <p className="text-xs text-amber-700">Could not load the trajectory.</p>}
        {status === "ready" && browseLoading && steps.length === 0 ? (
          <p className="text-xs text-slate-400">Loading trial…</p>
        ) : (
          status === "ready" && <AuditStepList steps={steps} />
        )}
      </div>
    </div>
  );
}
