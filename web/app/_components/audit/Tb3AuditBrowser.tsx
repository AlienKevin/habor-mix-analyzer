"use client";

import Link from "next/link";
import { useState } from "react";
import { OUTCOME_STYLE, type Verdict } from "@/lib/audit-data";
import { pct } from "@/lib/intervention-data";
import { tb3ArmLabel, type Tb3Task, type Tb3Trial } from "@/lib/tb3-audit-data";

const ARM_BADGE: Record<string, string> = {
  audit: "bg-indigo-100 text-indigo-800 ring-indigo-300",
  control: "bg-slate-100 text-slate-700 ring-slate-300",
  treatment: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  placebo: "bg-amber-100 text-amber-800 ring-amber-300",
};

function TimeoutBadge({ s }: { s: number | null }) {
  return (
    <span
      className="shrink-0 rounded bg-rose-100 px-1 py-0.5 text-[0.6rem] font-medium text-rose-700"
      title={`Agent timed out${s ? ` after ${s}s` : ""}`}
    >
      ⏱ timeout
    </span>
  );
}
function ErroredBadge({ n, types }: { n: number; types: Record<string, number> }) {
  const tip = Object.entries(types)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ");
  return (
    <span
      className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[0.6rem] font-medium text-amber-800"
      title={`Trials that errored before grading (infra/build): ${tip || n}`}
    >
      ⚠ {n} errored
    </span>
  );
}

function TrialRow({ t }: { t: Tb3Trial }) {
  const outcome = t.error_type
    ? { label: t.error_type, cls: "text-amber-700" }
    : t.agent_timeout_s != null
      ? { label: `timeout ${t.agent_timeout_s}s`, cls: "text-rose-700" }
      : t.binary_pass
        ? { label: "pass", cls: "text-emerald-700 font-semibold" }
        : t.reward == null
          ? { label: "no grade", cls: "text-amber-700" }
          : { label: "fail", cls: "text-slate-500" };
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-2 py-1.5">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.65rem] font-bold ring-1 ${ARM_BADGE[t.arm]}`}>
          {t.arm}
        </span>
      </td>
      <td className={`px-2 py-1.5 text-xs ${outcome.cls}`}>{outcome.label}</td>
      <td className="px-2 py-1.5 text-right font-mono text-[0.7rem] text-slate-500">
        {t.reward == null ? "—" : t.reward}
      </td>
      <td className="px-2 py-1.5 text-right">
        {t.has_agent ? (
          <Link href={`/tb3/audit/${t.rollout_id}/`} className="text-xs font-medium text-indigo-600 no-underline hover:underline">
            {t.has_judge ? "verdict + trajectory →" : "trajectory →"}
          </Link>
        ) : (
          <span className="text-[0.7rem] text-slate-400">no trajectory</span>
        )}
      </td>
    </tr>
  );
}

function TaskCard({ task }: { task: Tb3Task }) {
  const [open, setOpen] = useState(false);
  const s = OUTCOME_STYLE[task.verdict.outcome_class];
  const iv = task.intervention;
  const passes = task.trials.filter((t) => t.binary_pass).length;
  const total = task.trials.length;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <span aria-hidden className="mt-0.5 select-none text-slate-400">{open ? "▾" : "▸"}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ring-1 ${s.badge}`}>{s.label}</span>
            <span className="font-mono text-sm font-medium text-slate-900">{task.task_id}</span>
            {task.any_timeout && <TimeoutBadge s={null} />}
            {task.n_errored > 0 && <ErroredBadge n={task.n_errored} types={task.error_types} />}
            <span className="text-[0.7rem] text-slate-400">{passes}/{total} trials pass</span>
          </div>
          {task.verdict.summary && (
            <div className="line-clamp-1 text-xs text-slate-500">{task.verdict.summary}</div>
          )}
          {iv && (
            <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem]">
              <span className="text-slate-400">intervention:</span>
              <span className="text-slate-600">ctrl {pct(iv.control_rate)}</span>
              <span className="text-slate-300">→</span>
              <span className="text-amber-700">plac {pct(iv.placebo_rate)}</span>
              <span className="text-slate-300">→</span>
              <span className="font-semibold text-indigo-700">treat {pct(iv.treatment_rate)}</span>
              {iv.corroborated && <span className="rounded bg-emerald-100 px-1 py-0.5 font-bold text-emerald-700">✓ corroborated</span>}
            </div>
          )}
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          {iv && (
            <div className="rounded-md bg-indigo-50/50 px-3 py-2 text-xs">
              <div className="font-semibold text-indigo-900">Diagnosed failure mode</div>
              <div className="text-slate-700">{iv.failure_mode}</div>
              {iv.hint && (
                <>
                  <div className="mt-1 font-semibold text-indigo-900">Targeted hint (treatment arm)</div>
                  <div className="italic text-slate-600">&ldquo;{iv.hint}&rdquo;</div>
                </>
              )}
            </div>
          )}
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full">
              <thead className="bg-slate-50 text-left text-[0.65rem] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">arm</th>
                  <th className="px-2 py-1.5">outcome</th>
                  <th className="px-2 py-1.5 text-right">reward</th>
                  <th className="px-2 py-1.5 text-right">view</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {task.trials.map((t) => (
                  <TrialRow key={t.rollout_id} t={t} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[0.7rem] text-slate-400">
            {tb3ArmLabel("audit")} is the bottom-up-judged rollout; control / treatment / placebo are the intervention
            re-runs (verifier-scored only).
          </p>
        </div>
      )}
    </div>
  );
}

export default function Tb3AuditBrowser({ tasks }: { tasks: Tb3Task[] }) {
  // judged tasks first, then by whether they have a clean (non-errored) environment
  const sorted = [...tasks].sort(
    (a, b) => a.n_errored - b.n_errored || a.task_id.localeCompare(b.task_id),
  );
  return (
    <div className="space-y-2">
      {sorted.map((t) => (
        <TaskCard key={t.task_id} task={t} />
      ))}
    </div>
  );
}

export type { Verdict };
