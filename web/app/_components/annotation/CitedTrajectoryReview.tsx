"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnnotationTrial,
  FacetKey,
  PresentedFailureMode,
  TrialReview,
  TrajectorySummary,
  Verdict,
} from "@/lib/annotation-types";
import {
  buildLabelNumbers,
  buildTrajectorySegments,
  citedSpan,
  closenessAtStep,
  failureModesAtStep,
  fullTrajectoryDisplayIndices,
  isCitedStep,
  nearestCitedStep,
  stepLabelCount,
  stepReviewStatus,
  stepSubcodes,
  uncitedStepHint,
  type StepReviewStatus,
} from "@/lib/annotation-cited-steps";
import { aftCodeColor } from "@/lib/aft-codes";
import { contrastTextOn } from "@/lib/colors";
import AftCodeBadge from "./AftCodeBadge";
import ResizableColumns from "./ResizableColumns";
import StepContent from "./StepContent";
import StepWorkspacePanel from "./StepWorkspacePanel";
import VerdictToggle from "./VerdictToggle";
import { useActiveStepIndex } from "./useActiveStepIndex";
import { trajectoryHasWorkspaceFiles } from "@/lib/trajectory-workspace";
import { loadFilesystemSeeds, resolveWorkspaceRoot } from "@/lib/task-filesystem";
import type { TaskFilesystem } from "@/lib/annotation-types";
import type { SeedFile } from "@/lib/trajectory-workspace";

const FACETS: FacetKey[] = ["A", "B", "C", "D"];

/** Compact wall-clock duration, e.g. 23s · 1m 44s · 8m 48s · 1h 5m. */
function fmtDur(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function LabelNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center rounded bg-slate-800 px-1.5 py-0.5 text-[0.65rem] font-mono font-semibold text-white shrink-0">
      Label {n}
    </span>
  );
}

/** Compact code-pill (no facet label / title) for the step list strip. */
function CodeChip({ code }: { code: string }) {
  const bg = aftCodeColor(code);
  const fg = contrastTextOn(bg);
  return (
    <span
      className="inline-block px-1 rounded font-mono text-[0.6rem] font-semibold border"
      style={{ background: bg, color: fg, borderColor: `${fg}33` }}
    >
      {code}
    </span>
  );
}

