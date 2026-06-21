import { v2Row, type V2Node } from "@/lib/snapshot-v2-data";

function NodeCard({ node, id, title, color }: { node: V2Node; id?: string; title: string; color: string }) {
  const border = node.pass ? "border-emerald-300" : node.graded === false ? "border-slate-100" : "border-slate-200";
  const badge = node.pass ? "bg-emerald-500 text-white" : node.graded === false ? "bg-slate-100 text-slate-400" : "bg-rose-100 text-rose-600";
  return (
    <div id={id} className={`scroll-mt-20 min-w-0 flex-1 rounded-lg border ${border} bg-white p-2.5 target:ring-2 target:ring-violet-500`}>
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${color}`}>{title}</span>
        <span className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${badge}`}>
          {node.pass ? "✓ PASS" : node.graded === false ? "pending…" : "✗ fail"}
        </span>
        {node.step != null && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] text-slate-500">@step {node.step}</span>}
      </div>
      {node.outcome && <div className="mt-1 truncate font-mono text-[0.65rem] text-slate-500" title={node.outcome}>→ {node.outcome}</div>}
      {node.why && !node.pass && (
        <div className="mt-1 break-words rounded bg-rose-50/70 px-1.5 py-1 text-[0.65rem] leading-snug text-rose-700">
          <span className="font-semibold">why:</span> {node.why}
        </div>
      )}
      {node.hint && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[0.6rem] text-indigo-500">hint text</summary>
          <p className="mt-1 whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[0.65rem] leading-snug text-slate-600">{node.hint}</p>
        </details>
      )}
    </div>
  );
}

export default function V2Lanes({ task }: { task: string }) {
  const row = v2Row(task);
  if (!row || !row.lanes.some((l) => l.r2)) return null;
  const r1flips = row.lanes.filter((l) => l.r1.pass).length;
  const r2flips = row.lanes.filter((l) => l.r2?.pass).length;
  const lanesWithR2 = row.lanes.filter((l) => l.r2).length;
  return (
    <section className="space-y-3 rounded-lg border-2 border-violet-200 bg-violet-50/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-violet-900">Round 1 → Round 2 — each Round-2 trial continues its Round-1 trial</h2>
        <span className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${r1flips ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          R1 {r1flips}/{row.lanes.length} flip
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${r2flips ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          R2 continuations {r2flips}/{lanesWithR2} flip
        </span>
      </div>
      <p className="text-[0.7rem] leading-snug text-violet-800">
        Each lane is one Round-1 trial and its continuation: <strong>R2·N boots from R1·N&rsquo;s own snapshot at the step where
        it failed and resumes R1·N&rsquo;s session</strong> (so it keeps all of that trial&rsquo;s work) with a hint targeting
        <em> that trial&rsquo;s</em> specific residual. A 1:1 lineage — not a re-branch from the baseline.
      </p>
      <div className="space-y-2.5">
        {row.lanes.map((l, i) => (
          <div key={i} className="rounded-lg border border-violet-100 bg-white/60 p-2">
            <div className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-violet-400">Lane {i + 1}</div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <NodeCard node={l.r1} id={`R1·${i + 1}`} title={`R1·${i + 1}`} color="bg-indigo-100 text-indigo-700" />
              {l.r2 ? (
                <>
                  <div className="flex shrink-0 flex-col items-center px-1 text-violet-500">
                    <span className="text-lg leading-none">→</span>
                    <span className="text-[0.55rem] leading-tight">continues{l.r2.step != null ? ` @${l.r2.step}` : ""}</span>
                  </div>
                  <NodeCard node={l.r2} id={`R2·${i + 1}`} title={`R2·${i + 1}`} color="bg-violet-100 text-violet-700" />
                </>
              ) : (
                <div className="min-w-0 flex-1 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 px-3 py-2 text-[0.7rem] leading-snug text-emerald-700">
                  <span className="font-semibold">R1·{i + 1} already passed</span> — no failed trajectory to continue, so there is no Round-2 lane here.
                </div>
              )}
              {l.placebo && (
                <div className="shrink-0 self-stretch sm:w-24">
                  <div className={`flex h-full flex-col justify-center rounded-lg border px-2 py-1 text-center text-[0.6rem] ${l.placebo.pass ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"}`}>
                    <span className="font-semibold">placebo</span>
                    <span>{l.placebo.graded === false ? "pending…" : l.placebo.pass ? "✓ flips" : "✗ no flip"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
