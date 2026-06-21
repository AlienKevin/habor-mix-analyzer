import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { ReactNode } from "react";

type AlphaCI = { alpha?: number | null; kappa?: number | null; ac2?: number | null;
                 ci_lo?: number | null; ci_hi?: number | null };

type Comparison = {
  label: string;
  legacy?: boolean;
  n_pairs: number;
  n_excluded?: number;
  trial_fields: {
    closeness: { agreement: number; alpha: number; ci_lo?: number; ci_hi?: number; gwet_ac1?: AlphaCI };
    reward_hacking: { agreement: number; alpha: number; ci_lo?: number; ci_hi?: number; gwet_ac1?: AlphaCI };
    task_quality?: { agreement: number; alpha: number; ci_lo?: number; ci_hi?: number; gwet_ac1?: AlphaCI };
  };
  facets: Record<"A" | "B" | "C" | "D", {
    alpha_masi: AlphaCI;
    alpha_masi_bare?: AlphaCI;
    primary_ac1?: AlphaCI;
    mean_set_size_left: number;
    mean_set_size_right: number;
  }>;
  bundle_agreement?: {
    mean: number;
    alpha: number | null;
    exact_pct: number;
    zero_pct: number;
    threshold: string;
    n: number;
  };
  judge_cost?: {
    total_usd: number | null;
    partial?: boolean;
    by_judge: { judge: string; usd: number | null; n_reports: number; n_tracked: number }[];
  };
  facet_D_primary: {
    n: number; agreement: number;
    cohen_kappa: AlphaCI; gwet_ac2_linear: AlphaCI;
    marginal_left: Record<string, number>;
    marginal_right: Record<string, number>;
  };
  mode_count: { left_mean: number; right_mean: number; same_count_pct: number };
};

type ThreeWay = {
  labels: string[]; n_pairs: number;
  closeness: { alpha: AlphaCI; gwet_ac1?: AlphaCI; all_three_agree_pct: number; majority_pct: number };
  reward_hacking: { alpha: AlphaCI; gwet_ac1?: AlphaCI };
  task_quality: { alpha: AlphaCI; gwet_ac1?: AlphaCI };
  facets: Record<"A" | "B" | "C" | "D", { alpha_masi: AlphaCI; alpha_masi_bare?: AlphaCI }>;
};

type Bundle = {
  schema_compliance: Record<string, { n: number; nested: number; flattened: number }>;
  comparisons: Comparison[];
  three_way: ThreeWay;
  notes: any;
};

