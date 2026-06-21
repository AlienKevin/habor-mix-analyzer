"use client";

import { useMemo, useState } from "react";
import type { AnnotationPack, GoldTrial } from "@/lib/annotation-types";
import { aggregateGold, parseBundleFiles } from "@/lib/annotation-gold";
import { VERDICT_LABELS } from "@/lib/annotation-storage";

function voteSummary(votes: Record<string, number>, consensus: string | null) {
  const parts = Object.entries(votes)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${VERDICT_LABELS[k as keyof typeof VERDICT_LABELS]}:${n}`);
  return `${consensus ?? "tie"} (${parts.join(", ")})`;
}

export default function AdminGoldPanel({ pack }: { pack: AnnotationPack }) {
  const [gold, setGold] = useState<GoldTrial[] | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!gold) return null;
    const withCloseness = gold.filter((g) => g.closeness.consensus).length;
    return { trials: gold.length, closenessConsensus: withCloseness };
  }, [gold]);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    try {
      const bundles = await parseBundleFiles([...list]);
      setFiles(bundles.map((b) => b.annotator));
      setGold(aggregateGold(pack, bundles));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setGold(null);
    }
  };

  const downloadGold = () => {
    if (!gold) return;
    const payload = {
      generated_at: new Date().toISOString(),
      annotators: files,
      rubric: pack.rubric,
      trials: gold,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "harbor-annotate-gold.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Aggregate gold labels</h1>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl">
          Upload exported annotation JSON files from multiple annotators. Majority vote picks a
          consensus label per trial (ties become null). Judge identity is not shown here.
        </p>
      </div>

      <div className="border border-slate-200 rounded bg-white p-4 space-y-3 max-w-xl">
        <label className="block text-sm font-medium text-slate-700">
          Annotator exports (multi-select)
          <input
            type="file"
            accept="application/json,.json"
            multiple
            className="mt-2 block w-full text-sm"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
        {files.length > 0 && (
          <p className="text-xs text-slate-600">Loaded: {files.join(", ")}</p>
        )}
        {error && <p className="text-xs text-rose-700">{error}</p>}
        {gold && (
          <button
            type="button"
            onClick={downloadGold}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            Download gold JSON
          </button>
        )}
      </div>

      {summary && (
        <p className="text-sm text-slate-600">
          {summary.trials} trials · closeness consensus on {summary.closenessConsensus} trials
        </p>
      )}

      {gold && (
        <div className="border border-slate-200 rounded bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-2 py-1.5">Trial</th>
                <th className="px-2 py-1.5">#Ann</th>
                <th className="px-2 py-1.5">Closeness gold</th>
                <th className="px-2 py-1.5">Failure modes</th>
              </tr>
            </thead>
            <tbody>
              {gold.map((g) => (
                <tr key={g.trial_key} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1.5 font-mono">{g.trial_key}</td>
                  <td className="px-2 py-1.5">{g.annotators}</td>
                  <td className="px-2 py-1.5">{voteSummary(g.closeness.votes, g.closeness.consensus)}</td>
                  <td className="px-2 py-1.5 space-y-1">
                    {g.failure_modes.map((fm) => (
                      <div key={fm.id}>
                        <span className="font-mono text-slate-500">{fm.id}</span>
                        <div className="pl-2 text-slate-600">
                          {voteSummary(fm.overall.votes, fm.overall.consensus)}
                        </div>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
