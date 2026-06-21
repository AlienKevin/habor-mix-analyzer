"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import StepContent from "@/app/_components/annotation/StepContent";
import FileDiffView from "@/app/_components/annotation/FileDiffView";
import type { TrajectoryStepSummary } from "@/lib/annotation-types";

// Filesystem panels/buttons are hidden for now (FS extraction is deferred).
// Flip to true once packs carry filesystem data again — the snapshots that drive
// extraction are preserved, so this is fully reversible.
const SHOW_FS = false;

type RunInfo = { run_id: string };

type Phase = "prior" | "branch" | "divider";
type Step = TrajectoryStepSummary & { ts?: string | null; phase?: Phase; fs_step?: number | null };
type FsFile = { path: string; size: number; sha?: string | null; is_text?: boolean };
type FsStep = { step: number; ts?: string | null; added: FsFile[]; modified: FsFile[]; removed: string[]; n_files: number; phase?: Phase;
  added_more?: number; modified_more?: number; removed_more?: number; large_skipped?: number };
type Pack = {
  meta: { task: string; kind: string; run_id: string; label: string; hint?: string | null;
    pass: boolean; reward?: number | null; why?: string | null; model?: string | null;
    n_steps: number; n_fs: number; branch_step?: number | null };
  steps: Step[];
  fs: { steps: FsStep[]; blobs: Record<string, string> };
};

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default function SnapRunViewer({ task, run }: { task: string; run: string }) {
  const [pack, setPack] = useState<Pack | null | "error">(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [k, setK] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [fsOpen, setFsOpen] = useState(false); // filesystem drawer collapsed by default

  useEffect(() => {
    let live = true;
    setPack(null);
    fetch(`/snap-traj/${task}/${run}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p) => { if (live) { setPack(p); setK(Math.max(0, p.fs.steps.length - 1)); setSel(null); setFsOpen(false); } })
      .catch(() => live && setPack("error"));
    fetch(`/snap-traj/${task}/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setRuns(d.runs ?? []))
      .catch(() => {});
    return () => { live = false; };
  }, [task, run]);

  const { tree, changedAdded, changedMod } = useMemo(() => {
    const t = new Map<string, FsFile>();
    if (!pack || pack === "error") return { tree: t, changedAdded: new Set<string>(), changedMod: new Set<string>() };
    for (let i = 0; i <= k && i < pack.fs.steps.length; i++) {
      const s = pack.fs.steps[i];
      s.added.forEach((f) => t.set(f.path, f));
      s.modified.forEach((f) => t.set(f.path, f));
      s.removed.forEach((p) => t.delete(p));
    }
    const cur = pack.fs.steps[k];
    return { tree: t, changedAdded: new Set(cur?.added.map((f) => f.path) ?? []), changedMod: new Set(cur?.modified.map((f) => f.path) ?? []) };
  }, [pack, k]);

  const prevSha = (path: string): string | null => {
    if (!pack || pack === "error") return null;
    for (let i = k - 1; i >= 0; i--) {
      const hit = [...pack.fs.steps[i].added, ...pack.fs.steps[i].modified].find((f) => f.path === path);
      if (hit) return hit.sha ?? null;
    }
    return null;
  };
  // Snapshot lookup keyed by (phase, snapshot step). Packs stamp each
  // trajectory step with fs_step — the snapshot taken right after its last
  // tool call (an exact byte-offset join against the agent's event log) — so
  // no timestamp guessing is needed. nearestFs remains only as a fallback for
  // packs built before fs_step existed.
  const fsLookup = useMemo(() => {
    const exact = new Map<string, number>();
    const byPhase = new Map<string, { step: number; idx: number }[]>();
    if (!pack || pack === "error") return { exact, byPhase };
    pack.fs.steps.forEach((s, i) => {
      const ph = s.phase === "prior" ? "prior" : "branch";
      exact.set(`${ph}:${s.step}`, i);
      let arr = byPhase.get(ph);
      if (!arr) byPhase.set(ph, (arr = []));
      arr.push({ step: s.step, idx: i });
    });
    return { exact, byPhase };
  }, [pack]);
  const nearestFs = (ts?: string | null): number | null => {
    if (!ts || !pack || pack === "error") return null;
    const t = Date.parse(ts);
    let best = -1;
    pack.fs.steps.forEach((s, i) => { if (s.ts && Date.parse(s.ts) <= t + 1) best = i; });
    return best >= 0 ? best : null;
  };
  const fsAt = (s: Step): number | null => {
    if (s.fs_step != null) {
      const ph = s.phase === "prior" ? "prior" : "branch";
      const hit = fsLookup.exact.get(`${ph}:${s.fs_step}`);
      if (hit != null) return hit;
      let best: number | null = null;
      for (const e of fsLookup.byPhase.get(ph) ?? []) if (e.step <= s.fs_step) best = e.idx;
      if (best != null) return best;
    }
    return nearestFs(s.ts);
  };
  const openFsAt = (i: number | null) => { if (i != null) setK(i); setFsOpen(true); };

  if (pack === null) return <p className="mx-auto max-w-4xl px-4 py-10 text-center text-sm text-slate-500">Loading trajectory…</p>;
  if (pack === "error") return <p className="mx-auto max-w-4xl px-4 py-10 text-center text-sm text-rose-500">Trajectory not available for this run.</p>;

  const m = pack.meta;
  const cur = pack.fs.steps[k];
  // When the cumulative tree is large (>100), focus the list on the files that
  // changed at this step rather than dumping the whole tree (per design).
  const OVERVIEW_CAP = 100;
  const allPaths = [...tree.keys()].sort();
  const overviewCapped = allPaths.length > OVERVIEW_CAP;
  const changedPaths = [...changedAdded, ...changedMod].filter((p) => tree.has(p)).sort();
  const paths = overviewCapped ? changedPaths : allPaths;
  const blob = (sha?: string | null) => (sha ? pack.fs.blobs[sha] : undefined);
  const selFile = sel ? tree.get(sel) : undefined;
  const priorSteps = pack.steps.filter((s) => s.phase === "prior");
  const dividerStep = pack.steps.find((s) => s.phase === "divider");
  const branchSteps = pack.steps.filter((s) => !s.phase || s.phase === "branch");

  // the injected hint/placebo/answer = the first user turn of the branch run
  const hintIndex = m.hint ? branchSteps.find((s) => s.role === "user")?.index : undefined;
  const injectLabel = m.kind === "ceiling" ? "injected answer" : m.kind === "placebo" ? "injected placebo" : "injected hint";

  // Continuous step numbering across the whole resumed timeline: the baseline
  // lead-up is steps 1..P, then the branch continues at P+1 (where the hint
  // lands) — not restarting at 1, since the branch resumes that same session.
  const StepLi = ({ s, prior, isHint, num }: { s: Step; prior?: boolean; isHint?: boolean; num: number }) => {
    const fsIdx = fsAt(s);
    return (
      <li id={`step-${num}`} className={`scroll-mt-4 rounded-lg border p-3 target:ring-2 target:ring-indigo-300 ${isHint ? "border-amber-300 bg-amber-50/60" : prior ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50/50"}`}>
        <div className="mb-2 flex items-center gap-2 text-[0.7rem]">
          <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono font-semibold text-slate-700">step {num}</span>
          <span className="font-medium uppercase tracking-wide text-slate-400">{s.role}</span>
          {isHint && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-amber-950">⤷ {injectLabel}</span>}
          {prior && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-400">from baseline</span>}
          {SHOW_FS && fsIdx != null && (
            <button onClick={() => openFsAt(fsIdx)} className="ml-auto rounded bg-indigo-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-indigo-600 hover:bg-indigo-100">📁 files here</button>
          )}
        </div>
        <StepContent step={s} stepIndex={s.index} renderMarkdown />
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link href={`/tb3/snapshot-intervention/${task}/`} className="text-indigo-600 no-underline hover:underline">← {task}</Link>
        <span className="text-slate-300">·</span>
        {runs.map((r) => (
          <Link key={r.run_id} href={`/tb3/snapshot-intervention/${task}/run/${r.run_id}/`}
            className={`rounded px-1.5 py-0.5 no-underline ${r.run_id === run ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {r.run_id}
          </Link>
        ))}
      </div>
      <header className="space-y-1 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900">
            {m.label} <span className="font-mono text-sm font-normal text-slate-500">{m.task}</span>
          </h1>
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${m.pass ? "bg-emerald-500 text-white" : "bg-rose-100 text-rose-700"}`}>{m.pass ? "✓ PASS" : "✗ fail"}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[0.7rem] text-slate-500">
          {m.model && <span>model <span className="font-mono text-slate-700">{m.model}</span></span>}
          <span><span className="font-mono text-slate-700">{branchSteps.length}</span> steps</span>
          {SHOW_FS && <span><span className="font-mono text-slate-700">{m.n_fs}</span> filesystem snapshots</span>}
        </div>
        {m.hint && (
          <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-snug text-amber-900">
            <span className="font-semibold">⤷ Injected {m.kind === "ceiling" ? "answer" : m.kind === "placebo" ? "placebo" : "hint"} (delivered as the next turn):</span>{" "}
            <span className="whitespace-pre-wrap break-words">{m.hint}</span>
          </div>
        )}
        {m.why && (
          <div className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs leading-snug text-rose-800">
            <span className="font-semibold">Why it failed:</span> {m.why}
          </div>
        )}
      </header>

      {priorSteps.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-slate-50/40">
          <summary className="cursor-pointer px-3 py-2 text-[0.75rem] font-semibold text-slate-500">
            ▸ Baseline lead-up — {priorSteps.length} step{priorSteps.length > 1 ? "s" : ""} before the intervention (resumed from snapshot {m.branch_step})
          </summary>
          <ol className="space-y-3 p-3 pt-0">{priorSteps.map((s, i) => <StepLi key={`p${i}`} s={s} prior num={i + 1} />)}</ol>
        </details>
      )}
      {dividerStep && (
        <div className="rounded-lg border-2 border-dashed border-violet-300 bg-violet-50 px-3 py-2 text-center text-[0.75rem] font-semibold leading-snug text-violet-800">
          {dividerStep.text}
        </div>
      )}
      <ol className="space-y-3">{branchSteps.map((s, j) => <StepLi key={`b${j}`} s={s} isHint={s.index === hintIndex} num={priorSteps.length + j + 1} />)}</ol>

      {/* filesystem: collapsed right drawer, opened on demand (hidden while SHOW_FS=false) */}
      {SHOW_FS && !fsOpen && (
        <button onClick={() => setFsOpen(true)}
          className="fixed right-0 top-1/3 z-40 flex items-center gap-1 rounded-l-lg border border-r-0 border-slate-300 bg-white px-2 py-3 text-[0.7rem] font-semibold text-slate-600 shadow hover:bg-slate-50"
          style={{ writingMode: "vertical-rl" }} title="Show the captured filesystem">
          📁 Filesystem
        </button>
      )}
      {SHOW_FS && fsOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={() => setFsOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-screen w-[min(94vw,600px)] flex-col border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
              <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-600">Captured filesystem</span>
              <button onClick={() => setFsOpen(false)} className="ml-auto rounded bg-slate-200 px-2 py-0.5 text-xs hover:bg-slate-300">✕ close</button>
            </div>
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5">
              <button disabled={k <= 0} onClick={() => setK(k - 1)} className="rounded bg-slate-200 px-1.5 text-xs disabled:opacity-40">◀</button>
              <input type="range" min={0} max={pack.fs.steps.length - 1} value={k} onChange={(e) => setK(+e.target.value)} className="h-1 flex-1 accent-violet-600" />
              <button disabled={k >= pack.fs.steps.length - 1} onClick={() => setK(k + 1)} className="rounded bg-slate-200 px-1.5 text-xs disabled:opacity-40">▶</button>
              <span className="text-[0.6rem] text-slate-500">
                <span className={cur?.phase === "prior" ? "text-slate-400" : "font-semibold text-violet-600"}>{cur?.phase === "prior" ? "baseline" : "branch"}</span> snap {cur?.step} · {k + 1}/{pack.fs.steps.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-3 py-1 text-[0.6rem]">
              <span className="text-emerald-600">+{cur?.added.length ?? 0}{(cur?.added_more ?? 0) > 0 ? `(+${cur!.added_more})` : ""} added</span>
              <span className="text-amber-600">~{cur?.modified.length ?? 0}{(cur?.modified_more ?? 0) > 0 ? `(+${cur!.modified_more})` : ""} modified</span>
              <span className="text-rose-600">-{cur?.removed.length ?? 0} removed</span>
              {(cur?.large_skipped ?? 0) > 0 && <span className="text-slate-400" title="files over 256KB are listed but not previewed">· {cur!.large_skipped} large skipped</span>}
              <span className="text-slate-400">· {allPaths.length} files{overviewCapped ? ` (showing ${paths.length} changed)` : ""}</span>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(140px,42%)_1fr]">
              <div className="overflow-auto border-r border-slate-100 p-1">
                {paths.length === 0 && <div className="p-2 text-[0.65rem] text-slate-400">{overviewCapped ? "no files changed at this step" : "no agent-written files yet"}</div>}
                {overviewCapped && <div className="px-1.5 pb-1 text-[0.58rem] text-slate-400">{allPaths.length} files total — showing only those changed at this step</div>}
                {paths.map((p) => {
                  const st = changedAdded.has(p) ? "add" : changedMod.has(p) ? "mod" : "";
                  return (
                    <button key={p} onClick={() => setSel(p)} title={p}
                      className={`block w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[0.62rem] hover:bg-slate-100 ${sel === p ? "bg-violet-100 text-violet-800" : st === "add" ? "text-emerald-700" : st === "mod" ? "text-amber-700" : "text-slate-600"}`}>
                      {st === "add" ? "+ " : st === "mod" ? "~ " : ""}{p.replace(/^\//, "")}
                    </button>
                  );
                })}
              </div>
              <div className="overflow-auto p-2">
                {!selFile && <div className="text-[0.65rem] text-slate-400">select a file to view its contents at this snapshot</div>}
                {selFile && (
                  <div>
                    <div className="mb-1 flex items-center gap-2 font-mono text-[0.62rem] text-slate-500">
                      <span className="truncate" title={sel!}>{sel}</span>
                      <span className="shrink-0 text-slate-400">{fmtBytes(selFile.size)}</span>
                    </div>
                    {!selFile.is_text ? (
                      <div className="rounded bg-slate-50 p-2 text-[0.65rem] text-slate-500">[binary file · {fmtBytes(selFile.size)} — content not captured]</div>
                    ) : changedMod.has(sel!) && prevSha(sel!) ? (
                      <FileDiffView oldContent={blob(prevSha(sel!)) ?? ""} newContent={blob(selFile.sha) ?? ""} oldPath={sel!} newPath={sel!} />
                    ) : (
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[0.62rem] leading-snug text-slate-700">{blob(selFile.sha) ?? "[content not captured — report/large file]"}</pre>
                    )}
                  </div>
                )}
              </div>
            </div>
            <p className="border-t border-slate-100 px-3 py-1.5 text-[0.6rem] leading-snug text-slate-400">
              Real per-step filesystem (harbor #1868 snapshots; agent-modified files, fixtures excluded). Scrub to watch files change; green = added, amber = modified at this step.
            </p>
          </aside>
        </>
      )}
    </div>
  );
}
