"use client";

import { useState } from "react";
import { COLORS } from "../../lib/colors";
import type {
  ToolActionChartsBundle,
  ToolActionComparisonTable,
} from "../../lib/tool-action-charts";
import ToolActionChart from "./ToolActionChart";

const CATEGORY_COLORS: Record<string, string> = {
  Read: COLORS.skyBlue,
  Write: COLORS.coral,
  "Internet search": COLORS.goldenYellow,
  Execute: COLORS.mutedGreen,
  Other: COLORS.gray,
};

type Props = {
  bundle: ToolActionChartsBundle;
};

function fmtRate(v: number | undefined, digits = 2): string {
  if (v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

const COMPARISON_COL_COUNT = 7;

function ToolActionComparisonTableView({ table }: { table: ToolActionComparisonTable }) {
  const { rows, title, description } = table;
  const colPct = `${100 / COMPARISON_COL_COUNT}%`;

  return (
    <div className="mt-6 w-full">
      <h3 className="text-base font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed mb-3 max-w-3xl">{description}</p>
      <div
        className="w-full overflow-x-auto border rounded-lg bg-white"
        style={{ borderColor: COLORS.lightGray }}
      >
        <table className="w-full table-fixed text-xs border-collapse">
          <colgroup>
            {Array.from({ length: COMPARISON_COL_COUNT }, (_, i) => (
              <col key={i} style={{ width: colPct }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left font-semibold text-slate-700 px-2 py-2 leading-snug">Model</th>
              <th className="text-center font-semibold text-slate-700 px-2 py-2 leading-snug">
                Turns/Task
              </th>
              <th className="text-center font-semibold text-slate-700 px-2 py-2 leading-snug">
                Actions/Turn
              </th>
              <th className="text-center font-semibold text-slate-700 px-2 py-2">Read</th>
              <th className="text-center font-semibold text-slate-700 px-2 py-2">Write</th>
              <th className="text-center font-semibold text-slate-700 px-2 py-2">Execute</th>
              <th className="text-center font-semibold text-slate-700 px-2 py-2 leading-snug">
                Internet search
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.model}
                className={`border-b border-slate-100 last:border-b-0 ${
                  i === 3 ? "border-t-2 border-t-slate-200" : ""
                }`}
              >
                <td className="px-2 py-2 font-medium text-slate-800 leading-snug break-words">
                  {row.model}
                </td>
                <td className="text-center px-2 py-2 tabular-nums text-slate-700">
                  {fmtRate(row.turnsPerTask, 1)}
                </td>
                <td className="text-center px-2 py-2 tabular-nums font-medium text-slate-900">
                  {fmtRate(row.toolCallsPerTurn)}
                </td>
                <td className="text-center px-2 py-2 tabular-nums text-slate-700">{fmtRate(row.Read)}</td>
                <td className="text-center px-2 py-2 tabular-nums text-slate-700">{fmtRate(row.Write)}</td>
                <td className="text-center px-2 py-2 tabular-nums text-slate-700">{fmtRate(row.Execute)}</td>
                <td className="text-center px-2 py-2 tabular-nums text-slate-700">
                  {fmtRate(row["Internet search"])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ToolActionCharts({ bundle }: Props) {
  const chartRows =
    bundle.chartRows ??
    (bundle.charts?.length
      ? [{ rowId: "default", commonTasks: bundle.commonTasks, charts: bundle.charts }]
      : []);
  const insightBlocks = bundle.insightBlocks ?? [];
  const comparisonTable = bundle.comparisonTable;
  const { yMax } = bundle;
  const categories = chartRows[0]?.charts[0]?.categories ?? [];
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(cat: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const sectionId = "tool-actions-by-turn";

  return (
    <section id={sectionId} className="mt-8 mb-6 scroll-mt-4">
      <h2 className="group text-lg font-semibold mb-1">
        Tool actions by turn
        <a
          href={`#${sectionId}`}
          aria-label="Link to Tool actions by turn"
          className="ml-2 text-slate-300 hover:text-slate-600 no-underline font-normal text-base opacity-0 group-hover:opacity-100 transition-opacity"
        >
          #
        </a>
      </h2>
      <p className="text-sm text-slate-600 leading-relaxed mb-3 max-w-3xl">
        Stacked tool-action counts by agent turn for three frontier models on terminus-2 (row 1) and
        their native harnesses — Codex, Claude Code, and Gemini CLI (row 2).
      </p>

      <div className="space-y-2.5 mb-4 max-w-3xl">
        {insightBlocks
          .filter((block) => !block.label.endsWith("— action mix"))
          .map((block) => (
            <p key={block.label} className="text-sm text-slate-700 leading-relaxed m-0">
              <span className="font-semibold text-slate-900">{block.label}. </span>
              {block.text}
            </p>
          ))}
      </div>

      <p className="text-xs text-slate-500 mb-3">
        {bundle.commonTasks} paired tasks (same set for both rows — each task has all six harness×model
        trials) · shared y-axis · turns 0–49 · batched shell (<code>&amp;&amp;</code> / <code>;</code>)
        split into separate actions · categories: Read, Write, Execute, Internet search, Other
      </p>

      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => toggle(cat)}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border transition-opacity ${
              hidden.has(cat) ? "opacity-40" : ""
            }`}
            style={{ borderColor: COLORS.lightGray, background: COLORS.white }}
          >
            <span
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ background: CATEGORY_COLORS[cat] ?? COLORS.gray }}
            />
            <span className="font-medium">{cat}</span>
          </button>
        ))}
        <span className="text-slate-500 self-center">Click to hide a category</span>
      </div>

      {chartRows.map((row) => (
        <div key={row.rowId} className="mb-4">
          <p className="text-xs font-semibold text-slate-600 mb-2">
            {row.rowId === "terminus-2"
              ? "Row 1 · terminus-2"
              : "Row 2 · native harnesses (Codex, Claude Code, Gemini CLI)"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {row.charts.map((data) => (
              <ToolActionChart
                key={`${row.rowId}-${data.harness}-${data.model}`}
                data={data}
                layout="inline"
                yMax={yMax}
                hiddenCategories={hidden}
              />
            ))}
          </div>
        </div>
      ))}

      <details className="group mt-3 mb-4 max-w-3xl rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-800 select-none flex items-center gap-1.5">
          <span className="text-slate-400 group-open:rotate-90 transition-transform inline-block w-3">▸</span>
          How are tool calls categorized?
        </summary>
        <div className="mt-2 ml-4 space-y-2 text-xs text-slate-700 leading-relaxed">
          <p className="m-0">
            Each tool call is classified into the same five intent buckets across harnesses.
            <strong> terminus-2</strong> uses <code>bash_command</code> keystrokes;{" "}
            <strong>Codex</strong> uses <code>exec_command</code> / <code>web_search_call</code>;{" "}
            <strong>Claude Code</strong> uses <code>Bash</code>, <code>Read</code>, <code>Write</code>,{" "}
            <code>Edit</code>, <code>Grep</code>, <code>WebSearch</code>, etc.;{" "}
            <strong>Gemini CLI</strong> uses <code>run_shell_command</code>, <code>read_file</code>,{" "}
            <code>write_file</code>, <code>replace</code>, <code>google_web_search</code>, etc.
            For cross-harness fairness, shell keystrokes/commands joined by <code>&amp;&amp;</code> or{" "}
            <code>;</code> count as <strong>separate actions</strong> (heredocs and inline python stay
            one unit). Non-work tools (plans, todos, <code>mark_task_complete</code>) count as{" "}
            <strong>Other</strong>.
          </p>
          <p className="m-0">
            Keystrokes are split on <code>&&</code> and <code>;</code> into individual shell
            commands; each fragment is heuristically tagged:
          </p>
          <ul className="list-disc pl-4 space-y-1 m-0">
            <li>
              <strong>Write</strong> — redirects/heredocs to files, <code>sed -i</code>, <code>tee</code>,{" "}
              <code>touch</code>, <code>mkdir</code>, <code>cp</code>, <code>mv</code>, <code>rm</code>,{" "}
              <code>git commit</code>, etc.
            </li>
            <li>
              <strong>Execute</strong> — builds/tests (<code>make</code>, <code>pytest</code>,{" "}
              <code>cargo</code>, <code>npm</code>, compilers), <code>pip install</code>, running
              scripts/binaries, inline <code>python3 &lt;&lt; EOF</code>, etc.
            </li>
            <li>
              <strong>Internet search</strong> — web/API fetches: <code>curl</code>, <code>wget</code>,{" "}
              <code>git clone</code>, HTTP clients (<code>requests</code>, <code>urllib</code>,{" "}
              <code>httpx</code>), MCP/JSON-RPC calls. Not local file grep/find.
            </li>
            <li>
              <strong>Read</strong> — local inspection only: <code>cat</code>, <code>head</code>,{" "}
              <code>ls</code>, <code>grep</code>, <code>rg</code>, <code>find</code>, <code>wc</code>,{" "}
              <code>diff</code>, <code>git status</code>, etc.
            </li>
            <li>
              <strong>Other</strong> — <code>mark_task_complete</code>, interactive control (
              <code>C-c</code>, <code>q</code>), shell loop fragments, incomplete multi-step
              keystrokes, or non-bash tools.
            </li>
          </ul>
          <p className="m-0 text-slate-600">
            Keystrokes with heredocs (<code>&lt;&lt; EOF</code>) stay as one command so in-script
            semicolons are not split. One batched shell tool call can therefore add several classified
            actions at the same turn. Action-mix lines under each chart are shares of all classified
            actions for that model across the {bundle.commonTasks} paired tasks.
          </p>
        </div>
      </details>

      {comparisonTable ? <ToolActionComparisonTableView table={comparisonTable} /> : null}
    </section>
  );
}
