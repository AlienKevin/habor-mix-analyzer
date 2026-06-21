import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-static";

function loadData() {
  const base = join(process.cwd(), "public", "data");
  const index = JSON.parse(readFileSync(join(base, "index.json"), "utf-8"));
  return { index, base };
}

const quickStart = [
  {
    title: "Get the index",
    command: "curl https://harbor-index.vercel.app/data/index.json | jq .",
  },
  {
    title: "Get all verdicts",
    command: "curl https://harbor-index.vercel.app/data/verdicts.json | jq .",
  },
  {
    title: "Get one rollout's full verdict + evidence",
    command: "curl https://harbor-index.vercel.app/data/per-rollout/gso-speedup-pandas-seq-to-range__BcSk2Xb.json | jq .",
  },
  {
    title: "Get the agent's original trajectory",
    command: "curl https://harbor-index.vercel.app/audit-traj/gso-speedup-pandas-seq-to-range__BcSk2Xb/agent.json | jq .",
  },
  {
    title: "Get the judge's audit trajectory",
    command: "curl https://harbor-index.vercel.app/audit-traj/gso-speedup-pandas-seq-to-range__BcSk2Xb/judge.json | jq .",
  },
  {
    title: "Get the verifier log",
    command: "curl https://harbor-index.vercel.app/audit-traj/gso-speedup-pandas-seq-to-range__BcSk2Xb/verifier.txt",
  },
];

export default function DataPage() {
  const { index } = loadData();
  const sm = index.summary;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-900">Agent data access</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          All judge results, evidence, trajectories, and verifier logs are available as
          machine-readable JSON. No authentication required. Start from{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-indigo-600">/data/index.json</code>{" "}
          and follow the download links.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Summary</h2>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700">
          <pre className="whitespace-pre-wrap">{JSON.stringify(sm, null, 2)}</pre>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Endpoints</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="py-2 pr-4 text-xs font-semibold text-slate-500">Path</th>
                <th className="py-2 pr-4 text-xs font-semibold text-slate-500">Description</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/data/index.json</td>
                <td className="py-2 pr-4 text-slate-600">Top-level index: summary, all rollout_ids, download links per rollout</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/data/overview.json</td>
                <td className="py-2 pr-4 text-slate-600">Full overview: tasks, qualitative analysis, FN patterns, model metadata</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/data/verdicts.json</td>
                <td className="py-2 pr-4 text-slate-600">All 141 verdicts: outcome class, evidence, rationale, concerns</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/data/per-rollout/&lt;rid&gt;.json</td>
                <td className="py-2 pr-4 text-slate-600">One rollout: full verdict + evidence + links to agent/judge trajectories</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/data/per-task/&lt;task_id&gt;.json</td>
                <td className="py-2 pr-4 text-slate-600">One task: all 3 model verdicts</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/audit-traj/&lt;rid&gt;/agent.json</td>
                <td className="py-2 pr-4 text-slate-600">Original agent&apos;s rollout trajectory (summarized steps, secrets scrubbed)</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/audit-traj/&lt;rid&gt;/judge.json</td>
                <td className="py-2 pr-4 text-slate-600">Judge (composer-2.5) audit trace trajectory</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/audit-traj/&lt;rid&gt;/verifier.txt</td>
                <td className="py-2 pr-4 text-slate-600">Verifier stdout log (may be truncated for large outputs)</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/audit-traj/manifest.json</td>
                <td className="py-2 pr-4 text-slate-600">Availability manifest: which trajectories exist per rollout_id</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pr-4 text-indigo-600">/agents.txt</td>
                <td className="py-2 pr-4 text-slate-600">agents.txt guide (machine-readable site map for AI agents)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Verdict schema</h2>
        <p className="text-sm text-slate-600">
          Each verdict in <code>/data/verdicts.json</code> and{" "}
          <code>/data/per-rollout/&lt;rid&gt;.json</code> follows this shape:
        </p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700">
          <pre className="whitespace-pre-wrap">{`{
  "rollout_id": "task_slug__trial_id",
  "task_id": "task_slug",
  "trial_id": "trial_id",
  "agent_model": "anthropic/claude-opus-4-8 | gpt-5.5 | gemini/gemini-3.1-pro-preview",
  "harness": "claude-code | codex | gemini-cli",
  "benchmark": "task family prefix",
  "outcome_class": "TP | TN | FP | FN",
  "verifier_signal": { "binary_reward", "reward", "status", "reward_metric" },
  "judge_verdict": { "task_truly_solved", "confidence", "summary" },
  "outcome_rationale": "one cohesive paragraph, [N] footnotes cite evidence",
  "evidence": [
    { "claim": "...", "citations": [
      { "kind": "trajectory", "steps": [N], "quote": "..." },
      { "kind": "file", "file": "/path", "line_start": N, "line_end": N, "quote": "..." }
    ]}
  ],
  "verifier_or_task_concern": "description of verifier/task defect (FN/FP only)"
}`}</pre>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Outcome classes</h2>
        <ul className="space-y-1 text-sm text-slate-600">
          <li><strong>TP</strong> — verifier PASS, agent truly solved (verifier correct)</li>
          <li><strong>TN</strong> — verifier FAIL, agent did not solve (verifier correct)</li>
          <li><strong>FP</strong> — verifier PASS, agent did NOT solve (verifier wrong: weak/gamed)</li>
          <li><strong>FN</strong> — verifier FAIL, agent DID solve (verifier wrong: broken/over-strict)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Quick start for agents</h2>
        <div className="space-y-3">
          {quickStart.map((item, index) => (
            <div
              key={item.title}
              className="rounded-lg border border-slate-800 p-4 shadow-sm"
              style={{ backgroundColor: "#020617" }}
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#38bdf8" }}>
                {index + 1}. {item.title}
              </div>
              <code
                className="block overflow-x-auto whitespace-nowrap font-mono text-[0.8rem] leading-relaxed"
                style={{ background: "transparent", color: "#facc15" }}
              >
                {item.command}
              </code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
