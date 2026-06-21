"use client";

import type { Verdict } from "@/lib/annotation-types";
import { VERDICT_LABELS } from "@/lib/annotation-storage";

const STYLES: Record<Verdict, string> = {
  agree: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  disagree: "bg-rose-100 text-rose-900 ring-rose-300",
};

export default function VerdictToggle({
  value,
  onChange,
  label,
  compact,
}: {
  value: Verdict | null;
  onChange: (v: Verdict) => void;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "inline-flex items-center gap-1" : "space-y-1"}>
      {label && !compact && <div className="text-xs font-medium text-slate-600">{label}</div>}
      <div className="inline-flex gap-1">
        {(Object.keys(VERDICT_LABELS) as Verdict[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`shrink-0 whitespace-nowrap rounded px-2 py-1 text-xs font-medium ring-1 transition ${
              value === v
                ? STYLES[v]
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {VERDICT_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}