function StatusDot({ status }: { status: StepReviewStatus }) {
  const cls =
    status === "reviewed"
      ? "bg-emerald-500"
      : status === "partial"
        ? "bg-amber-400"
        : "bg-rose-400";
  const label =
    status === "reviewed" ? "all labels reviewed" : status === "partial" ? "partially reviewed" : "not reviewed";
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls}`} title={label} aria-label={label} />;
}

function ClosenessLabelBlock({
  labelNum,
  presentation,
  review,
  onCloseness,
  onClosenessNote,
  readOnly = false,
}: {
  labelNum: number;
  presentation: AnnotationTrial["presentation"];
  review: TrialReview;
  onCloseness: (v: Verdict) => void;
  onClosenessNote: (note: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3 space-y-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <LabelNumber n={labelNum} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Closeness</span>
      </div>
      <div className="font-mono text-sm font-medium text-slate-900">{presentation.closeness ?? "—"}</div>
      {presentation.headline && (
        <p className="text-xs text-slate-700 leading-relaxed">{presentation.headline}</p>
      )}
      {!readOnly && (
        <>
          <VerdictToggle
            value={review.closeness}
            onChange={onCloseness}
            label="Agree with this closeness label?"
          />
          <textarea
            value={review.closeness_note}
            onChange={(e) => onClosenessNote(e.target.value)}
            placeholder="Optional note on closeness…"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs min-h-[2.5rem]"
          />
        </>
      )}
    </div>
  );
}

function FailureModeLabelBlock({
  labelNum,
  fm,
  fmReview,
  onFailureMode,
  onJumpToStep,
  readOnly = false,
}: {
  labelNum: number;
  fm: PresentedFailureMode;
  fmReview: TrialReview["failure_modes"][number];
  onFailureMode: (fmId: string, patch: Partial<TrialReview["failure_modes"][number]>) => void;
  onJumpToStep: (stepIndex: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3 space-y-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <LabelNumber n={labelNum} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Failure mode</span>
        <span className="text-sm font-semibold text-slate-900">{fm.name}</span>
      </div>
      {fm.step_indices.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">cited at</span>
          {fm.step_indices.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onJumpToStep(s)}
              className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-mono font-semibold text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-100 hover:ring-indigo-300 active:bg-indigo-200"
              title={`Jump to step ${s + 1}`}
            >
              Step {s + 1}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-700 leading-relaxed">{fm.description}</p>
      {fm.evidence_quote && (
        <pre className="text-[0.65rem] bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">
          &ldquo;{fm.evidence_quote}&rdquo;
        </pre>
      )}
      <div className="flex flex-col gap-y-1.5 border-t border-slate-100 pt-2">
        {FACETS.map((f) => (
          <AftCodeBadge key={f} facet={f} code={fm.aft[f]} />
        ))}
      </div>
      {!readOnly && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-600">Agree with this failure-mode label?</div>
          <VerdictToggle value={fmReview.overall} onChange={(v) => onFailureMode(fm.id, { overall: v })} compact />
        </div>
      )}
      {!readOnly && (
        <textarea
          value={fmReview.note}
          onChange={(e) => onFailureMode(fm.id, { note: e.target.value })}
          placeholder="Optional note on this failure mode…"
          className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs min-h-[2.5rem]"
        />
      )}
    </div>
  );
}

/** Sticky clickable strip for a cited step in the left (master) column:
 *  status dot + Step N + label count + C-subcode chips + fold caret. */
function CitedStepHeader({
  stepIndex,
  count,
  subcodes,
  status,
  selected,
  folded,
  foldable,
  readOnly,
  durMs,
  onSelect,
  onToggleFold,
}: {
  stepIndex: number;
  count: number;
  subcodes: string[];
  status: StepReviewStatus;
  selected: boolean;
  folded: boolean;
  foldable: boolean;
  readOnly: boolean;
  durMs?: number | null;
  onSelect: () => void;
  onToggleFold: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`lg:sticky lg:top-2 z-[5] flex items-center gap-2 px-4 py-2 cursor-pointer backdrop-blur-sm border-b shadow-sm transition-colors ${
        selected
          ? "bg-indigo-50/95 border-indigo-200"
          : "bg-white/95 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {!readOnly && <StatusDot status={status} />}
      <span className="font-mono text-sm font-semibold text-slate-900">Step {stepIndex + 1}</span>
      <span className="text-[0.6rem] rounded bg-slate-800 text-white px-1.5 py-0.5 font-medium">
        {count} label{count === 1 ? "" : "s"}
      </span>
      <span className="flex flex-wrap items-center gap-1 min-w-0">
        {subcodes.map((c) => (
          <CodeChip key={c} code={c} />
        ))}
      </span>
      {durMs != null && (
        <span
          className={`shrink-0 rounded px-1 py-0.5 text-[0.6rem] font-mono font-medium ${
            durMs >= 60000 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"
          }`}
          title={`This step took ${fmtDur(durMs)}`}
        >
          {fmtDur(durMs)}
        </span>
      )}
      {selected && <span className="ml-auto text-[0.6rem] font-medium text-indigo-600 shrink-0">▶ shown</span>}
      {foldable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFold();
          }}
          className={`text-slate-400 hover:text-slate-700 text-xs shrink-0 ${selected ? "" : "ml-auto"}`}
          title={folded ? "Expand step" : "Collapse step"}
        >
          {folded ? "›" : "⌄"}
        </button>
      )}
    </div>
  );
}

