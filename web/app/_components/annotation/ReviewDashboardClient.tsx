"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnnotationPack, AnnotationTrial } from "@/lib/annotation-types";
import { pullAdjudication } from "@/lib/adjudication-sync";
import {
  ALL_ANNOTATORS,
  ANNOTATOR_PAIRS,
  assignedAnnotators,
  trialNumber,
  trialNumbersFor,
  trialNumbersForPair,
} from "@/lib/annotation-assignments";
import {
  annotatorDone,
  formatPct,
  pairAggregate,
  reviewFor,
  trialAgreement,
} from "@/lib/annotation-review";
import { useAnnotatorBundles } from "./useAnnotatorBundles";

function TokenNotice({ state }: { state: "no-token" | "disabled" }) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      {state === "disabled" ? (
        <>The cloud annotation store isn&apos;t configured on this deployment, so cross-annotator progress can&apos;t be loaded.</>
      ) : (
        <>
          Cross-annotator progress needs the annotation API token. Sign in on the{" "}
          <Link href="/annotate/" className="text-amber-900 underline">
            annotate page
          </Link>{" "}
          (it&apos;s baked into the deployment for the team) or enter it there once per browser.
        </>
      )}
    </div>
  );
}

function DoneBadge({ name, done }: { name: string; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${
        done ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"
      }`}
      title={done ? `${name} finished` : `${name} not done`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${done ? "bg-emerald-500" : "bg-rose-400"}`} />
      {name}
    </span>
  );
}

export default function ReviewDashboardClient({ pack }: { pack: AnnotationPack }) {
  const { bundles, loading, tokenState, reload } = useAnnotatorBundles();

  const trialsByNumber = useMemo(() => {
    const m = new Map<number, AnnotationTrial>();
    for (const t of pack.trials) {
      const n = trialNumber(t.id);
      if (n != null) m.set(n, t);
    }
    return m;
  }, [pack.trials]);

  // per-annotator done count over their assigned trials
  const perAnnotator = ALL_ANNOTATORS.map((name) => {
    const nums = trialNumbersFor(name);
    const done = nums.filter((n) => {
      const t = trialsByNumber.get(n);
      return t ? annotatorDone(reviewFor(bundles[name] ?? null, t.id), t.presentation) : false;
    }).length;
    return { name, done, total: nums.length };
  });

  const perPair = ANNOTATOR_PAIRS.map(([a, b]) => {
    const trials = trialNumbersForPair(a, b)
      .map((n) => trialsByNumber.get(n))
      .filter((t): t is AnnotationTrial => Boolean(t));
    const agg = pairAggregate(trials, bundles[a] ?? null, bundles[b] ?? null);
    return { a, b, agg };
  });

  // Converged = the two reviewers have finalized the converged gold label
  // (adjudication record `finalized`). Pull each trial's record to mark them.
  const [finalized, setFinalized] = useState<Record<string, { by: string | null; at: string | null }>>({});
  const loadAdjudications = useCallback(async () => {
    if (tokenState !== "ok") return;
    const entries = await Promise.all(
      pack.trials.map(async (t) => {
        try {
          const r = await pullAdjudication(t.id);
          return r?.finalized ? ([t.id, { by: r.finalized_by, at: r.finalized_at }] as const) : null;
        } catch {
          return null;
        }
      }),
    );
    const m: Record<string, { by: string | null; at: string | null }> = {};
    for (const e of entries) if (e) m[e[0]] = e[1];
    setFinalized(m);
  }, [pack.trials, tokenState]);

  useEffect(() => {
    loadAdjudications();
  }, [loadAdjudications]);

  const convergedCount = Object.keys(finalized).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Annotation review</h1>
          <p className="text-sm text-slate-600 mt-1">
            Two-reviewer progress + agreement across the {pack.n_trials} trials. Click a trial to
            compare both reviewers and converge on a gold label.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
            ✓ {convergedCount}/{pack.n_trials} converged
          </span>
          <button
            type="button"
            onClick={() => {
              reload();
              loadAdjudications();
            }}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {tokenState !== "ok" && <TokenNotice state={tokenState} />}

      {/* per-annotator progress */}
      <div className="flex flex-wrap gap-2">
        {perAnnotator.map((p) => (
          <span key={p.name} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm">
            <span className="font-medium text-slate-900">{p.name}</span>{" "}
            <span className={p.done === p.total ? "text-emerald-700" : "text-slate-600"}>
              {p.done}/{p.total} done
            </span>
          </span>
        ))}
      </div>

      {/* per-pair aggregate agreement */}
      <div className="rounded border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Reviewer-pair agreement (over labels both reviewed)
        </div>
        <table className="w-full text-sm">
          <tbody>
            {perPair.map(({ a, b, agg }) => (
              <tr key={`${a}-${b}`} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">
                  {a} · {b}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {agg.bothDone}/{agg.trials} trials both done
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono font-semibold text-slate-900">{formatPct(agg.pct)}</span>{" "}
                  <span className="text-xs text-slate-500">
                    ({agg.matched}/{agg.comparable} labels)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* per-trial table */}
      <div className="rounded border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Reviewers</th>
              <th className="px-3 py-2">Agreement</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pack.trials.map((t) => {
              const [a, b] = assignedAnnotators(t.id);
              const ra = a ? reviewFor(bundles[a] ?? null, t.id) : null;
              const rb = b ? reviewFor(bundles[b] ?? null, t.id) : null;
              const ag = trialAgreement(t.presentation, ra, rb);
              const conv = finalized[t.id] ?? null;
              return (
                <tr
                  key={t.id}
                  className={`border-t border-slate-100 hover:bg-slate-50/80 ${conv ? "bg-emerald-50/60" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{trialNumber(t.id)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="flex items-center gap-1 max-w-[18rem]">
                      <span className="truncate" title={t.task}>
                        {t.task}
                      </span>
                      {t.agent_timeout_s != null && (
                        <span
                          className="shrink-0 rounded bg-rose-100 text-rose-700 px-1 py-0.5 text-[0.6rem] font-medium"
                          title={`Agent timed out${t.agent_timeout_s ? ` after ${t.agent_timeout_s}s` : ""}`}
                        >
                          ⏱ timeout
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {a && <DoneBadge name={a} done={annotatorDone(ra, t.presentation)} />}
                      {b && <DoneBadge name={b} done={annotatorDone(rb, t.presentation)} />}
                      {conv && (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[0.65rem] font-medium text-white"
                          title={`Converged${conv.by ? ` by ${conv.by}` : ""}${conv.at ? ` · ${new Date(conv.at).toLocaleDateString()}` : ""}`}
                        >
                          ✓ converged
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {ag.comparable === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span>
                        <span className="font-mono font-semibold text-slate-900">{formatPct(ag.pct)}</span>{" "}
                        <span className="text-xs text-slate-500">
                          {ag.matched}/{ag.comparable}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/annotate/review/${t.id}/`}
                      className="text-indigo-700 no-underline hover:underline text-xs"
                    >
                      compare →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
