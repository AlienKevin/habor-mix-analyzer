import React from "react";
import Link from "next/link";
import overview from "@/lib/judge3x3_overview.json";
import { OUTCOME_STYLE } from "@/lib/audit-data";
import InstructionMarkdown from "@/app/_components/annotation/InstructionMarkdown";

type Outcome = "TP" | "TN" | "FP" | "FN";
type Trial = {
  rollout_id: string;
  model_key: string;
  model_label: string;
  harness: string;
  outcome_class: Outcome;
  reward: number | null;
  binary_pass: number;
  status: string | null;
  truly_solved: boolean;
  confidence: string;
  summary: string;
  concern: string | null;
};
type Task = { task_id: string; benchmark: string | null; blurb: string; trials: Trial[] };
type Qual = { title: string; body: string };
type FnPattern = { description: string; rollout_ids: string[] };
type Overview = {
  generated_for: string;
  judge: string;
  summary: { n_tasks: number; n_trials: number; TP: number; TN: number; FP: number; FN: number };
  models: { key: string; label: string; harness: string }[];
  tasks: Task[];
  qualitative: Qual[];
  fn_patterns: Record<string, FnPattern>;
};

const ov = overview as Overview;

function Badge({ o }: { o: Outcome }) {
  const s = OUTCOME_STYLE[o];
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.7rem] font-bold ring-1 ${s.badge}`}
      title={s.blurb}
    >
      {o}
    </span>
  );
}

const MODEL_KEYS = ["opus", "gpt", "gem"] as const;
const MODEL_LABELS: Record<string, string> = { opus: "Opus 4.8", gpt: "GPT-5.5", gem: "Gemini 3.1" };

function trialIndex(): Map<string, Trial> {
  const m = new Map<string, Trial>();
  for (const t of ov.tasks) for (const tr of t.trials) m.set(tr.rollout_id, tr);
  return m;
}
const trialMap = trialIndex();

function taskForRollout(rid: string): Task | undefined {
  return ov.tasks.find((t) => t.trials.some((tr) => tr.rollout_id === rid));
}

/** Compact table row: one task, 3 model badges, first TN summary as hover tooltip. */
function TaskTable({ tasks }: { tasks: Task[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <colgroup>
          <col className="w-auto" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="py-2 pr-4 font-mono text-xs font-semibold text-slate-500">Task</th>
            <th className="py-2 px-2 text-center text-xs font-semibold text-slate-500">
              {MODEL_LABELS[MODEL_KEYS[0]]}
            </th>
            <th className="py-2 px-2 text-center text-xs font-semibold text-slate-500">
              {MODEL_LABELS[MODEL_KEYS[1]]}
            </th>
            <th className="py-2 px-2 text-center text-xs font-semibold text-slate-500">
              {MODEL_LABELS[MODEL_KEYS[2]]}
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const byModel: Record<string, Trial | undefined> = {};
            for (const tr of task.trials) byModel[tr.model_key] = tr;
            return (
              <tr key={task.task_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-4">
                  <span className="font-mono text-xs text-slate-700">
                    {task.task_id}
                  </span>
                </td>
                {MODEL_KEYS.map((mk) => {
                  const tr = byModel[mk];
                  if (!tr) return <td key={mk} className="py-2 px-2 text-center text-slate-300">—</td>;
                  return (
                    <td key={mk} className="py-2 px-2 text-center">
                      <Link href={`/${encodeURIComponent(tr.rollout_id)}/`} title={tr.summary}>
                        <Badge o={tr.outcome_class} />
                      </Link>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** FN section: each pattern gets its own card with the affected trials in a mini table. */
function FnSection() {
  const patterns = Object.entries(ov.fn_patterns ?? {});
  if (patterns.length === 0) return null;

  return (
    <section className="space-y-4 scroll-mt-6">
      <h2 id="false-negatives" className="m-0 text-lg font-bold text-slate-900">
        <a href="#false-negatives" className="no-underline text-slate-900 hover:underline">
          False Negatives — verifier faults ({ov.summary.FN})
        </a>
      </h2>
      <p className="max-w-3xl text-sm text-slate-500">
        The agent genuinely solved the task, but the verifier incorrectly scored it FAIL.
        Clustered by root-cause pattern.
      </p>
      {patterns.map(([pname, pdata]) => {
        if (pdata.rollout_ids.length === 0) return null;
        const affectedTasks: Task[] = [];
        const seen = new Set<string>();
        for (const rid of pdata.rollout_ids) {
          const task = taskForRollout(rid);
          if (task && !seen.has(task.task_id)) {
            affectedTasks.push(task);
            seen.add(task.task_id);
          }
        }
        return (
          <div key={pname} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
            <div>
              <h3 className="m-0 text-sm font-bold text-amber-900">{pname}</h3>
              <p className="m-0 mt-1 text-xs leading-relaxed text-amber-800">{pdata.description}</p>
            </div>
            <TaskTable tasks={affectedTasks} />
          </div>
        );
      })}
    </section>
  );
}

function FpSection() {
  if (ov.summary.FP === 0) return null;
  const fpTasks = ov.tasks.filter((t) => t.trials.some((tr) => tr.outcome_class === "FP"));
  return (
    <section className="space-y-4 scroll-mt-6">
      <h2 id="false-positives" className="m-0 text-lg font-bold text-slate-900">
        <a href="#false-positives" className="no-underline text-slate-900 hover:underline">
          False Positives — spurious passes ({ov.summary.FP})
        </a>
      </h2>
      <p className="max-w-3xl text-sm text-slate-500">
        The verifier scored PASS, but the agent did not genuinely solve the task.
      </p>
      <TaskTable tasks={fpTasks} />
    </section>
  );
}

function TnSection() {
  // Tasks where ALL trials are TN (no FN/FP/TP mixed in)
  const tnTasks = ov.tasks.filter((t) => t.trials.every((tr) => tr.outcome_class === "TN"));

  return (
    <section className="space-y-4 scroll-mt-6">
      <h2 id="true-negatives" className="m-0 text-lg font-bold text-slate-900">
        <a href="#true-negatives" className="no-underline text-slate-900 hover:underline">
          True Negatives — genuine failures ({ov.summary.TN})
        </a>
      </h2>
      <p className="max-w-3xl text-sm text-slate-500">
        The verifier correctly scored FAIL — the agent did not genuinely solve the task.
      </p>
      <TaskTable tasks={tnTasks} />
    </section>
  );
}

export default function Home() {
  const { summary: sm } = ov;
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-900">
          Harbor-Index — bottom-up judge: hard tasks × 3 frontier models
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          {ov.summary.n_tasks} Harbor-Index tasks that <strong>none</strong> of three frontier
          agents solved, each rollout independently re-judged from its full trajectory + reference
          solution by <strong>{ov.judge}</strong>. The judge decides whether the task was{" "}
          <em>truly</em> solved — independent of the verifier&rsquo;s PASS/FAIL — and classifies each
          rollout TP / TN / FP / FN with cited evidence. Click any badge for the full per-trial audit.
          Machine-readable data at{" "}
          <Link href="/data" className="text-indigo-500 hover:underline">/data</Link>.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["FN", "FP", "TN", "TP"] as Outcome[]).map((o) => (
            <span key={o} className="inline-flex items-center gap-1.5">
              <Badge o={o} />
              <span className="text-slate-500">
                {OUTCOME_STYLE[o].blurb} · <strong>{sm[o]}</strong>
              </span>
            </span>
          ))}
        </div>
      </header>

      <FnSection />
      <FpSection />
      <TnSection />

      {ov.qualitative.length > 0 && (
        <section className="space-y-5 border-t border-slate-200 pt-8 scroll-mt-6">
          <h2 id="qualitative-analysis" className="m-0 text-xl font-bold text-slate-900">
            <a href="#qualitative-analysis" className="no-underline text-slate-900 hover:underline">
              Qualitative analysis
            </a>
          </h2>
          <p className="max-w-3xl text-sm text-slate-500">
            Model behavior patterns observed across these {ov.summary.n_trials} judged rollouts.
          </p>
          <div className="space-y-5">
            {ov.qualitative.map((q) => (
              <div key={q.title} className="max-w-3xl">
                <h3 className="m-0 mb-1 text-base font-semibold text-slate-900">{q.title}</h3>
                <div className="text-sm leading-relaxed text-slate-700">
                  <InstructionMarkdown content={q.body} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
