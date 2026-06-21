"use client";

import type { ArcVerifierOutput } from "@/lib/arc-agi-grid";
import ArcGrid from "./ArcGrid";

const VERDICT_STYLE: Record<ArcVerifierOutput["verdict"], string> = {
  correct: "bg-emerald-100 text-emerald-800 border-emerald-200",
  incorrect: "bg-rose-100 text-rose-800 border-rose-200",
  error: "bg-amber-100 text-amber-800 border-amber-200",
  unknown: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function ArcVerifierOutputView({ parsed }: { parsed: ArcVerifierOutput }) {
  const { verdict, headline, expectedDimensions, gotDimensions, expectedGrid, gotGrid, bodyText } =
    parsed;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-[0.65rem] font-semibold uppercase tracking-wide rounded border px-2 py-0.5 ${VERDICT_STYLE[verdict]}`}
        >
          {verdict}
        </span>
        <span className="text-xs text-slate-700">{headline}</span>
      </div>

      {(expectedDimensions || gotDimensions) && (
        <p className="text-[0.65rem] text-slate-500 font-mono">
          {expectedDimensions && <span>Expected dimensions: {expectedDimensions}</span>}
          {expectedDimensions && gotDimensions && <span className="mx-2">·</span>}
          {gotDimensions && <span>Got dimensions: {gotDimensions}</span>}
        </p>
      )}

      {expectedGrid || gotGrid ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {expectedGrid && <ArcGrid grid={expectedGrid} label="Expected" compact />}
          {gotGrid && <ArcGrid grid={gotGrid} label="Got" compact />}
        </div>
      ) : bodyText ? (
        <pre className="text-[0.65rem] whitespace-pre-wrap font-mono text-slate-800">{bodyText}</pre>
      ) : null}
    </div>
  );
}
