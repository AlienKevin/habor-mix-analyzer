"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnnotationTrial,
  TaskFilesystem,
  TrajectorySummary,
  TrialReview,
  Verdict,
} from "@/lib/annotation-types";
import { assignedAnnotators } from "@/lib/annotation-assignments";
import { annotatorDone, formatPct, reviewFor, trialAgreement } from "@/lib/annotation-review";
import type { AdjudicationRecord } from "@/lib/adjudication-types";
import { emptyAdjudication } from "@/lib/adjudication-types";
import { pullAdjudication, pushAdjudication } from "@/lib/adjudication-sync";
import { loadFilesystemSeeds, resolveWorkspaceRoot } from "@/lib/task-filesystem";
import type { SeedFile } from "@/lib/trajectory-workspace";
import AftCodeBadge from "./AftCodeBadge";
import VerdictToggle from "./VerdictToggle";
import ResizableColumns from "./ResizableColumns";
import StepContent from "./StepContent";
import StepWorkspacePanel from "./StepWorkspacePanel";
import { useAnnotateSession } from "./AnnotateSessionContext";
import { useAnnotatorBundles } from "./useAnnotatorBundles";

const FACETS = ["A", "B", "C", "D"] as const;
const GENERAL = "__general";
const LAYOUT_KEY = "harbor-review-3pane-v1";

type LabelRow =
  | { key: "closeness"; kind: "closeness"; name: string }
  | { key: string; kind: "fm"; name: string; fm: AnnotationTrial["presentation"]["failure_modes"][number] };

function verdictOf(review: TrialReview | null, row: LabelRow): Verdict | null {
  if (row.kind === "closeness") return review?.closeness ?? null;
  return review?.failure_modes.find((r) => r.id === row.key)?.overall ?? null;
}
function noteOf(review: TrialReview | null, row: LabelRow): string {
  if (row.kind === "closeness") return review?.closeness_note ?? "";
  return review?.failure_modes.find((r) => r.id === row.key)?.note ?? "";
}

function VerdictPill({ v }: { v: Verdict | null }) {
  if (v == null) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
        v === "agree" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
      }`}
    >
      {v}
    </span>
  );
}

/** One bubble in a label's comment thread — reused for the reviewers' seeded
 *  annotation notes, posted discussion messages, and task-broken flags. */
function CommentBubble({
  author,
  text,
  when,
  tag,
  tone = "msg",
}: {
  author: string;
  text: string;
  when?: string;
  tag?: string;
  tone?: "msg" | "seed" | "broken";
}) {
  const box =
    tone === "broken"
      ? "border-amber-200 bg-amber-50"
      : tone === "seed"
        ? "border-slate-200 bg-slate-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded border ${box} px-2 py-1`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.7rem] font-semibold text-slate-800">
          {author}
          {tag && (
            <span className="ml-1 rounded bg-slate-200 px-1 text-[0.5rem] font-medium uppercase tracking-wide text-slate-500">
              {tag}
            </span>
          )}
        </span>
        {when && <span className="text-[0.55rem] text-slate-400">{when}</span>}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-snug text-slate-700">{text}</p>
    </div>
  );
}

/** Merge a freshly-polled remote adjudication record into the local one for live
 *  updates: always union the message threads (so others' new comments appear),
 *  and adopt the remote converged/finalized state only when it's strictly newer
 *  and the local user isn't mid-save or mid-note-edit (so we never clobber an
 *  in-progress edit). Messages are keyed by author|ts|label|text and ts-sorted. */
