"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrajectoryStepSummary } from "@/lib/annotation-types";
import {
  artifactCandidates,
  collectTreePaths,
  inferWorkdir,
  snapshotAtStep,
  treeStatusAtStep,
  type SeedFile,
} from "@/lib/trajectory-workspace";
import ArcArtifactPanel from "./ArcArtifactPanel";
import FileDiffView from "./FileDiffView";
import WorkspaceFileTree from "./WorkspaceFileTree";

export default function StepWorkspacePanel({
  steps,
  stepIndex,
  showArcArtifacts,
  seedFiles = [],
  workdirHint,
  workspaceAliases = [],
}: {
  steps: TrajectoryStepSummary[];
  stepIndex: number;
  showArcArtifacts?: boolean;
  seedFiles?: SeedFile[];
  workdirHint?: string;
  /** Dockerfile symlinks where the agent's /workspace/<name> path points at the
   *  real extracted root (e.g. /workspace/pandas-dev__pandas → /testbed). */
  workspaceAliases?: { link: string; target: string }[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const workdir = useMemo(() => inferWorkdir(steps, workdirHint), [steps, workdirHint]);

  const snapshot = useMemo(
    () => snapshotAtStep(steps, stepIndex, seedFiles, workdir),
    [steps, stepIndex, seedFiles, workdir],
  );

  const prevSnapshot = useMemo(
    () => (stepIndex > 0 ? snapshotAtStep(steps, stepIndex - 1, seedFiles, workdir) : null),
    [steps, stepIndex, seedFiles, workdir],
  );

  const paths = useMemo(() => collectTreePaths(snapshot), [snapshot]);

  const statusByPath = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const p of paths) out[p] = treeStatusAtStep(snapshot, p);
    return out;
  }, [paths, snapshot]);

  const artifacts = useMemo(
    () => (showArcArtifacts ? artifactCandidates(snapshot) : []),
    [showArcArtifacts, snapshot],
  );

  useEffect(() => {
    const changed = snapshot.changesAtStep.filter((c) => c.kind !== "deleted");
    if (changed.length > 0) setSelected(changed[0].path);
    else if (paths.length > 0 && !selected) setSelected(paths[paths.length - 1]);
  }, [stepIndex, snapshot.changesAtStep, paths, selected]);

  const selectedFile = selected ? snapshot.files.get(selected) : undefined;
  const prevFile = selected && prevSnapshot ? prevSnapshot.files.get(selected) : undefined;
  const isDeleted = snapshot.changesAtStep.some((c) => c.path === selected && c.kind === "deleted");

  const oldContent = prevFile?.content ?? "";
  const newContent = isDeleted ? "" : (selectedFile?.content ?? "");
  const showDiff =
    selected &&
    (snapshot.changesAtStep.some((c) => c.path === selected) ||
      (prevFile?.content !== undefined &&
        selectedFile?.content !== undefined &&
        prevFile.content !== selectedFile.content));

  const changeSummary =
    snapshot.changesAtStep.length === 0
      ? "No file changes at this step"
      : `${snapshot.changesAtStep.length} change${snapshot.changesAtStep.length === 1 ? "" : "s"} at this step`;

  const showChangesFooter =
    (showArcArtifacts && artifacts.length > 0) || snapshot.changesAtStep.length > 0;

  return (
    <div className="rounded border border-slate-200 bg-[#fafafa] overflow-hidden flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-slate-200 bg-white shrink-0">
        <h3 className="text-xs font-semibold text-slate-800">Workspace at step {stepIndex + 1}</h3>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Replay of writes/edits from tool calls · {changeSummary}
          <span className="font-mono"> · {workdir}</span>
        </p>
        {workspaceAliases.map((al) => (
          <p key={al.link} className="text-[10px] text-amber-700 mt-0.5">
            ⤷ <span className="font-mono">{al.target.replace(/^\//, "")}/</span> is the agent&rsquo;s{" "}
            <span className="font-mono">{al.link}</span> (symlink)
          </p>
        ))}
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="grid flex-1 min-h-0 grid-rows-[1fr_3fr]">
          {/* File tree — compact top quarter */}
          <div className="flex flex-col min-h-0 overflow-hidden border-b border-slate-200 bg-[#f3f3f3]">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200/80 bg-[#ececec] shrink-0">
              Files ({paths.length})
            </div>
            <div className="overflow-y-auto min-h-0 flex-1">
              {paths.length === 0 ? (
                <p className="px-2 py-3 text-[11px] text-slate-500 italic">No files written yet.</p>
              ) : (
                <WorkspaceFileTree
                  paths={paths}
                  selected={selected}
                  onSelect={setSelected}
                  statusByPath={statusByPath}
                />
              )}
            </div>
          </div>

          {/* File preview — remaining space */}
          <div className="flex flex-col min-h-0 overflow-hidden bg-white">
            <div className="shrink-0 flex items-center gap-1 border-b border-slate-100 px-2 py-1.5 bg-white">
              <span className="text-[10px] font-medium text-slate-600 truncate">
                {selected ? selected.split("/").pop() : "Preview"}
              </span>
              {selected && (
                <span className="text-[9px] text-slate-400 font-mono truncate hidden sm:inline">{selected}</span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {!selected ? (
                <p className="text-[11px] text-slate-500 italic px-1 py-2">Select a file to preview.</p>
              ) : isDeleted ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-rose-700 font-medium">Deleted at this step</p>
                  {prevFile?.content != null ? (
                    <FileDiffView
                      oldPath={selected}
                      newPath={selected}
                      oldContent={prevFile.content}
                      newContent=""
                    />
                  ) : (
                    <p className="text-[11px] text-slate-500 font-mono">{selected}</p>
                  )}
                </div>
              ) : showDiff && (oldContent || newContent) ? (
                <FileDiffView
                  oldPath={selected}
                  newPath={selected}
                  oldContent={oldContent}
                  newContent={newContent}
                />
              ) : selectedFile?.content != null ? (
                <pre className="text-[11px] whitespace-pre-wrap break-words font-mono text-slate-800 leading-relaxed">
                  {selectedFile.content}
                </pre>
              ) : (
                <p className="text-[11px] text-slate-500 italic px-1 py-2">
                  <code className="text-slate-600">{selected}</code> — path touched but content not captured in
                  trajectory.
                </p>
              )}
            </div>
          </div>
        </div>

        {showChangesFooter && (
          <div className="shrink-0 max-h-[9rem] overflow-y-auto bg-white border-t border-slate-200">
            {showArcArtifacts && artifacts.length > 0 ? (
              <div className="p-2">
                <ArcArtifactPanel artifacts={artifacts} />
              </div>
            ) : (
              <div className="p-2 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Changes</div>
                <ul className="space-y-0.5">
                  {snapshot.changesAtStep.map((c) => (
                    <li key={`${c.kind}-${c.path}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(c.path)}
                        className={`w-full text-left text-[11px] font-mono px-2 py-0.5 rounded hover:bg-slate-50 ${
                          selected === c.path ? "bg-indigo-50 text-indigo-900" : "text-slate-700"
                        }`}
                      >
                        <span
                          className={
                            c.kind === "created"
                              ? "text-emerald-600"
                              : c.kind === "deleted"
                                ? "text-rose-600"
                                : "text-amber-600"
                          }
                        >
                          {c.kind === "created" ? "+" : c.kind === "deleted" ? "−" : "~"}
                        </span>{" "}
                        {c.path}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
