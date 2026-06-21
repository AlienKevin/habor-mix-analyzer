import Link from "next/link";
import { loadTb3FailLocPack, type Tb3FailLocTrial } from "@/lib/tb3-failure-localization-data";

const LOC_STYLE: Record<string, { label: string; bar: string; badge: string }> = {
  single_step: { label: "single step", bar: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800 ring-indigo-300" },
  few_steps: { label: "few steps", bar: "bg-sky-400", badge: "bg-sky-100 text-sky-800 ring-sky-300" },
  diffuse: { label: "diffuse", bar: "bg-slate-400", badge: "bg-slate-100 text-slate-700 ring-slate-300" },
};

/** Inline analysis section (rendered inside a <details> on /tb3/audit). */
export default function Tb3FailureLocalizationSection() {
  const p = loadTb3FailLocPack();
  const loc = p.localization_taskfail;
  const order = ["single_step", "few_steps", "diffuse"] as const;
  const locTotal = order.reduce((s, k) => s + (loc[k] || 0), 0) || 1;
  const pctSingle = Math.round((100 * (loc.single_step || 0)) / locTotal);
  const pctCluster = Math.round((100 * ((loc.single_step || 0) + (loc.few_steps || 0))) / locTotal);

  const hist = p.position_hist;
  const histMax = Math.max(...hist, 1);
  const kinds = Object.entries(p.failure_kind_taskfail).sort((a, b) => b[1] - a[1]);
  const kindMax = Math.max(...kinds.map(([, n]) => n), 1);

  const byTask = new Map<string, Tb3FailLocTrial[]>();
  for (const t of p.trials) {
    if (!byTask.has(t.task)) byTask.set(t.task, []);
    byTask.get(t.task)!.push(t);
  }

  return (
    <div className="space-y-6 px-1 pt-3">
      <p className="text-sm leading-relaxed text-slate-600">
        For every failed {p.agent} rollout in the {p.arm} on {p.benchmark}, a bottom-up agent pinpointed the single
        <em> key step</em> where the failure was decided — to answer whether failures are <strong>localized</strong> to
        one decisive step or <strong>spread</strong> across the trajectory. {p.n_task_failures} genuine control failures
        (no infra errors in this set).
      </p>

      <section className="flex flex-wrap gap-2">
        <div className="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-center text-indigo-800">
          <div className="text-2xl font-bold">{pctSingle}%</div>
          <div className="text-[0.65rem] uppercase tracking-wide opacity-70">pin to ONE step</div>
        </div>
        <div className="flex-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-center text-sky-800">
          <div className="text-2xl font-bold">{pctCluster}%</div>
          <div className="text-[0.65rem] uppercase tracking-wide opacity-70">single step or small cluster</div>
        </div>
        <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-slate-700">
          <div className="text-2xl font-bold">{loc.diffuse || 0}</div>
          <div className="text-[0.65rem] uppercase tracking-wide opacity-70">diffuse</div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Is the failure localized or spread?</h3>
        <div className="flex h-8 w-full overflow-hidden rounded-md ring-1 ring-slate-200">
          {order.map((k) =>
            loc[k] ? (
              <div key={k} className={`flex items-center justify-center ${LOC_STYLE[k].bar} text-[0.7rem] font-semibold text-white`} style={{ width: `${(100 * loc[k]) / locTotal}%` }} title={`${LOC_STYLE[k].label}: ${loc[k]}`}>
                {loc[k]}
              </div>
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {order.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-sm ${LOC_STYLE[k].bar}`} />
              {LOC_STYLE[k].label} ({loc[k] || 0})
            </span>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          {pctSingle}% pin to a single decisive step and {pctCluster}% to a step or small cluster — TB3 control failures
          are overwhelmingly <strong>localized</strong>: the agent commits to a doomed approach early (e.g. optimizing
          against a self-built surrogate the verifier never uses, or deriving a quantity the wrong way) and never recovers.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Where in the trajectory is it decided?</h3>
        <p className="text-xs text-slate-500">Normalized position of the key step (0 = start, 1 = end); median {p.median_frac.toFixed(2)}.</p>
        <div className="flex h-32 items-end gap-1 border-b border-l border-slate-200 pl-2">
          {hist.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[0.6rem] text-slate-400">{n || ""}</span>
              <div className="w-full rounded-t bg-indigo-500" style={{ height: `${(100 * n) / histMax}%`, minHeight: n ? "3px" : "0" }} title={`${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}: ${n}`} />
            </div>
          ))}
        </div>
        <div className="flex justify-between px-2 text-[0.6rem] text-slate-400"><span>start</span><span>0.5</span><span>end</span></div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Failure kind</h3>
        <div className="space-y-1.5">
          {kinds.map(([k, n]) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0 text-right text-slate-600">{k.replace(/_/g, " ")}</span>
              <div className="h-4 flex-1 rounded-sm bg-slate-100"><div className="h-4 rounded-sm bg-sky-500" style={{ width: `${(100 * n) / kindMax}%` }} /></div>
              <span className="w-6 text-slate-500">{n}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Per-trial localization ({p.trials.length})</h3>
        {[...byTask.entries()].map(([task, trials]) => (
          <div key={task} className="overflow-hidden rounded-lg border border-slate-200">
            <div className="bg-slate-50 px-3 py-1.5 font-mono text-xs font-medium text-slate-700">{task}</div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {trials.map((t) => (
                  <tr key={t.trial_id} className="align-top hover:bg-slate-50">
                    <td className="w-24 px-3 py-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.6rem] font-bold ring-1 ${LOC_STYLE[t.localization].badge}`}>{LOC_STYLE[t.localization].label}</span>
                    </td>
                    <td className="w-20 px-2 py-2 font-mono text-[0.7rem] text-slate-500">{t.key_step != null ? `step ${t.key_step}/${t.n_steps}` : `—/${t.n_steps}`}</td>
                    <td className="w-28 px-2 py-2 text-[0.7rem] text-slate-500">{t.failure_kind.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {t.reason}
                      {t.has_traj && (
                        <Link href={`/tb3/audit/${t.trial_id}/`} className="ml-1 inline-block text-[0.7rem] font-medium text-indigo-600 no-underline hover:underline">open trajectory →</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
