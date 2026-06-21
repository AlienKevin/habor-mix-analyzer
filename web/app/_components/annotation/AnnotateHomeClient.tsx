"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnnotationPack } from "@/lib/annotation-types";
import {
  fetchStoreStatus,
  isTrialComplete,
  loadBundle,
  subscribeSyncState,
  type SyncState,
} from "@/lib/annotation-storage";
import { assignedAnnotators } from "@/lib/annotation-assignments";
import { annotatorDone, formatPct, reviewFor, trialAgreement } from "@/lib/annotation-review";
import { useAnnotatorBundles } from "./useAnnotatorBundles";

function syncLabel(state: SyncState): string {
  switch (state) {
    case "synced":
      return "Cloud saved";
    case "syncing":
      return "Saving…";
    case "error":
      return "Cloud save failed";
    case "no-token":
      return "Local only (no API token)";
    case "disabled":
      return "Local only";
    default:
      return "Local cache";
  }
}

function syncClass(state: SyncState): string {
  switch (state) {
    case "synced":
      return "bg-emerald-50 text-emerald-800";
    case "syncing":
      return "bg-sky-50 text-sky-800";
    case "error":
      return "bg-rose-50 text-rose-800";
    case "no-token":
      return "bg-amber-50 text-amber-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function AnnotateHomeClient({ pack }: { pack: AnnotationPack }) {
  const [syncState, setSyncState] = useState<SyncState>("idle");

  useEffect(() => {
    fetchStoreStatus();
    return subscribeSyncState(setSyncState);
  }, []);

  const { bundles: allBundles } = useAnnotatorBundles();
  const bundle = loadBundle();
  const doneCount = pack.trials.filter((t) =>
    isTrialComplete(
      bundle?.reviews[t.id],
      t.presentation.failure_modes.map((f) => f.id),
    ),
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Human annotation</h1>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl">{pack.instructions}</p>
        <p className="text-xs text-slate-500 mt-1">
          {pack.n_trials} trials · rubric {pack.rubric} · generated {new Date(pack.generated_at).toLocaleString()}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded bg-emerald-50 text-emerald-800 px-2 py-1">
          {doneCount}/{pack.n_trials} complete
        </span>
        <span className={`rounded px-2 py-1 text-xs ${syncClass(syncState)}`}>
          {syncLabel(syncState)}
        </span>
        <a
          href="/annotate/harbor-annotate-bundle.zip"
          download="harbor-annotate-bundle.zip"
          className="rounded border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50 no-underline"
          title="Harbor-format zip: every trial's task source + trajectory + verifier result + all 15 judge audits (composer + gpt + opus, k=5)"
        >
          Download all trials &amp; audits (zip)
        </a>
        <Link
          href="/annotate/review/"
          className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-indigo-700 hover:bg-indigo-100 no-underline"
        >
          Review dashboard →
        </Link>
      </div>

      <div className="border border-slate-200 rounded bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-[44rem]">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Trial</th>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Agent</th>
              <th className="px-3 py-2">Closeness</th>
              <th className="px-3 py-2">Modes</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Reviewers · agreement</th>
            </tr>
          </thead>
          <tbody>
            {pack.trials.map((t) => {
              const review = bundle?.reviews[t.id];
              const complete = isTrialComplete(
                review,
                t.presentation.failure_modes.map((f) => f.id),
              );
              return (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/annotate/${t.id}/`} className="no-underline text-indigo-700">
                      {t.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="flex items-center gap-1 max-w-[16rem]">
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
                  <td className="px-3 py-2 text-xs">{t.agent_model}</td>
                  <td className="px-3 py-2 font-mono text-xs">{t.presentation.closeness ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{t.presentation.failure_modes.length}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs rounded px-1.5 py-0.5 ${
                        complete ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {complete ? "done" : review ? "partial" : "todo"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const [a, b] = assignedAnnotators(t.id);
                      const ra = a ? reviewFor(allBundles[a] ?? null, t.id) : null;
                      const rb = b ? reviewFor(allBundles[b] ?? null, t.id) : null;
                      const ag = trialAgreement(t.presentation, ra, rb);
                      const badge = (name: string | undefined, r: typeof ra) =>
                        name ? (
                          <span
                            key={name}
                            className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[0.65rem] font-medium ${
                              annotatorDone(r, t.presentation)
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            <span
                              className={`inline-block h-1.5 w-1.5 rounded-full ${
                                annotatorDone(r, t.presentation) ? "bg-emerald-500" : "bg-rose-400"
                              }`}
                            />
                            {name}
                          </span>
                        ) : null;
                      return (
                        <Link href={`/annotate/review/${t.id}/`} className="no-underline inline-flex items-center gap-1.5 hover:opacity-80">
                          {badge(a, ra)}
                          {badge(b, rb)}
                          {ag.comparable > 0 && (
                            <span className="text-[0.65rem] font-mono text-slate-500">{formatPct(ag.pct)}</span>
                          )}
                        </Link>
                      );
                    })()}
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
