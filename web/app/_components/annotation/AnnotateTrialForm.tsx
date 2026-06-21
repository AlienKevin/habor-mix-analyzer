"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnnotationTrial, TrialReview, Verdict } from "@/lib/annotation-types";
import { isArcAgiTask } from "@/lib/arc-agi-grid";
import { normalizeModel } from "@/lib/model-names";
import {
  isTrialComplete,
  loadBundle,
  mergeReview,
  upsertReview,
} from "@/lib/annotation-storage";
import CitedTrajectoryReview from "./CitedTrajectoryReview";
import InstructionPanel from "./InstructionPanel";
import TaskBrokenPanel from "./TaskBrokenPanel";
import ExperimentBrokenPanel from "./ExperimentBrokenPanel";
import NonInstructionalPanel from "./NonInstructionalPanel";
import TestStdoutPanel from "./TestStdoutPanel";

export default function AnnotateTrialForm({
  trial,
  prevId,
  nextId,
  routePrefix = "/annotate",
  readOnly = false,
}: {
  trial: AnnotationTrial;
  prevId: string | null;
  nextId: string | null;
  /** Base path used for prev/next nav links. Defaults to /annotate; the
   *  tb3 viewer passes /tb3 so navigation stays inside its corpus. */
  routePrefix?: string;
  /** When true, hide the human-annotator review controls (closeness
   *  agree/disagree, failure-mode agree/disagree, cited-step nav arrows,
   *  notes, progress badge). The viewer becomes read-only. */
  readOnly?: boolean;
}) {
  const failureModeIds = useMemo(
    () => trial.presentation.failure_modes.map((f) => f.id),
    [trial.presentation.failure_modes],
  );

  const [review, setReview] = useState<TrialReview>(() =>
    mergeReview(loadBundle()?.reviews[trial.id], trial.id, failureModeIds),
  );

  useEffect(() => {
    setReview(mergeReview(loadBundle()?.reviews[trial.id], trial.id, failureModeIds));
  }, [trial.id, failureModeIds]);

  const persist = useCallback(
    (patch: Partial<TrialReview>) => {
      upsertReview(trial.id, patch);
      setReview(mergeReview(loadBundle()?.reviews[trial.id], trial.id, failureModeIds));
    },
    [trial.id, failureModeIds],
  );

  const setCloseness = (closeness: Verdict) => persist({ closeness });
  const setClosenessNote = (closeness_note: string) => persist({ closeness_note });
  const setTaskBroken = (task_broken: boolean) => persist({ task_broken });
  const setTaskBrokenNote = (task_broken_note: string) => persist({ task_broken_note });
  const setExperimentBroken = (experiment_broken: boolean) => persist({ experiment_broken });
  const setExperimentBrokenNote = (experiment_broken_note: string) => persist({ experiment_broken_note });
  const setNonInstructional = (non_instructional: boolean) => persist({ non_instructional });
  const setNonInstructionalNote = (non_instructional_note: string) => persist({ non_instructional_note });

  const setFailureMode = (fmId: string, patch: Partial<TrialReview["failure_modes"][number]>) => {
    const base = mergeReview(loadBundle()?.reviews[trial.id], trial.id, failureModeIds);
    const failure_modes = base.failure_modes.map((fm) =>
      fm.id === fmId ? { ...fm, ...patch } : fm,
    );
    persist({ failure_modes });
  };

  const p = trial.presentation;
  const renderArcGrids = isArcAgiTask(trial.task);
  const complete = isTrialComplete(review, failureModeIds);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500 font-mono">{trial.id}</div>
          <h1 className="text-xl font-semibold text-slate-900 mt-0.5">{trial.task}</h1>
          <p className="text-sm text-slate-600 mt-1 font-mono truncate max-w-xl">{trial.trial_id}</p>
          <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-600">
            <span className="rounded bg-slate-100 px-2 py-0.5">{trial.benchmark}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5">{trial.harness}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5">{normalizeModel(trial.agent_model || "")}</span>
            {trial.reward != null && (
              <span className="rounded bg-slate-100 px-2 py-0.5">reward {trial.reward}</span>
            )}
            {trial.agent_timeout_s != null && (
              <span
                className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 font-medium"
                title="The agent run was cut off by the Daytona agent timeout (AgentTimeoutError)"
              >
                ⏱ agent timed out{trial.agent_timeout_s ? ` · ${trial.agent_timeout_s}s` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {prevId && (
            <Link href={`${routePrefix}/${prevId}/`} className="rounded border border-slate-200 px-3 py-1.5 no-underline text-slate-700 hover:bg-white">
              ← Prev
            </Link>
          )}
          {nextId && (
            <Link href={`${routePrefix}/${nextId}/`} className="rounded border border-slate-200 px-3 py-1.5 no-underline text-slate-700 hover:bg-white">
              Next →
            </Link>
          )}
          {!readOnly && (
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                complete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {complete ? "Complete" : "In progress"}
            </span>
          )}
        </div>
      </div>

      <InstructionPanel
        slug={trial.slug}
        available={p.instruction_available ?? true}
        figureAvailable={p.figure_available}
        renderArcGrids={renderArcGrids}
      />

      {/* The three reviewer "report" panels are annotation controls — hide them
          entirely in read-only viewers (e.g. /tb3), where there's nothing to report. */}
      {!readOnly && (
        <>
          <TaskBrokenPanel
            checked={review.task_broken ?? false}
            note={review.task_broken_note ?? ""}
            onCheckedChange={setTaskBroken}
            onNoteChange={setTaskBrokenNote}
            readOnly={readOnly}
          />

          <ExperimentBrokenPanel
            checked={review.experiment_broken ?? false}
            note={review.experiment_broken_note ?? ""}
            onCheckedChange={setExperimentBroken}
            onNoteChange={setExperimentBrokenNote}
            readOnly={readOnly}
          />

          <NonInstructionalPanel
            checked={review.non_instructional ?? false}
            note={review.non_instructional_note ?? ""}
            onCheckedChange={setNonInstructional}
            onNoteChange={setNonInstructionalNote}
            readOnly={readOnly}
          />
        </>
      )}

      <TestStdoutPanel slug={trial.slug} available={p.test_stdout_available} task={trial.task} />

      {/* Full-bleed breakout: the 3-column trajectory viewer needs more room
          than the centered max-w-6xl page container. `body { overflow-x: clip }`
          (globals.css) clips the ~scrollbar-width overshoot from w-screen. The
          header/instruction/broken panels above stay centered. */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4">
        <CitedTrajectoryReview
          slug={trial.slug}
          presentation={p}
          review={review}
          onCloseness={setCloseness}
          onClosenessNote={setClosenessNote}
          onFailureMode={setFailureMode}
          renderArcGrids={renderArcGrids}
          showArcArtifacts={renderArcGrids}
          readOnly={readOnly}
          labelsDisabled={(review.task_broken ?? false) || (review.experiment_broken ?? false)}
          agentTimeoutS={trial.agent_timeout_s}
        />
      </div>
    </div>
  );
}
