"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { InsightReport } from "@/lib/insight-data";
import { INSIGHT_STYLE, INSIGHT_SECTIONS } from "@/lib/insight-data";
import { trajectoryHasWorkspaceFiles } from "@/lib/trajectory-workspace";
import InstructionMarkdown from "@/app/_components/annotation/InstructionMarkdown";
import ResizableColumns from "@/app/_components/annotation/ResizableColumns";
import StepWorkspacePanel from "@/app/_components/annotation/StepWorkspacePanel";
import InsightAnnotate from "./InsightAnnotate";
import InsightTrajectoryViewer from "./InsightTrajectoryViewer";
import { useInsightTrajectory } from "./useInsightTrajectory";

const LAYOUT_KEY = "harbor-insight-detail-3pane-v1";

/** Single-auditor detail/audit page: the judge writeup + the auditor's own
 *  high/medium/low rating (left), the agent trajectory viewer — representative
 *  shown by default with a selector to browse the rest (middle), and a
 *  collapsed-by-default task workspace reconstructed from the selected trial (right). */
export default function InsightDetailClient({ report, assignee }: { report: InsightReport; assignee: string | null }) {
  const s = INSIGHT_STYLE[report.insightfulness];
  const traj = useInsightTrajectory(report.task_id);
  const steps = traj.steps;
  const showWorkspace = useMemo(() => trajectoryHasWorkspaceFiles(steps, [], undefined), [steps]);
  const lastStepIndex = steps.length ? steps[steps.length - 1].index : 0;

  const writeupPane = (
    <div className="h-[calc(100vh-9rem)] overflow-y-auto px-3 py-3 space-y-4">
      <section className="rounded-lg border-2 border-indigo-200 bg-indigo-50/40 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">TL;DR</h2>
        <div className="mt-1 insight-prose text-sm">
          <InstructionMarkdown content={report.tldr} />
        </div>
      </section>

      <InsightAnnotate taskId={report.task_id} judgeLevel={report.insightfulness} />

      <div className="space-y-4">
        {INSIGHT_SECTIONS.map(({ key, label }) => {
          const text = String(report[key] ?? "").trim();
          if (!text) return null;
          return (
            <section key={key} className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-800">{label}</h2>
              <div className="insight-prose text-slate-700">
                <InstructionMarkdown content={text} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );

  const workspacePane = showWorkspace && steps.length ? <StepWorkspacePanel steps={steps} stepIndex={lastStepIndex} /> : null;

  return (
    <div className="space-y-3">
      <header className="mx-auto max-w-5xl space-y-1.5">
        <Link href="/insightfulness/" className="text-xs text-indigo-600 no-underline hover:underline">← all insights</Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-sm font-bold ring-1 ${s.badge}`}>{s.label} insight</span>
          <h1 className="text-xl font-bold text-slate-900">{report.task_id}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded bg-slate-100 px-2 py-0.5">{report.benchmark}</span>
          {report.n_trials != null && <span className="rounded bg-slate-100 px-2 py-0.5">{report.n_trials} trials judged together</span>}
          {assignee && (
            <span className="rounded bg-violet-100 px-2 py-0.5 font-medium text-violet-800">assigned to {assignee}</span>
          )}
        </div>
      </header>

      {/* full-bleed: writeup + rating · trajectory · task workspace */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4">
        <div className="rounded border border-slate-200 bg-white">
          <ResizableColumns
            storageKey={LAYOUT_KEY}
            rightAvailable={Boolean(workspacePane)}
            defaultRightCollapsed
            rightLabel="Task workspace"
            left={writeupPane}
            middle={<InsightTrajectoryViewer traj={traj} />}
            right={workspacePane}
          />
        </div>
      </div>
    </div>
  );
}
