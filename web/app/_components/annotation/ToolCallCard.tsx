"use client";

import { useState } from "react";
import ArcGridText from "./ArcGridText";
import { summarizeToolCall, toolBadgeLabel } from "@/lib/tool-call-display";

/** Keep full class strings here so Tailwind always emits them. */
const TOOL_BADGE_CLASS: Record<string, string> = {
  bash: "bg-slate-800 text-white",
  shell: "bg-slate-800 text-white",
  read: "bg-sky-700 text-white",
  write: "bg-emerald-700 text-white",
  edit: "bg-amber-700 text-white",
  grep: "bg-violet-700 text-white",
  glob: "bg-violet-600 text-white",
  todowrite: "bg-indigo-700 text-white",
};

function toolBadgeClass(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  return TOOL_BADGE_CLASS[key] ?? "bg-slate-600 text-white";
}

export default function ToolCallCard({
  name,
  args,
  output,
  outputTruncatedBytes,
  renderArcGrids,
  defaultExpanded,
}: {
  name: string;
  args: string;
  output?: string;
  outputTruncatedBytes?: number;
  renderArcGrids?: boolean;
  defaultExpanded?: boolean;
}) {
  const summary = summarizeToolCall(name, args);
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const isCommand = summary.detailKind === "command";
  const hasDetail = Boolean(summary.detail);
  const hasOutput = typeof output === "string" && output.length > 0;
  const hasLongDetail = hasDetail && (summary.isLong || !isCommand);
  const showToggle = hasOutput || hasLongDetail;
  const showFade = !expanded && showToggle;
  const showDetailLabel = expanded && hasDetail && hasOutput;
  const badge = toolBadgeLabel(name);

  return (
    <div className="rounded border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toolBadgeClass(badge)}`}
        >
          {badge}
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={`text-[11px] text-slate-800 leading-snug font-mono ${
              summary.isLong && !expanded ? "truncate" : "break-words"
            }`}
            title={summary.isLong && !expanded && summary.detail ? `$ ${summary.detail.replace(/\n+$/, "")}` : undefined}
          >
            {summary.headline}
          </p>
          {summary.meta && (
            <p className="mt-0.5 text-[10px] text-slate-400 font-sans">wait {summary.meta}</p>
          )}
        </div>
        {showToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {expanded ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {expanded && hasDetail && (
        <div
          className={
            isCommand
              ? "border-t border-slate-100 bg-slate-50/90 px-2.5 py-2 max-h-[min(28rem,55vh)] overflow-y-auto"
              : "border-t border-slate-100 bg-slate-50/80 px-2.5 py-2 max-h-48 overflow-y-auto"
          }
        >
          {showDetailLabel && (
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {isCommand ? "Command" : "Args"}
            </div>
          )}
          {renderArcGrids ? (
            <ArcGridText text={summary.detail!} compact />
          ) : isCommand ? (
            <pre className="text-[11px] whitespace-pre-wrap break-words font-mono text-slate-700 leading-relaxed">
              <span className="text-slate-400 select-none">$ </span>
              {summary.detail!.replace(/\n+$/, "")}
            </pre>
          ) : (
            <pre className="text-[10px] whitespace-pre-wrap break-all font-mono text-slate-600 leading-relaxed">
              {summary.detail}
            </pre>
          )}
        </div>
      )}
      {expanded && hasOutput && (
        <div className="border-t border-slate-100 bg-white px-2.5 py-2 max-h-[min(28rem,55vh)] overflow-y-auto">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Output</div>
          {renderArcGrids ? (
            <ArcGridText text={output!} compact />
          ) : (
            <pre className="text-[11px] whitespace-pre-wrap break-words font-mono text-slate-700 leading-relaxed">
              {output!.replace(/\n+$/, "")}
            </pre>
          )}
          {outputTruncatedBytes ? (
            <p className="mt-1 text-[10px] text-slate-500 italic">
              … {outputTruncatedBytes.toLocaleString()} more bytes truncated
            </p>
          ) : null}
        </div>
      )}
      {showFade && (
        <div className="h-3 border-t border-slate-100 bg-gradient-to-b from-slate-50/90 to-white pointer-events-none" />
      )}
    </div>
  );
}