function loadBundle(): Bundle | null {
  const p = path.join(process.cwd(), "data", "consistency.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Bundle;
}

/** Previous iter-11 multi-judge snapshot (4 self + 6 cross-family), shown
 *  collapsed below the current sample's tables. */
function loadIter11Bundle(): Bundle | null {
  const p = path.join(process.cwd(), "data", "consistency_iter11.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Bundle;
  } catch {
    return null;
  }
}

const num2 = (x: number | null | undefined) =>
  x == null ? "—" : x.toFixed(2);

function fmt(b: AlphaCI | undefined | null) {
  if (!b) return { val: "—", lk: "" };
  const v = b.alpha ?? b.kappa ?? b.ac2;
  if (v == null) return { val: "—", lk: "" };
  const val = v.toFixed(2);
  const lk =
    v < 0    ? "poor"        :
    v < 0.20 ? "slight"      :
    v < 0.40 ? "fair"        :
    v < 0.60 ? "moderate"    :
    v < 0.80 ? "substantial" :
                "almost perfect";
  return { val, lk };
}

function LK({ lk }: { lk: string }) {
  if (!lk) return null;
  const color =
    lk === "almost perfect" || lk === "substantial" ? "text-emerald-700" :
    lk === "moderate" ? "text-amber-700" :
    "text-rose-700";
  return <span className={`ml-1 text-[0.65rem] uppercase ${color}`}>{lk}</span>;
}

function MiniHead({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500 mt-3 first:mt-0 mb-1.5">
      {children}
    </h3>
  );
}

function Prose({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-slate-700 leading-relaxed ${className}`}>{children}</p>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="text-xs text-slate-700 leading-relaxed pl-0.5 marker:text-slate-400">
      {children}
    </li>
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2"
    >
      <summary className="cursor-pointer text-xs font-semibold text-slate-800 select-none flex items-center gap-1.5">
        <span className="text-slate-400 group-open:rotate-90 transition-transform inline-block w-3">▸</span>
        {title}
      </summary>
      <div className="mt-2 ml-4 space-y-2">{children}</div>
    </details>
  );
}

function shortLabel(label: string): string {
  return label
    .replace(" (k=5 split-half)", "")
    .replace(" (k=5 each, cross-family)", "");
}

function fmtUsd(x: number): string {
  if (x >= 100) return `$${Math.round(x)}`;
  if (x >= 10) return `$${x.toFixed(1)}`;
  return `$${x.toFixed(2)}`;
}

function judgeCostLine(c: Comparison): string | null {
  const jc = c.judge_cost;
  if (!jc) return null;
  if (jc.total_usd != null) {
    const suffix = jc.partial ? "+" : "";
    if (isSelfColumn(c.label)) {
      return `${fmtUsd(jc.total_usd)}${suffix} judge cost`;
    }
    if (jc.by_judge.length === 2 && jc.by_judge.every((j) => j.usd != null)) {
      return `${fmtUsd(jc.total_usd)}${suffix} combined (${jc.by_judge.map((j) => fmtUsd(j.usd!)).join(" + ")})`;
    }
    return `${fmtUsd(jc.total_usd)}${suffix} combined judge cost`;
  }
  const tracked = jc.by_judge.filter((j) => j.usd != null);
  if (tracked.length === 0) return null;
  if (tracked.length === 1) {
    return `${fmtUsd(tracked[0].usd!)} judge cost (${tracked[0].judge} only; others not logged)`;
  }
  return null;
}

function isSelfColumn(label: string): boolean {
  return label.includes("self-consistency");
}

function crossFamilyFamilies(label: string): [string, string] | null {
  const l = label.toLowerCase();
  const found: string[] = [];
  if (l.includes("composer")) found.push("composer");
  if (l.includes("gemini")) found.push("gemini");
  if (l.includes("gpt")) found.push("gpt");
  if (l.includes("opus")) found.push("opus");
  if (found.length !== 2) return null;
  return found[0] < found[1] ? [found[0], found[1]] : [found[1], found[0]];
}

const CROSS_FAMILY_ORDER: [string, string][] = [
  ["composer", "gpt"],
  ["composer", "opus"],
  ["composer", "gemini"],
  ["gpt", "opus"],
  ["gemini", "opus"],
];

function sortCrossFamilyCols(cols: Comparison[]): Comparison[] {
  const rank = new Map(CROSS_FAMILY_ORDER.map((pair, i) => [pair.join("|"), i]));
  return [...cols].sort((a, b) => {
    const pa = crossFamilyFamilies(a.label);
    const pb = crossFamilyFamilies(b.label);
    const ra = pa ? rank.get(pa.join("|")) ?? 999 : 999;
    const rb = pb ? rank.get(pb.join("|")) ?? 999 : 999;
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
  });
}

function judgeShortName(label: string): string {
  return shortLabel(label)
    .replace(" self-consistency", "")
    .replace(" (high)", "");
}

type MetricRow = {
  id: string;
  label: string;
  sub?: string;
  highlight?: boolean;
  value: (c: Comparison) => { val: string; lk: string; note?: string };
};

function metricRows(): MetricRow[] {
  return [
    {
      id: "closeness",
      label: "closeness",
      sub: "α",
      value: (c) => {
        const f = c.trial_fields.closeness;
        return fmt({ alpha: f.alpha, ci_lo: f.ci_lo, ci_hi: f.ci_hi });
      },
    },
    {
      id: "bundle",
      label: "bundle",
      sub: "failure-mode tuple",
      highlight: true,
      value: (c) => {
        const b = c.bundle_agreement;
        if (!b) return { val: "—", lk: "" };
        const r = fmt({ alpha: b.mean });
        return {
          ...r,
          note: `exact ${Math.round(b.exact_pct * 100)}% · zero ${Math.round(b.zero_pct * 100)}%`,
        };
      },
    },
    ...(["A", "B", "C", "D"] as const).map((f) => ({
      id: `facet-${f}`,
      label: `facet ${f}`,
      sub: f === "C" ? "α-MASI" : "AC₁",
      value: (c: Comparison) => {
        const data = f === "C" ? c.facets[f].alpha_masi : c.facets[f].primary_ac1;
        return fmt(data);
      },
    })),
  ];
}

function SummaryCards({ title, rows }: { title: string; rows: Comparison[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <ul
        className={`grid gap-2 list-none p-0 m-0 ${
          rows.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
        }`}
      >
        {rows.map((c) => {
          const costLine = judgeCostLine(c);
          return (
            <li key={c.label} className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
              <div className="text-xs font-medium text-slate-800">{judgeShortName(c.label)}</div>
              <div className="text-[0.65rem] text-slate-500 mt-0.5">
                {isSelfColumn(c.label) ? "k=5 split-half" : "cross-family"} · n={c.n_pairs}
              </div>
              {costLine && (
                <div className="text-[0.65rem] text-slate-500 mt-0.5">{costLine}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ComparisonTable({
  title,
  rows,
  metrics,
}: {
  title: string;
  rows: Comparison[];
  metrics: MetricRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full text-xs border-collapse min-w-[36rem]">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-1.5 text-left border-b border-slate-300 min-w-[9rem]">
                Comparison
              </th>
              {metrics.map((m) => (
                <th
                  key={m.id}
                  className={`px-2 py-1.5 text-left border-b border-slate-300 whitespace-nowrap ${
                    m.highlight ? "bg-slate-100" : ""
                  }`}
                >
                  <div className="font-semibold">{m.label}</div>
                  {m.sub && (
                    <div className="text-[0.6rem] text-slate-500 font-normal">{m.sub}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const legacy = c.legacy === true;
              const costLine = judgeCostLine(c);
              return (
                <tr key={c.label} className={`border-b border-slate-100 ${legacy ? "opacity-40" : ""}`}>
                  <td className="sticky left-0 z-10 bg-white px-2 py-1.5 align-top border-r border-slate-100 min-w-[9rem]">
                    <div className="font-medium text-slate-800 leading-snug">{judgeShortName(c.label)}</div>
                    <div className="text-[0.6rem] text-slate-500 mt-0.5">
                      {isSelfColumn(c.label) ? "k=5 split-half" : "cross-family"} · n={c.n_pairs}
                      {c.n_excluded ? ` (excl. ${c.n_excluded})` : ""}
                    </div>
                    {costLine && (
                      <div className="text-[0.6rem] text-slate-500 mt-0.5">{costLine}</div>
                    )}
                  </td>
                  {metrics.map((m) => {
                    const r = m.value(c);
                    return (
                      <td
                        key={m.id}
                        className={`px-2 py-1.5 tabular-nums align-top whitespace-nowrap ${
                          m.highlight ? "bg-slate-50/80" : ""
                        }`}
                      >
                        <span className="font-semibold">{r.val}</span>
                        <LK lk={r.lk} />
                        {r.note && (
                          <div className="text-[0.6rem] text-slate-500 font-normal mt-0.5">{r.note}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JudgeConsistency() {
  const bundle = loadBundle();
  if (!bundle) return null;
  const cs = bundle.comparisons;
  const selfCols = cs.filter((c) => isSelfColumn(c.label));
  const crossCols = sortCrossFamilyCols(cs.filter((c) => !isSelfColumn(c.label)));
  const metrics = metricRows();

  const iter11 = loadIter11Bundle();
  const iter11Self = iter11 ? iter11.comparisons.filter((c) => isSelfColumn(c.label)) : [];
  const iter11Cross = iter11
    ? sortCrossFamilyCols(iter11.comparisons.filter((c) => !isSelfColumn(c.label)))
    : [];

  return (
    <section id="judge-consistency" className="mb-8 border border-slate-200 rounded-lg p-4 bg-white scroll-mt-4">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h2 className="font-semibold text-base group">
          <a
            href="#judge-consistency"
            className="no-underline hover:underline"
          >
            Judge consistency
            <span
              aria-hidden="true"
              className="ml-1.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              #
            </span>
          </a>
        </h2>
        <Link
          href="/aft/iters/"
          className="text-xs text-blue-700 hover:underline whitespace-nowrap"
        >
          rubric iteration history (iter-1 → iter-12) →
        </Link>
      </div>

      {/* ── at-a-glance ── */}
      <div className="mb-4 max-w-3xl space-y-4">
        <Prose>
          Stratified sample of <strong>35 trials</strong> (one per Harbor-Index task),
          judged with the AFT <strong>iter-11</strong> rubric (§4.5 + §4.6 calibration examples).
          Two tables below: <strong>{selfCols.length} self-consistency</strong> judges, then{" "}
          <strong>{crossCols.length} cross-family</strong> pair.
        </Prose>
        <SummaryCards title="Self-consistency" rows={selfCols} />
        {crossCols.length > 0 && (
          <SummaryCards title="Cross-family" rows={crossCols} />
        )}
      </div>

      <div className="mb-4 max-w-3xl space-y-2">
        <Collapsible title="Why measure judge consistency?" defaultOpen>
          <Prose>
            In the standard <em>LLM-as-a-judge</em> setup (
            <a href="https://arxiv.org/abs/2306.05685" target="_blank" rel="noopener noreferrer"
              className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700">
              Zheng et al., <em>NeurIPS&nbsp;2023</em>
            </a>
            ), one model scores another&apos;s outputs. Before comparing systems on those
            scores, we need to know the judge is stable — not guessing on skewed labels.
          </Prose>
          <Prose className="mt-1.5">
            Each cell uses <strong>Krippendorff&apos;s α</strong> (
            <a href="https://us.sagepub.com/en-us/nam/content-analysis/book258450" target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700">
              Krippendorff, 2004
            </a>
            ): chance-corrected agreement where <strong>0 = random</strong>,{" "}
            <strong>1 = perfect</strong>. Raw &ldquo;% agreement&rdquo; is misleading when
            most trials share the same label (e.g. no reward-hacking).
          </Prose>
        </Collapsible>

        <Collapsible title="Which metric per table row?">
          <MiniHead>Trial-level rows</MiniHead>
          <ul className="list-disc pl-4 space-y-1">
            <Bullet><strong>Nominal α</strong> — closeness (single label).</Bullet>
          </ul>
          <MiniHead>Bundle row</MiniHead>
          <ul className="list-disc pl-4 space-y-1">
            <Bullet>
              <strong>Bundle agreement</strong> — per-trial mean tuple-similarity on the full
              (A, B, C, D) failure_mode. Partial overlap gets proportional credit
              (3/4 facets match → 0.75). One-number summary of &ldquo;same failure pattern?&rdquo;
            </Bullet>
          </ul>
          <MiniHead>Facet rows A / B / C / D</MiniHead>
          <ul className="list-disc pl-4 space-y-1">
            <Bullet>
              <strong>A, B, D → Gwet&apos;s AC₁</strong> on the <em>primary code</em> (first
              failure_mode entry). These facets have dominant marginals (A3, B1, D3 each ≥
              55%); plain α collapses on skew (&ldquo;kappa paradox&rdquo;).
            </Bullet>
            <Bullet>
              <strong>C → α with MASI distance</strong> (
              <a href="https://aclanthology.org/L06-1148/" target="_blank" rel="noopener noreferrer"
                className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700">
                Passonneau, <em>LREC&nbsp;2006</em>
              </a>
              ) on the full multi-label set. C&apos;s marginal is roughly uniform; MASI gives
              partial credit when judges agree on most codes —{" "}
              <code>{`{A.1, A.2}`}</code> vs <code>{`{A.1}`}</code> is closer than vs{" "}
              <code>{`{B.3}`}</code>.
            </Bullet>
          </ul>
          <MiniHead>Interpreting magnitudes</MiniHead>
          <div className="overflow-x-auto">
            <table className="text-[0.65rem] border-collapse w-full max-w-md">
              <tbody>
                {[
                  ["≥ 0.80", "almost perfect", "text-emerald-700"],
                  ["0.60 – 0.80", "substantial", "text-emerald-700"],
                  ["0.40 – 0.60", "moderate", "text-amber-700"],
                  ["0.20 – 0.40", "fair", "text-rose-700"],
                  ["< 0.20", "slight", "text-rose-700"],
                ].map(([range, label, color]) => (
                  <tr key={range} className="border-b border-slate-100">
                    <td className="py-1 pr-3 tabular-nums text-slate-600 whitespace-nowrap">{range}</td>
                    <td className={`py-1 font-medium ${color}`}>{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Prose className="mt-1.5 text-slate-600">
            Scale:{" "}
            <a href="https://www.jstor.org/stable/2529310" target="_blank" rel="noopener noreferrer"
              className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700">
              Landis &amp; Koch (1977)
            </a>
            . Krippendorff&apos;s publishable floor for content-analysis claims:{" "}
            <strong>α ≥ 0.667</strong>.
          </Prose>
        </Collapsible>

        <Collapsible title="Judging pipeline & eval design">
          <MiniHead>Pipeline</MiniHead>
          <ul className="list-disc pl-4 space-y-1">
            <Bullet>
              Show the{" "}
              <Link href="/aft?view=machine" className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700">
                AFT v1.0 rubric
              </Link>{" "}
              to the judge model (composer-2.5, gemini-3.1-pro, gpt-5.5/high via codex, or claude-opus-4-7/high via Claude CLI).
            </Bullet>
            <Bullet>
              Output: closeness + reward-hacking verdicts, plus multi-label
              codes for facets A (stage) · B (cause) · C (behaviour) · D (impact).
              The iter-11 schema also includes <code>task_quality</code>; the site table hides it.
            </Bullet>
            <Bullet>
              Run <strong>k = 5</strong> times per trial; aggregate by majority vote (code
              enters iff ≥ 3/5 runs emit it; mode for single-label fields).
            </Bullet>
          </ul>
          <MiniHead>Rubric (iter-11)</MiniHead>
          <Prose>
            Deployed May 22 2026: iter-10 (A6 SCOPE preamble) plus §4.6 — three worked-example
            calibration trials (C7.1, C2.1, C2.4).{" "}
            <Link href="/aft/iters/" className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700">
              Full iteration history →
            </Link>
          </Prose>
          <MiniHead>Self-consistency table</MiniHead>
          <ul className="list-disc pl-4 space-y-1">
            <Bullet>
              Split five runs into overlapping halves:{" "}
              <code>A = {"{r1, r2, r3}"}</code>, <code>B = {"{r3, r4, r5}"}</code>.
            </Bullet>
            <Bullet>
              Aggregate each half with ≥ 2-of-3 majority; compute AC₁ (A/B/D) or α-MASI (C)
              between the two aggregated annotations.
            </Bullet>
            <Bullet>
              Same model + prompt, no cross-judge style confound — measures deployment stability.
            </Bullet>
          </ul>
          <MiniHead>Cross-family table</MiniHead>
          <ul className="list-disc pl-4 space-y-1">
            <Bullet>
              Each judge family runs k=5 on the same n=35 trials; columns compare
              k=5 majority annotations pairwise (composer ↔ gemini, composer ↔ gpt-5.5, etc.).
            </Bullet>
            <Bullet>
              Standard <em>between-judge</em> check — if the taxonomy captures &ldquo;the
              failure&rdquo; not &ldquo;the judge&apos;s reading,&rdquo; this column must clear
              the publishable threshold.
            </Bullet>
          </ul>
        </Collapsible>
      </div>

      <div className="space-y-5">
        <ComparisonTable
          title={`Self-consistency (${selfCols.length} judges)`}
          rows={selfCols}
          metrics={metrics}
        />
        {crossCols.length > 0 && (
          <ComparisonTable
            title={`Cross-family (${crossCols.length} pairs)`}
            rows={crossCols}
            metrics={metrics}
          />
        )}

        {iter11 && (iter11Self.length > 0 || iter11Cross.length > 0) && (
          <Collapsible title="Previous Harbor-Index trials (AFT iter-11)">
            <Prose className="text-slate-600 mb-3">
              The earlier iter-11 audit on the original stratified-35 Harbor-Index
              sample — all four judge families (composer-2.5, gemini-3.1-pro,
              gpt-5.5/high, claude-opus-4-7/high) and every cross-family pair. Kept
              here for reference; superseded by the 2026-05-26 resample above.
            </Prose>
            <div className="space-y-5">
              {iter11Self.length > 0 && (
                <ComparisonTable
                  title={`Self-consistency (${iter11Self.length} judges)`}
                  rows={iter11Self}
                  metrics={metrics}
                />
              )}
              {iter11Cross.length > 0 && (
                <ComparisonTable
                  title={`Cross-family (${iter11Cross.length} pairs)`}
                  rows={iter11Cross}
                  metrics={metrics}
                />
              )}
            </div>
          </Collapsible>
        )}
      </div>

      <div className="mt-4 max-w-3xl space-y-2">
        <Collapsible title="Sample & judges shown">
          <Prose className="text-slate-600">
            Refreshed on the <strong>2026-05-26 resampled 35-trial harbor-index set</strong>,
            judged with <strong>gpt-5.5 (high)</strong> and <strong>composer-2.5</strong> only.
            The older iter-11 judges (gemini, claude-opus) and their cross-family pairs are
            hidden pending a re-judge of the new sample.
          </Prose>
        </Collapsible>
        <Collapsible title="Source & rubric notes">
          <Prose className="text-slate-600">
            Numbers from both judges under the iter-11 rubric (citation-stripped machine prompt —{" "}
            <Link href="/aft?view=machine" className="underline hover:text-slate-800">machine view</Link>
            ). §4.5 = adjudication rules; §4.6 = three worked-example calibration trials.{" "}
            <Link href="/aft/iters/#judge-trace-audit" className="underline hover:text-slate-800">
              Judge trace audit
            </Link>{" "}
            explains cross-family divergence (framing vs missed reads).{" "}
            <Link href="/aft/iters/" className="underline hover:text-slate-800">Iteration history</Link>{" "}
            has the iter-by-iter evolution and diffs.
          </Prose>
        </Collapsible>
      </div>
    </section>
  );
}