export default function CitedTrajectoryReview({
  slug,
  presentation,
  review,
  onCloseness,
  onClosenessNote,
  onFailureMode,
  renderArcGrids,
  showArcArtifacts,
  readOnly = false,
  labelsDisabled = false,
  agentTimeoutS = null,
}: {
  slug: string;
  presentation: AnnotationTrial["presentation"];
  review: TrialReview;
  onCloseness: (v: Verdict) => void;
  onClosenessNote: (note: string) => void;
  onFailureMode: (fmId: string, patch: Partial<TrialReview["failure_modes"][number]>) => void;
  renderArcGrids?: boolean;
  showArcArtifacts?: boolean;
  /** Seconds at which the Daytona agent-timeout cut the run off, if it timed
   *  out — marks the run-clock as ending in a timeout. null = ran to completion. */
  agentTimeoutS?: number | null;
  /** Hide reviewer controls (agree/disagree toggles, notes, status dots,
   *  folding). Used by the tb3 viewer to render report-only mode. */
  readOnly?: boolean;
  /** Grey out + lock the failure-label detail panel while keeping the
   *  trajectory readable. Set when the annotator flagged the task broken. */
  labelsDisabled?: boolean;
}) {
  const [data, setData] = useState<TrajectorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seedFiles, setSeedFiles] = useState<SeedFile[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | undefined>(undefined);
  const [workspaceAliases, setWorkspaceAliases] = useState<{ link: string; target: string }[]>([]);
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<number>>(new Set());

  // On mobile the labels render as a sticky sheet over the top of the viewport.
  // Measure its height so the active-step observation band starts *below* it —
  // otherwise the step hidden behind the sheet (not the first visible one)
  // drives the labels, forcing the annotator to scroll a step past the top.
  const middleRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [sheetTopPct, setSheetTopPct] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isNarrow) {
      setSheetTopPct(0);
      return;
    }
    const measure = () => {
      const el = middleRef.current;
      if (!el || window.innerHeight === 0) return;
      // Round to 4% buckets so small label-height changes don't thrash the
      // observer (which would re-pick the active step on every settle).
      const pct = Math.round((el.getBoundingClientRect().height / window.innerHeight) * 25) * 4;
      setSheetTopPct((prev) => (prev !== pct ? pct : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (middleRef.current) ro.observe(middleRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // `data` re-runs this after the trajectory (and thus the sheet) mounts, so
    // the ResizeObserver attaches to the real sheet instead of a null ref.
  }, [isNarrow, data]);

  const activeRootMargin = isNarrow
    ? `-${Math.min(60, Math.max(8, sheetTopPct))}% 0px -6% 0px`
    : "-8% 0px -45% 0px";

  useEffect(() => {
    fetch(`/annotate/trials/${slug}/trajectory.summary.json`)
      .then((r) => {
        if (!r.ok) throw new Error("Trajectory not available");
        return r.json();
      })
      .then((raw: TrajectorySummary) => {
        // Hide content-block-separator steps entirely — they carry no payload
        // (see TrajectoryStepSummary.kind). Surviving step indices are
        // unchanged, so judge step citations still resolve.
        setData({
          ...raw,
          steps: (raw.steps ?? []).filter((s) => s.kind !== "tool_use_block_separator"),
        });
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [slug]);

  // Honor a #step-N deep-link (e.g. from the /tb3 reward-hacking section). Steps
  // load async, so retry briefly until the anchor exists, then scroll to it.
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const hash = window.location.hash;
    if (!/^#step-\d+$/.test(hash)) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tryScroll = () => {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
      if (tries++ < 40) timer = setTimeout(tryScroll, 100);
    };
    tryScroll();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const reset = () => {
      setSeedFiles([]);
      setWorkspaceRoot(undefined);
      setWorkspaceAliases([]);
    };
    if (!presentation.filesystem_available) {
      reset();
      return;
    }
    let cancelled = false;
    const assetBase = `/annotate/trials/${slug}`;
    fetch(`${assetBase}/filesystem.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (manifest: TaskFilesystem | null) => {
        if (cancelled) return;
        if (!manifest) {
          reset();
          return;
        }
        setWorkspaceRoot(resolveWorkspaceRoot(manifest));
        setWorkspaceAliases(manifest.workspace_aliases ?? []);
        const seeds = await loadFilesystemSeeds(manifest, assetBase);
        if (!cancelled) setSeedFiles(seeds);
      })
      .catch(() => {
        if (!cancelled) reset();
      });
    return () => {
      cancelled = true;
    };
  }, [slug, presentation.filesystem_available]);

  const displaySteps = useMemo(() => {
    if (!data?.steps.length) return [];
    const maxIndex = Math.max(...data.steps.map((s) => s.index));
    return fullTrajectoryDisplayIndices(maxIndex + 1);
  }, [data]);
  const span = useMemo(() => citedSpan(presentation), [presentation]);
  const segments = useMemo(
    () => buildTrajectorySegments(presentation, displaySteps),
    [presentation, displaySteps],
  );
  const labelNums = useMemo(() => buildLabelNumbers(presentation), [presentation]);

  const [layoutTick, setLayoutTick] = useState(0);
  const { activeStepIndex, setStepRef } = useActiveStepIndex(
    displaySteps,
    displaySteps[0] ?? 0,
    layoutTick,
    activeRootMargin,
  );

  // Clicking a step pins its labels directly. The scroll → IntersectionObserver
  // path alone is unreliable: a clicked step scrolled to the top lands ABOVE the
  // active band, so a neighbour would otherwise drive the panel (e.g. "click
  // step 50, its labels don't show"). A real user scroll (wheel/touch) releases
  // the pin so the panel follows the viewport again.
  const [pinnedStep, setPinnedStep] = useState<number | null>(null);
  const pinnedAtRef = useRef(0);
  const pinStep = useCallback((i: number) => {
    pinnedAtRef.current = performance.now();
    setPinnedStep(i);
  }, []);
  useEffect(() => {
    // A genuine user scroll releases the pin; ignore events in a short grace
    // window after a click (the programmatic scroll + any tap jitter).
    const release = () => {
      if (performance.now() - pinnedAtRef.current > 250) setPinnedStep(null);
    };
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    return () => {
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
    };
  }, []);

  // Scrolling over the labels panel must NOT move the left steps column. The
  // panel usually doesn't overflow, so the wheel would otherwise chain to the
  // window and scroll the page (`overscroll-contain` only covers the
  // overflowing/at-boundary case). Absorb the wheel when the panel can't scroll
  // further, and keep it isolated (stopPropagation) so the panel owns the
  // gesture and the pinned step is preserved.
  useEffect(() => {
    const el = middleRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      const canScroll = el.scrollHeight > el.clientHeight + 1;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (!canScroll || (e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [data]);

  // The detail (middle) panel follows the pinned step (just clicked) if any,
  // else the cited step nearest the in-view step — so scrolling keeps it synced
  // and it never blanks on context steps.
  const selectedStep = useMemo(
    () => nearestCitedStep(presentation, pinnedStep ?? activeStepIndex),
    [presentation, pinnedStep, activeStepIndex],
  );

  const stepEls = useRef(new Map<number, HTMLElement>());
  const setRef = useCallback(
    (i: number, el: HTMLElement | null) => {
      setStepRef(i, el);
      if (el) stepEls.current.set(i, el);
      else stepEls.current.delete(i);
    },
    [setStepRef],
  );
  const scrollToStep = useCallback((i: number) => {
    const el = stepEls.current.get(i) ?? document.querySelector(`[data-step-index="${i}"]`);
    if (!(el instanceof HTMLElement)) return;
    let target = window.scrollY + el.getBoundingClientRect().top - 16; // step ~to top
    // Don't over-scroll past where the sticky label panel would lose its top
    // (clicking a step near the end otherwise slams to the bottom and clips the
    // panel): clamp to the last position where the panel still fits below top-4.
    const panel = middleRef.current;
    const col = panel?.parentElement;
    if (panel && col) {
      const colBottom = window.scrollY + col.getBoundingClientRect().bottom;
      const maxScroll = colBottom - panel.offsetHeight - 16;
      if (Number.isFinite(maxScroll) && maxScroll > 0) target = Math.min(target, maxScroll);
    }
    window.scrollTo({ top: Math.max(0, target) });
  }, []);

  const toggleFold = useCallback((i: number) => {
    setManuallyExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  // Selecting a folded (finished) step also reveals its turn content, so a
  // single click shows both the step body and its labels. The caret stays the
  // explicit collapse control.
  const expandStep = useCallback((i: number) => {
    setManuallyExpanded((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }, []);

  const stepsByIndex = useMemo(() => {
    const m = new Map<number, TrajectorySummary["steps"][number]>();
    for (const s of data?.steps ?? []) m.set(s.index, s);
    return m;
  }, [data]);

  const showWorkspace = useMemo(
    () => (data?.steps ? trajectoryHasWorkspaceFiles(data.steps, seedFiles, workspaceRoot) : false),
    [data, seedFiles, workspaceRoot],
  );

  if (error) {
    return <p className="text-sm text-rose-700 border border-rose-200 rounded bg-rose-50 p-3">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-500 border border-slate-200 rounded bg-white p-3">Loading trajectory…</p>;
  }
  if (displaySteps.length === 0) {
    return (
      <p className="text-sm text-slate-500 border border-slate-200 rounded bg-white p-3 italic">
        No cited steps in this audit (nothing to show in the trajectory).
      </p>
    );
  }

  const citedCount = displaySteps.filter((i) => isCitedStep(presentation, i)).length;
  const contextCount = displaySteps.length - citedCount;

  // ----- LEFT: trajectory steps (master) -----
  const leftPane = (
    <div className="divide-y divide-slate-200">
      {segments.map((segment) => {
        if (segment.kind === "context") {
          const { from, to, zone } = segment;
          const count = to - from + 1;
          const rangeLabel = from === to ? `Step ${from + 1}` : `Steps ${from + 1}–${to + 1}`;
          return (
            <details
              key={`ctx-${from}-${to}`}
              className="group"
              onToggle={() => requestAnimationFrame(() => setLayoutTick((t) => t + 1))}
            >
              <summary className="cursor-pointer list-none px-4 py-2.5 bg-slate-100/90 hover:bg-slate-100 border-l-4 border-slate-300 select-none">
                <span className="font-mono text-sm text-slate-700">
                  {rangeLabel}
                  <span className="text-xs text-slate-500 ml-2">
                    · {uncitedStepHint(zone)} · {count} step{count === 1 ? "" : "s"} (expand)
                  </span>
                </span>
              </summary>
              <div className="divide-y divide-slate-200">
                {Array.from({ length: count }, (_, k) => from + k).map((stepIndex) => (
                  <article
                    key={stepIndex}
                    id={`step-${stepIndex + 1}`}
                    ref={(el) => setRef(stepIndex, el)}
                    data-step-index={stepIndex}
                    className="scroll-mt-4 p-4"
                  >
                    <div className="font-mono text-xs font-semibold text-slate-500 mb-1">Step {stepIndex + 1}</div>
                    <StepContent step={stepsByIndex.get(stepIndex)} stepIndex={stepIndex} renderArcGrids={renderArcGrids} compact />
                  </article>
                ))}
              </div>
            </details>
          );
        }

        const stepIndex = segment.stepIndex;
        const status: StepReviewStatus = readOnly ? "none" : stepReviewStatus(presentation, review, stepIndex);
        const foldable = !readOnly && status === "reviewed";
        const folded = foldable && !manuallyExpanded.has(stepIndex);
        const selected = selectedStep === stepIndex;
        return (
          <article
            key={stepIndex}
            id={`step-${stepIndex + 1}`}
            ref={(el) => setRef(stepIndex, el)}
            data-step-index={stepIndex}
            className={`scroll-mt-4 ${selected ? "bg-indigo-50/30" : ""}`}
          >
            <CitedStepHeader
              stepIndex={stepIndex}
              count={stepLabelCount(presentation, stepIndex)}
              subcodes={stepSubcodes(presentation, stepIndex)}
              status={status}
              durMs={stepsByIndex.get(stepIndex)?.dur_ms ?? null}
              selected={selected}
              folded={folded}
              foldable={foldable}
              readOnly={readOnly}
              onSelect={() => {
                if (foldable) expandStep(stepIndex);
                setPinnedStep(stepIndex);
                scrollToStep(stepIndex);
              }}
              onToggleFold={() => toggleFold(stepIndex)}
            />
            {!folded && (
              <div className="p-4">
                <StepContent step={stepsByIndex.get(stepIndex)} stepIndex={stepIndex} renderArcGrids={renderArcGrids} compact />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );

  // ----- MIDDLE: failure-label detail for the selected step (sticky) -----
  const selectedCount = selectedStep == null ? 0 : stepLabelCount(presentation, selectedStep);
  // Run-clock position of the in-view step (drives the timeline + "time left").
  const totalMs = data.total_ms ?? null;
  const activeElapsedMs = stepsByIndex.get(activeStepIndex)?.elapsed_ms ?? null;
  const elapsedMs = activeElapsedMs ?? 0;
  const timelinePct = totalMs ? Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100)) : 0;
  const middlePane = (
    <div ref={middleRef} className="sticky top-0 z-30 max-h-[46vh] overflow-y-auto overscroll-contain border-b border-slate-200 bg-white px-3 py-3 space-y-3 shadow-sm lg:top-4 lg:z-auto lg:max-h-none lg:h-[calc(100vh-2rem)] lg:border-b-0 lg:border-l lg:shadow-none">
      {selectedStep == null ? (
        <p className="text-sm text-slate-500 italic">No labeled steps in this audit.</p>
      ) : (
        <>
          <div className="text-xs text-slate-500">
            Labels for{" "}
            <span className="font-mono font-semibold text-slate-800">Step {selectedStep + 1}</span>
            {" — "}
            {selectedCount} label{selectedCount === 1 ? "" : "s"}
          </div>
          {totalMs != null && activeElapsedMs != null && (
            <div
              className={`rounded border px-2 py-1.5 ${
                agentTimeoutS != null ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between text-[0.65rem] font-mono text-slate-500">
                <span>⏱ {fmtDur(elapsedMs)} in</span>
                <span>
                  {fmtDur(totalMs - elapsedMs)} left · {fmtDur(totalMs)} total
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded bg-slate-200">
                <div
                  className={`h-full transition-all ${agentTimeoutS != null ? "bg-rose-400" : "bg-indigo-400"}`}
                  style={{ width: `${timelinePct}%` }}
                />
              </div>
              {agentTimeoutS != null && (
                <div className="mt-1 flex items-center gap-1 text-[0.6rem] font-medium text-rose-700">
                  ⏱ agent timed out{agentTimeoutS ? ` · ${fmtDur(agentTimeoutS * 1000)} limit` : ""}
                </div>
              )}
            </div>
          )}
          <div
            className={
              labelsDisabled
                ? "opacity-40 pointer-events-none select-none space-y-3"
                : "space-y-3"
            }
            aria-disabled={labelsDisabled || undefined}
            title={labelsDisabled ? "Task flagged as broken — failure-mode review is inactive" : undefined}
          >
            {closenessAtStep(presentation, selectedStep) && labelNums.closeness != null && (
              <ClosenessLabelBlock
                labelNum={labelNums.closeness}
                presentation={presentation}
                review={review}
                onCloseness={onCloseness}
                onClosenessNote={onClosenessNote}
                readOnly={readOnly}
              />
            )}
            {failureModesAtStep(presentation, selectedStep).map((fm) => {
              const labelNum = labelNums.failureModes.get(fm.id);
              const fmReview = review.failure_modes.find((r) => r.id === fm.id);
              if (labelNum == null || !fmReview) return null;
              return (
                <FailureModeLabelBlock
                  key={fm.id}
                  labelNum={labelNum}
                  fm={fm}
                  fmReview={fmReview}
                  onFailureMode={onFailureMode}
                  onJumpToStep={(i) => {
                    setPinnedStep(i);
                    scrollToStep(i);
                  }}
                  readOnly={readOnly}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <section className="border border-slate-200 rounded bg-white">
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 rounded-t">
        <h2 className="text-sm font-semibold text-slate-900">Full trajectory</h2>
        <p className="text-xs text-slate-600 mt-0.5">
          {displaySteps.length} step{displaySteps.length === 1 ? "" : "s"} total · {citedCount} with audit
          labels · {contextCount} collapsed for context
          {totalMs != null ? ` · ${fmtDur(totalMs)} run time` : ""}
          {span ? ` · cited span steps ${span.first + 1}–${span.last + 1}` : ""}. Click a step to
          open its turn content and see its failure labels; scrolling keeps them in sync.
          {showWorkspace && " The task directory expands on demand."}
        </p>
      </div>

      <ResizableColumns
        rightAvailable={showWorkspace}
        rightLabel="Task dir"
        left={leftPane}
        middle={middlePane}
        right={
          showWorkspace ? (
            <StepWorkspacePanel
              steps={data.steps}
              stepIndex={activeStepIndex}
              showArcArtifacts={showArcArtifacts}
              seedFiles={seedFiles}
              workdirHint={workspaceRoot}
              workspaceAliases={workspaceAliases}
            />
          ) : null
        }
      />
    </section>
  );
}