function mergeAdjudication(
  local: AdjudicationRecord,
  remote: AdjudicationRecord,
  opts: { noteEditing: boolean; saving: boolean },
): AdjudicationRecord {
  const seen = new Set<string>();
  const messages = [...(remote.messages ?? []), ...(local.messages ?? [])]
    .filter((m) => {
      const k = `${m.author}|${m.ts}|${m.label ?? ""}|${m.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const remoteNewer = (remote.updated_at ?? "") > (local.updated_at ?? "");
  if (opts.saving || !remoteNewer) return { ...local, messages };
  return {
    ...remote,
    messages,
    converged: { ...remote.converged, note: opts.noteEditing ? local.converged.note : remote.converged.note },
  };
}

/** Converged yes/ok toggle (mirrors VerdictToggle) for the task-quality flags. */
function BrokenToggle({
  value,
  onChange,
  trueLabel = "broken",
  falseLabel = "ok",
  tone = "amber",
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  trueLabel?: string;
  falseLabel?: string;
  tone?: "amber" | "rose" | "violet";
}) {
  const onClass = tone === "rose" ? "bg-rose-500" : tone === "violet" ? "bg-violet-500" : "bg-amber-500";
  return (
    <span className="inline-flex overflow-hidden rounded border border-slate-200 text-xs">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-2 py-0.5 ${value === true ? `${onClass} text-white` : "bg-white text-slate-600 hover:bg-slate-50"}`}
      >
        {trueLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`border-l border-slate-200 px-2 py-0.5 ${value === false ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
      >
        {falseLabel}
      </button>
    </span>
  );
}

export default function ReviewCompareClient({ trial }: { trial: AnnotationTrial }) {
  const { annotator: me } = useAnnotateSession();
  const { bundles, loading, tokenState } = useAnnotatorBundles();
  const [a, b] = assignedAnnotators(trial.id);
  const reviewA = a ? reviewFor(bundles[a] ?? null, trial.id) : null;
  const reviewB = b ? reviewFor(bundles[b] ?? null, trial.id) : null;

  const presentation = trial.presentation;
  const labels = useMemo<LabelRow[]>(() => {
    const rows: LabelRow[] = [{ key: "closeness", kind: "closeness", name: "Closeness" }];
    for (const fm of presentation.failure_modes) {
      rows.push({ key: fm.id, kind: "fm", name: fm.name || fm.id, fm });
    }
    return rows;
  }, [presentation]);

  const agreement = useMemo(
    () => trialAgreement(presentation, reviewA, reviewB),
    [presentation, reviewA, reviewB],
  );

  // ----- transcript (left) + workspace (right) -----
  const [data, setData] = useState<TrajectorySummary | null>(null);
  const [seedFiles, setSeedFiles] = useState<SeedFile[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | undefined>(undefined);
  const [workspaceAliases, setWorkspaceAliases] = useState<{ link: string; target: string }[]>([]);
  const [selectedStep, setSelectedStep] = useState(0);
  const leftRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch(`/annotate/trials/${trial.slug}/trajectory.summary.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: TrajectorySummary | null) => {
        if (cancelled || !raw) return;
        setData({
          ...raw,
          steps: (raw.steps ?? []).filter((s) => s.kind !== "tool_use_block_separator"),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trial.slug]);

  useEffect(() => {
    if (!presentation.filesystem_available) {
      setSeedFiles([]);
      setWorkspaceRoot(undefined);
      setWorkspaceAliases([]);
      return;
    }
    let cancelled = false;
    const assetBase = `/annotate/trials/${trial.slug}`;
    fetch(`${assetBase}/filesystem.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (manifest: TaskFilesystem | null) => {
        if (cancelled || !manifest) return;
        setWorkspaceRoot(resolveWorkspaceRoot(manifest));
        setWorkspaceAliases(manifest.workspace_aliases ?? []);
        const seeds = await loadFilesystemSeeds(manifest, assetBase);
        if (!cancelled) setSeedFiles(seeds);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trial.slug, presentation.filesystem_available]);

  const stepIndexList = useMemo(() => (data?.steps ?? []).map((s) => s.index), [data]);

  // The left transcript is intentionally NOT free-scrollable; navigation happens
  // through the "cited at" buttons (and prev/next), which scroll the (overflow-
  // hidden) panel programmatically to the chosen step + highlight it.
  const jumpToStep = useCallback((i: number) => {
    setSelectedStep(i);
    requestAnimationFrame(() => {
      const el = stepRefs.current.get(i);
      const panel = leftRef.current;
      if (el && panel) {
        panel.scrollTop += el.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8;
      }
    });
  }, []);

  // Default the transcript to the first cited step once the trajectory loads.
  useEffect(() => {
    if (!data) return;
    const cited = presentation.failure_modes.flatMap((f) => f.step_indices ?? []);
    const first = cited.length ? Math.min(...cited) : (data.steps[0]?.index ?? 0);
    jumpToStep(first);
  }, [data, presentation, jumpToStep]);

  const stepNudge = (dir: -1 | 1) => {
    const pos = stepIndexList.indexOf(selectedStep);
    const nextPos = Math.min(stepIndexList.length - 1, Math.max(0, (pos < 0 ? 0 : pos) + dir));
    const next = stepIndexList[nextPos];
    if (next != null) jumpToStep(next);
  };

  // ----- adjudication record (per-label threads + converged GT) -----
  const [record, setRecord] = useState<AdjudicationRecord>(() => emptyAdjudication(trial.id));
  const [recordLoaded, setRecordLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showLabelsAnyway, setShowLabelsAnyway] = useState(false);
  const prefillDone = useRef(false);
  const noteEditingRef = useRef(false);
  const savingRef = useRef(false);

  const refreshRecord = useMemo(
    () => async () => {
      try {
        const r = await pullAdjudication(trial.id);
        if (r) setRecord(r);
      } catch {
        /* keep local */
      } finally {
        setRecordLoaded(true);
      }
    },
    [trial.id],
  );

  useEffect(() => {
    refreshRecord();
  }, [refreshRecord]);

  // Live updates: poll the shared adjudication record while the tab is visible
  // and merge in any new comments without clobbering in-progress edits.
  useEffect(() => {
    if (tokenState !== "ok") return;
    let stopped = false;
    const tick = async () => {
      if (stopped || (typeof document !== "undefined" && document.hidden)) return;
      try {
        const remote = await pullAdjudication(trial.id);
        if (stopped || !remote) return;
        setRecord((local) =>
          mergeAdjudication(local, remote, { noteEditing: noteEditingRef.current, saving: savingRef.current }),
        );
      } catch {
        /* transient */
      }
    };
    const id = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [trial.id, tokenState]);

  // Prefill converged verdicts from agreed labels once, when nothing's saved.
  useEffect(() => {
    if (!recordLoaded || loading || prefillDone.current) return;
    prefillDone.current = true;
    if (record.updated_at) return; // already a real record
    const failure_modes: Record<string, Verdict | null> = {};
    for (const row of labels) {
      if (row.kind === "fm") {
        const va = verdictOf(reviewA, row);
        const vb = verdictOf(reviewB, row);
        failure_modes[row.key] = va != null && va === vb ? va : null;
      }
    }
    const ca = reviewA?.closeness ?? null;
    const cb = reviewB?.closeness ?? null;
    const ba = reviewA?.task_broken ?? false;
    const bb = reviewB?.task_broken ?? false;
    const ea = reviewA?.experiment_broken ?? false;
    const eb = reviewB?.experiment_broken ?? false;
    const nia = reviewA?.non_instructional ?? false;
    const nib = reviewB?.non_instructional ?? false;
    setRecord((r) => ({
      ...r,
      converged: {
        task_broken: ba === bb ? ba : null,
        experiment_broken: ea === eb ? ea : null,
        non_instructional: nia === nib ? nia : null,
        closeness: ca != null && ca === cb ? ca : null,
        failure_modes,
        note: r.converged.note,
      },
    }));
  }, [recordLoaded, loading, record.updated_at, labels, reviewA, reviewB]);

  const save = async (next: AdjudicationRecord) => {
    setRecord(next);
    setSaving(true);
    savingRef.current = true;
    try {
      const ts = await pushAdjudication(next);
      if (ts) setRecord((r) => ({ ...r, updated_at: ts }));
    } catch {
      /* surfaced via saving flag clearing */
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const postMessage = (key: string) => {
    const text = (drafts[key] ?? "").trim();
    if (!text || !me) return;
    setDrafts((d) => ({ ...d, [key]: "" }));
    const msg = { author: me, text, ts: new Date().toISOString(), ...(key === GENERAL ? {} : { label: key }) };
    save({ ...record, messages: [...record.messages, msg] });
  };

  const setConvergedVerdict = (row: LabelRow, v: Verdict) => {
    if (row.kind === "closeness") {
      save({ ...record, converged: { ...record.converged, closeness: v } });
    } else {
      save({
        ...record,
        converged: { ...record.converged, failure_modes: { ...record.converged.failure_modes, [row.key]: v } },
      });
    }
  };
  const convergedVerdict = (row: LabelRow): Verdict | null =>
    row.kind === "closeness" ? record.converged.closeness : record.converged.failure_modes[row.key] ?? null;

  const convergedBroken = record.converged.task_broken ?? null;
  const convergedExperimentBroken = record.converged.experiment_broken ?? null;
  const brokenConverged = convergedBroken === true || convergedExperimentBroken === true;
  const setConvergedBroken = (v: boolean) => save({ ...record, converged: { ...record.converged, task_broken: v } });
  const setConvergedExperimentBroken = (v: boolean) =>
    save({ ...record, converged: { ...record.converged, experiment_broken: v } });
  // Non-instructional is a task-quality flag — it does NOT gate the labels.
  const convergedNonInstructional = record.converged.non_instructional ?? null;
  const setConvergedNonInstructional = (v: boolean) =>
    save({ ...record, converged: { ...record.converged, non_instructional: v } });

  const finalize = () => {
    if (!me) return;
    save({ ...record, finalized: true, finalized_by: me, finalized_at: new Date().toISOString() });
  };
  const unfinalize = () => save({ ...record, finalized: false, finalized_by: null, finalized_at: null });

  const canEdit = tokenState === "ok" && Boolean(me);

  const replyBox = (key: string) =>
    canEdit ? (
      <div className="flex gap-1">
        <input
          value={drafts[key] ?? ""}
          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") postMessage(key);
          }}
          placeholder={`Reply as ${me}…`}
          className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => postMessage(key)}
          disabled={!(drafts[key] ?? "").trim()}
          className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Reply
        </button>
      </div>
    ) : null;

  const reviewers: [string | undefined, TrialReview | null][] = [
    [a, reviewA],
    [b, reviewB],
  ];
  const generalMsgs = record.messages.filter((m) => !m.label);

  const brokenCard = (opts: {
    title: string;
    threadKey: string;
    stanceOf: (rv: TrialReview | null) => boolean;
    noteAccess: (rv: TrialReview | null) => string;
    converged: boolean | null;
    setConverged: (v: boolean) => void;
    hint: string;
    tone: "amber" | "rose" | "violet";
    flaggedLabel?: string;
    toggleTrue?: string;
    okLabel?: string;
    seedTag?: string;
  }) => {
    const { title, threadKey, stanceOf, noteAccess, converged, setConverged, hint, tone } = opts;
    const toggleTrue = opts.toggleTrue ?? "broken";
    const okLabel = opts.okLabel ?? "ok";
    const seedTag = opts.seedTag ?? "broken";
    const flaggedLabel = opts.flaggedLabel ?? (tone === "rose" ? "🧪 broken" : "🚩 broken");
    const differ = reviewA != null && reviewB != null && stanceOf(reviewA) !== stanceOf(reviewB);
    const isBroken = converged === true;
    const stances = reviewers.map(([nm, rv]) => ({
      author: nm ?? "?",
      broken: stanceOf(rv),
      note: noteAccess(rv).trim(),
    }));
    const msgs = record.messages.filter((m) => m.label === threadKey);
    const none = stances.every((s) => !s.note) && msgs.length === 0;
    const C = {
      amber: { strong: "border-amber-400 bg-amber-50", soft: "border-amber-300 bg-amber-50/50", pill: "bg-amber-200 text-amber-900" },
      rose: { strong: "border-rose-400 bg-rose-50", soft: "border-rose-300 bg-rose-50/50", pill: "bg-rose-200 text-rose-900" },
      violet: { strong: "border-violet-400 bg-violet-50", soft: "border-violet-300 bg-violet-50/50", pill: "bg-violet-200 text-violet-900" },
    }[tone];
    const border = isBroken ? C.strong : differ ? C.soft : "border-slate-200 bg-white";
    const stanceBg = (broken: boolean) => (broken ? C.pill : "bg-slate-100 text-slate-600");
    return (
      <div className={`rounded-lg border p-2.5 space-y-2 ${border}`}>
        <div className="text-sm font-semibold text-slate-800">
          {title}
          {differ && (
            <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-amber-800">
              differ
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {stances.map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-slate-500">{s.author}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${stanceBg(s.broken)}`}>
                {s.broken ? flaggedLabel : okLabel}
              </span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[0.6rem] font-medium uppercase tracking-wide text-slate-400">gold</span>
            {canEdit ? (
              <BrokenToggle value={converged} onChange={setConverged} trueLabel={toggleTrue} falseLabel={okLabel} tone={tone} />
            ) : (
              <span className="text-xs font-medium text-slate-700">
                {converged === true ? toggleTrue : converged === false ? okLabel : "—"}
              </span>
            )}
          </span>
        </div>
        <div className="space-y-1.5">
          {stances
            .filter((s) => s.note)
            .map((s, i) => (
              <CommentBubble
                key={`s${i}`}
                author={s.author}
                text={s.note}
                tag={s.broken ? seedTag : "note"}
                tone={s.broken ? "broken" : "seed"}
              />
            ))}
          {msgs.map((m, i) => (
            <CommentBubble key={i} author={m.author} text={m.text} when={new Date(m.ts).toLocaleString()} />
          ))}
          {none && <p className="text-[0.65rem] italic text-slate-400">{hint}</p>}
        </div>
        {replyBox(threadKey)}
      </div>
    );
  };

  // ---------- left pane: transcript (unscrollable; cited-at navigation) ----------
  const totalSteps = stepIndexList.length ? Math.max(...stepIndexList) + 1 : 0;
  const leftPane = (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs">
        <span className="font-semibold text-slate-700">Transcript</span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <button type="button" onClick={() => stepNudge(-1)} className="rounded border border-slate-200 px-1.5 hover:bg-slate-50">
            ←
          </button>
          <span className="tabular-nums">
            step {selectedStep + 1}
            {totalSteps ? ` / ${totalSteps}` : ""}
          </span>
          <button type="button" onClick={() => stepNudge(1)} className="rounded border border-slate-200 px-1.5 hover:bg-slate-50">
            →
          </button>
        </span>
      </div>
      <div ref={leftRef} className="flex-1 overflow-hidden px-3 py-2 space-y-3">
        {!data ? (
          <p className="text-xs text-slate-400">Loading transcript…</p>
        ) : data.steps.length === 0 ? (
          <p className="text-xs text-slate-400">No trajectory available.</p>
        ) : (
          data.steps.map((s) => (
            <div
              key={s.index}
              ref={(el) => {
                if (el) stepRefs.current.set(s.index, el);
                else stepRefs.current.delete(s.index);
              }}
              className={`rounded border p-2 ${
                s.index === selectedStep ? "border-indigo-300 bg-indigo-50/40 ring-1 ring-indigo-200" : "border-slate-200"
              }`}
            >
              <div className="mb-1 text-[0.65rem] font-mono uppercase tracking-wide text-slate-400">
                step {s.index + 1} · {s.role}
              </div>
              <StepContent step={s} stepIndex={s.index} />
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ---------- right pane: workspace at the selected step ----------
  const showWorkspace = (presentation.filesystem_available ?? false) && seedFiles.length > 0;
  const rightPane =
    showWorkspace && data ? (
      <StepWorkspacePanel
        steps={data.steps}
        stepIndex={selectedStep}
        seedFiles={seedFiles}
        workdirHint={workspaceRoot}
        workspaceAliases={workspaceAliases}
      />
    ) : null;

  // ---------- middle pane: all merged labels (always shown) ----------
  const middlePane = (
    <div className="h-[calc(100vh-9rem)] overflow-y-auto px-3 py-3 space-y-3">
      {brokenCard({
        title: "Task broken?",
        threadKey: "task_broken",
        stanceOf: (rv) => !!rv?.task_broken,
        noteAccess: (rv) => rv?.task_broken_note ?? "",
        converged: convergedBroken,
        setConverged: setConvergedBroken,
        hint: "Discuss whether the task itself is broken (ambiguous spec, impossible tests, …).",
        tone: "amber",
      })}
      {brokenCard({
        title: "Experiment broken?",
        threadKey: "experiment_broken",
        stanceOf: (rv) => !!rv?.experiment_broken,
        noteAccess: (rv) => rv?.experiment_broken_note ?? "",
        converged: convergedExperimentBroken,
        setConverged: setConvergedExperimentBroken,
        hint: "Discuss whether this run is broken (agent cut off mid-turn, env/harness failure).",
        tone: "rose",
      })}
      {brokenCard({
        title: "Non-instructional?",
        threadKey: "non_instructional",
        stanceOf: (rv) => !!rv?.non_instructional,
        noteAccess: (rv) => rv?.non_instructional_note ?? "",
        converged: convergedNonInstructional,
        setConverged: setConvergedNonInstructional,
        hint: "Discuss whether the task probes a real missing capability of frontier models (non-instructional = it does not; labels still apply).",
        tone: "violet",
        flaggedLabel: "📋 non-instr",
        toggleTrue: "non-instr",
        okLabel: "instructional",
        seedTag: "non-instr",
      })}

      {brokenConverged && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            🚩 Converged:{" "}
            <strong>
              {convergedBroken === true && convergedExperimentBroken === true
                ? "task & experiment are broken"
                : convergedBroken === true
                  ? "task is broken"
                  : "experiment is broken"}
            </strong>{" "}
            — the label verdicts below are not applicable.
          </span>
          <button type="button" onClick={() => setShowLabelsAnyway((s) => !s)} className="shrink-0 text-[0.7rem] underline">
            {showLabelsAnyway ? "hide labels" : "show labels anyway"}
          </button>
        </div>
      )}

      {(!brokenConverged || showLabelsAnyway) && (
        <div className={`space-y-2 ${brokenConverged ? "opacity-60" : ""}`}>
          {labels.map((row) => {
            const va = verdictOf(reviewA, row);
            const vb = verdictOf(reviewB, row);
            const na = noteOf(reviewA, row);
            const nb = noteOf(reviewB, row);
            const differ = va != null && vb != null && va !== vb;
            const msgs = record.messages.filter((m) => m.label === row.key);
            const noComments = !na.trim() && !nb.trim() && msgs.length === 0;
            const cited = row.kind === "fm" ? row.fm.step_indices ?? [] : [];
            return (
              <div
                key={row.key}
                className={`rounded-lg border p-2.5 space-y-2 ${
                  differ ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">
                    {row.name}
                    {differ && (
                      <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-amber-800">
                        differ
                      </span>
                    )}
                  </div>
                  {/* the LLM judge's comment + cited evidence for this failure mode */}
                  {row.kind === "fm" && row.fm.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{row.fm.description}</p>
                  )}
                  {row.kind === "fm" && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {FACETS.map((f) => (
                        <AftCodeBadge key={f} facet={f} code={row.fm.aft[f]} />
                      ))}
                    </div>
                  )}
                  {row.kind === "fm" && row.fm.evidence_quote && (
                    <pre className="mt-1 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-[0.65rem] text-slate-600">
                      &ldquo;{row.fm.evidence_quote}&rdquo;
                    </pre>
                  )}
                  {cited.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[0.6rem] text-slate-400">
                      <span className="uppercase tracking-wide">cited at</span>
                      {cited.map((si) => (
                        <button
                          key={si}
                          type="button"
                          onClick={() => jumpToStep(si)}
                          title={`Show step ${si + 1} in the transcript`}
                          className={`rounded px-1 font-mono ${
                            si === selectedStep ? "bg-indigo-600 text-white" : "bg-slate-100 text-indigo-700 hover:bg-indigo-100"
                          }`}
                        >
                          {si + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="text-slate-500">{a ?? "A"}</span>
                    <VerdictPill v={va} />
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-slate-500">{b ?? "B"}</span>
                    <VerdictPill v={vb} />
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <span className="text-[0.6rem] font-medium uppercase tracking-wide text-slate-400">gold</span>
                    {canEdit ? (
                      <VerdictToggle value={convergedVerdict(row)} onChange={(v) => setConvergedVerdict(row, v)} compact />
                    ) : (
                      <VerdictPill v={convergedVerdict(row)} />
                    )}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {na.trim() && <CommentBubble author={a ?? "A"} text={na} tag="annotation" tone="seed" />}
                  {nb.trim() && <CommentBubble author={b ?? "B"} text={nb} tag="annotation" tone="seed" />}
                  {msgs.map((m, i) => (
                    <CommentBubble key={i} author={m.author} text={m.text} when={new Date(m.ts).toLocaleString()} />
                  ))}
                  {noComments && <p className="text-[0.65rem] italic text-slate-400">No comments yet.</p>}
                </div>

                {replyBox(row.key)}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">General discussion</h3>
        <div className="space-y-1.5">
          {generalMsgs.map((m, i) => (
            <CommentBubble key={i} author={m.author} text={m.text} when={new Date(m.ts).toLocaleString()} />
          ))}
          {generalMsgs.length === 0 && <p className="text-[0.65rem] italic text-slate-400">No messages yet.</p>}
        </div>
        {replyBox(GENERAL)}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Converged gold</h3>
        <textarea
          value={record.converged.note}
          onChange={(e) => setRecord((r) => ({ ...r, converged: { ...r.converged, note: e.target.value } }))}
          onFocus={() => {
            noteEditingRef.current = true;
          }}
          onBlur={() => {
            noteEditingRef.current = false;
            if (canEdit) save(record);
          }}
          placeholder="Adjudication note (rationale for the converged label)…"
          disabled={!canEdit}
          className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs min-h-[3rem]"
        />
        {record.finalized ? (
          <div className="flex items-center justify-between gap-2 rounded bg-emerald-50 border border-emerald-200 px-2 py-1.5">
            <span className="text-xs text-emerald-800">
              ✓ Finalized by {record.finalized_by}
              {record.finalized_at ? ` · ${new Date(record.finalized_at).toLocaleDateString()}` : ""}
            </span>
            {canEdit && (
              <button type="button" onClick={unfinalize} className="text-[0.65rem] text-emerald-700 underline">
                reopen
              </button>
            )}
          </div>
        ) : (
          canEdit && (
            <button
              type="button"
              onClick={finalize}
              className="w-full rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Finalize converged gold
            </button>
          )
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* header (centered) */}
      <div className="max-w-5xl mx-auto space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs text-slate-500 font-mono">{trial.id}</div>
            <h1 className="text-lg font-semibold text-slate-900">{trial.task}</h1>
            {trial.agent_timeout_s != null && (
              <span
                className="mt-0.5 inline-block rounded bg-rose-100 text-rose-800 px-1.5 py-0.5 text-[0.65rem] font-medium"
                title="The agent run was cut off by the Daytona agent timeout (AgentTimeoutError)"
              >
                ⏱ agent timed out{trial.agent_timeout_s ? ` · ${trial.agent_timeout_s}s` : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              agreement <span className="font-mono font-semibold text-slate-900">{formatPct(agreement.pct)}</span>{" "}
              <span className="text-xs text-slate-500">
                ({agreement.matched}/{agreement.comparable})
              </span>
            </span>
            <Link href={`/annotate/${trial.id}/`} className="text-indigo-700 no-underline hover:underline text-xs">
              open in viewer →
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {reviewers.map(([nm, rv], i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1">
              <span className="font-semibold text-slate-800">{nm ?? "—"}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[0.6rem] font-medium ${
                  annotatorDone(rv, presentation) ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"
                }`}
              >
                {annotatorDone(rv, presentation) ? "done" : "not done"}
              </span>
              {rv?.task_broken && <span className="text-[0.7rem]">🚩</span>}
              {rv?.experiment_broken && <span className="text-[0.7rem]">🧪</span>}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-2 text-[0.65rem] text-slate-400">
            {saving ? "saving…" : record.updated_at ? "saved" : ""}
            {tokenState === "ok" && (
              <span className="flex items-center gap-1 text-emerald-600" title="New comments appear automatically (polled every few seconds)">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                live
              </span>
            )}
          </span>
        </div>
        {loading && <p className="text-sm text-slate-500">Loading reviewers…</p>}
        {!canEdit && (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {tokenState !== "ok"
              ? "Cloud token required to load/save the discussion."
              : "Sign in to post comments and edit the gold label."}
          </div>
        )}
      </div>

      {/* full-bleed 3-pane: transcript · labels · workspace */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4">
        <div className="border border-slate-200 rounded bg-white">
          <ResizableColumns
            storageKey={LAYOUT_KEY}
            rightAvailable={showWorkspace}
            defaultRightCollapsed={false}
            rightLabel="Workspace"
            left={leftPane}
            middle={middlePane}
            right={rightPane}
          />
        </div>
      </div>
    </div>
  );
}
