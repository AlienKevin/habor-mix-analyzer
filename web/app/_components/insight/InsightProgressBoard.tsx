"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Insightfulness } from "@/lib/insight-data";
import { INSIGHT_STYLE } from "@/lib/insight-data";
import { INSIGHT_ANNOTATORS, assigneeFor } from "@/lib/insight-assignments";
import { insightDone, insightReviewFor } from "@/lib/insight-review";
import { loadBundle, ensureAnnotator, clearAnnotatorSession } from "@/lib/annotation-storage";
import { canonicalAnnotator } from "@/lib/annotation-identity";
import { useInsightBundles } from "./useInsightBundles";

export type CardReport = {
  task_id: string;
  benchmark: string;
  insightfulness: Insightfulness;
  n_trials: number | null;
};

const ORDER: Record<string, number> = Object.fromEntries(INSIGHT_ANNOTATORS.map((n, i) => [n, i]));

function Badge({ level }: { level: Insightfulness }) {
  const s = INSIGHT_STYLE[level];
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.65rem] font-bold ring-1 ${s.badge}`}>{s.label}</span>;
}

export default function InsightProgressBoard({ reports }: { reports: CardReport[] }) {
  const { bundles, loading, tokenState } = useInsightBundles();
  const [me, setMe] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pick, setPick] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    setMe(loadBundle()?.annotator ?? null);
    setHydrated(true);
  }, []);

  // task → assignee + done (the assignee's verdict is set), sorted by assignee
  const rows = useMemo(() => {
    const out = reports.map((r) => {
      const assignee = assigneeFor(r.task_id);
      const done = assignee ? insightDone(insightReviewFor(bundles[assignee] ?? null, r.task_id)) : false;
      return { r, assignee, done };
    });
    return out.sort((a, b) => (ORDER[a.assignee ?? ""] ?? 99) - (ORDER[b.assignee ?? ""] ?? 99));
  }, [reports, bundles]);

  const perAnnotator = INSIGHT_ANNOTATORS.map((name) => {
    const mine = rows.filter((x) => x.assignee === name);
    return { name, done: mine.filter((x) => x.done).length, total: mine.length };
  });
  const totalDone = perAnnotator.reduce((s, p) => s + p.done, 0);
  const totalTasks = rows.length;

  const visible = onlyMine && me ? rows.filter((x) => x.assignee === me) : rows;

  return (
    <section className="space-y-3">
      {/* sign-in + progress */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Audit progress — <span className="font-mono">{totalDone}/{totalTasks}</span> done
          </h2>
          {hydrated &&
            (me ? (
              <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                you are <span className="font-mono text-slate-700">{me}</span>
                <button type="button" onClick={() => { clearAnnotatorSession(); setMe(null); setOnlyMine(false); }} className="hover:underline">switch</button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1">
                  <option value="">Sign in…</option>
                  {INSIGHT_ANNOTATORS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button type="button" disabled={!pick} onClick={() => ensureAnnotator(pick).then(() => setMe(canonicalAnnotator(pick)))} className="rounded bg-indigo-600 px-2 py-1 font-medium text-white disabled:opacity-40">Sign in</button>
              </span>
            ))}
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
          {perAnnotator.map((p) => {
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            const isMe = p.name === me;
            return (
              <div key={p.name} className={`rounded border px-2 py-1.5 ${isMe ? "border-violet-300 bg-violet-50/60" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-medium capitalize ${isMe ? "text-violet-800" : "text-slate-800"}`}>{p.name}</span>
                  <span className={p.done === p.total ? "text-emerald-700" : "text-slate-500"}>{p.done}/{p.total}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${p.done === p.total ? "bg-emerald-500" : "bg-indigo-400"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {me && (
            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              Show only my tasks
            </label>
          )}
          {tokenState === "disabled" && <span className="text-amber-700">Cloud store not configured — progress shows assignments only.</span>}
          {tokenState === "no-token" && (
            <span className="text-amber-700">
              Cross-annotator progress needs the API token — sign in on the <Link href="/annotate/" className="underline">annotate page</Link>.
            </span>
          )}
          {loading && <span className="text-slate-400">loading progress…</span>}
        </div>
      </div>

      {/* clean overview table, sorted by assignee */}
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Benchmark</th>
              <th className="px-3 py-2">Insight</th>
              <th className="px-3 py-2">Trials</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ r, assignee, done }) => {
              const isMine = assignee === me;
              return (
                <tr key={r.task_id} className={`border-t border-slate-100 hover:bg-slate-50/80 ${isMine ? "bg-violet-50/40" : ""}`}>
                  <td className="px-3 py-2 text-xs">
                    <Link href={`/insightfulness/${r.task_id}/`} className="font-mono text-indigo-700 no-underline hover:underline">{r.task_id}</Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{r.benchmark}</td>
                  <td className="px-3 py-2"><Badge level={r.insightfulness} /></td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.n_trials ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-medium ${done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                      {done ? "audited" : "pending"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-medium capitalize ${isMine ? "bg-violet-200 text-violet-900" : "bg-violet-50 text-violet-700"}`}>
                      {assignee ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
