import React from "react";
import Link from "next/link";
import {
  aftClosenessTally,
  aftFacetCounts,
  aftByModel,
  aftCodeTitle,
  aftCodeColor,
  stripCode,
  type FacetKey,
  type AFTReportWithSample,
} from "../../lib/data";
import { COLORS, CLOSENESS_SOLID } from "../../lib/colors";

export const CORPUS_FACETS: { key: FacetKey; title: string; subtitle: string }[] = [
  { key: "A", title: "A — Stage",       subtitle: "when in the agent loop the failure was tagged" },
  { key: "B", title: "B — Root cause",  subtitle: "why the agent failed" },
  { key: "C", title: "C — Behavior",    subtitle: "what the agent did wrong" },
  { key: "D", title: "D — Impact",      subtitle: "how bad the failure was" },
];

export function CorpusFacetPies({
  reports,
  codeHref,
}: {
  reports: AFTReportWithSample[];
  /** Builder for the per-code legend link. Omit to render codes as plain
   *  (non-link) rows — the /code route is scoped to the harbor-index corpus,
   *  so tb3 leaves it unset rather than linking to the wrong examples. */
  codeHref?: (code: string) => string | undefined;
}) {
  if (reports.length === 0) return null;
  return (
    <section id="corpus-failure-mode-mix" className="mb-8 border border-slate-200 rounded-lg p-4 bg-white scroll-mt-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-base group">
          <a href="#corpus-failure-mode-mix" className="no-underline hover:underline">
            Corpus failure-mode mix
            <span aria-hidden="true" className="ml-1.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">#</span>
          </a>
        </h2>
        <span className="text-xs text-slate-500">
          all {reports.length.toLocaleString()} trials combined
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CORPUS_FACETS.map((f) => (
          <CorpusFacetPanel key={f.key} reports={reports} facet={f} codeHref={codeHref} />
        ))}
      </div>
    </section>
  );
}

function CorpusFacetPanel({
  reports, facet, codeHref,
}: {
  reports: AFTReportWithSample[];
  facet: { key: FacetKey; title: string; subtitle: string };
  codeHref?: (code: string) => string | undefined;
}) {
  const counts = [...aftFacetCounts(reports, facet.key).entries()]
    .sort((a, b) => b[1] - a[1]);
  const total = counts.reduce((a, b) => a + b[1], 0);
  const THRESHOLD = 5;
  const isBig = ([, n]: [string, number]) => total && (100 * n) / total > THRESHOLD;
  const big = counts.filter(isBig);
  const small = counts.filter((e) => !isBig(e));
  const smallTotal = small.reduce((a, b) => a + b[1], 0);
  const row = ([code, n]: [string, number]) => {
    const pct = total ? (100 * n) / total : 0;
    const href = codeHref?.(code);
    const inner = (
      <>
        <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 mt-1" style={{ background: aftCodeColor(code) }} />
        <span className="font-mono text-[0.7rem] w-12 shrink-0">{code}</span>
        <span className="text-slate-700 flex-1 min-w-0 break-words">
          {aftCodeTitle(code).replace(/^[A-Z]\d+(?:\.\d+)?\s+/, "")}
        </span>
        <span className="tabular-nums shrink-0 text-slate-600">
          <strong>{n}</strong> <span className="text-slate-400">({pct.toFixed(0)}%)</span>
        </span>
      </>
    );
    const cls = "flex items-start gap-2 -mx-1 px-1 py-1 rounded leading-snug";
    return href ? (
      <Link key={code} href={href} className={`${cls} hover:bg-slate-50`}>
        {inner}
      </Link>
    ) : (
      <div key={code} className={cls}>{inner}</div>
    );
  };
  return (
    <div id={`facet-${facet.key}`} className="border border-slate-200 rounded p-3 scroll-mt-4">
      <div className="mb-2">
        <h3 className="font-semibold text-sm">{facet.title}</h3>
        <p className="text-[0.65rem] text-slate-500">{facet.subtitle}</p>
      </div>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4">
        <div className="shrink-0">
          <CorpusPie entries={counts} total={total} size={160} />
        </div>
        <div className="flex-1 min-w-0 w-full space-y-1 text-xs">
          {big.map(row)}
          {small.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 py-1 select-none">
                + {small.length} more ≤ {THRESHOLD}% ({total ? ((100 * smallTotal) / total).toFixed(0) : 0}% combined)
              </summary>
              <div className="space-y-1 mt-1">{small.map(row)}</div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function CorpusPie({ entries, total, size = 160 }: {
  entries: [string, number][]; total: number; size?: number;
}) {
  if (total === 0) return null;
  const r = size / 2, cx = r, cy = r;
  let cumul = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {entries.map(([code, n], i) => {
        const start = cumul / total; cumul += n;
        const end = cumul / total;
        const a0 = start * Math.PI * 2 - Math.PI / 2;
        const a1 = end * Math.PI * 2 - Math.PI / 2;
        const large = end - start > 0.5 ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        if (entries.length === 1) {
          return <circle key={i} cx={cx} cy={cy} r={r} fill={aftCodeColor(code)} />;
        }
        const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
        return (
          <path key={i} d={d} fill={aftCodeColor(code)}>
            <title>{`${code}: ${n} (${((100 * n) / total).toFixed(1)}%)`}</title>
          </path>
        );
      })}
    </svg>
  );
}

export type Group = {
  label: string;
  rs: AFTReportWithSample[];
  href?: string;
  parts?: { left: string; right: string };
};

export function ModelBreakdown({
  reports,
  modelHref,
  commentary,
}: {
  reports: AFTReportWithSample[];
  /** Optional builder for the per-model link; omit to render plain text. */
  modelHref?: (model: string) => string | undefined;
  commentary?: React.ReactNode;
}) {
  if (reports.length === 0) return null;
  const PIN_ORDER = ["gpt-5.5", "claude-opus-4-7", "gemini-3.1-pro-preview"];
  const pinRank = (m: string) => {
    const i = PIN_ORDER.indexOf(m);
    return i === -1 ? Infinity : i;
  };
  const groups: Group[] = [...aftByModel(reports).entries()]
    .map(([model, rs]) => ({ label: model, rs, href: modelHref?.(model) }))
    .sort((a, b) => {
      const ra = pinRank(a.label), rb = pinRank(b.label);
      if (ra !== rb) return ra - rb;
      return b.rs.length - a.rs.length;
    });
  return (
    <GroupBreakdown
      groups={groups}
      title="Per-model failure breakdown"
      labelHeader="model"
      hint={
        groups.length === 1
          ? "single model in this corpus"
          : "click a model for facet-level pie charts and category examples"
      }
      commentary={commentary}
      anchorId="per-model"
    />
  );
}

export function GroupBreakdown({
  groups, title, labelHeader, hint, commentary, groupRow, splitLabelHeaders, anchorId,
}: {
  groups: Group[];
  title: string;
  labelHeader: string;
  hint?: string;
  commentary?: React.ReactNode;
  groupRow?: (g: Group) => { domain: string; sub: string };
  splitLabelHeaders?: [string, string];
  anchorId?: string;
}) {
  if (groups.length === 0) return null;
  const splitMode = !!splitLabelHeaders && groups.every((g) => g.parts);
  const colSpan = splitMode ? 10 : 9;
  const headers = groups.map((g, i) => {
    if (!groupRow) return { newDomain: false, newSub: false, domain: "", sub: "" };
    const cur = groupRow(g);
    const prev = i === 0 ? null : groupRow(groups[i - 1]);
    return {
      newDomain: !prev || prev.domain !== cur.domain,
      newSub:    !prev || prev.sub !== cur.sub,
      domain: cur.domain,
      sub: cur.sub,
    };
  });
  return (
    <section id={anchorId} className="mb-8 border border-slate-200 rounded-lg p-4 bg-white scroll-mt-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-base group">
          <a href={`#${anchorId}`} className="no-underline hover:underline">
            {title}
            <span aria-hidden="true" className="ml-1.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">#</span>
          </a>
        </h2>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {commentary}
      <ClosenessProfileChart groups={groups} headers={headers} splitMode={splitMode} />
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full text-xs min-w-[40rem]">
          <thead className="bg-slate-50">
            <tr className="text-left">
              {splitMode && splitLabelHeaders ? (
                <>
                  <th className="px-2 py-1.5 text-right">{splitLabelHeaders[0]}</th>
                  <th className="px-2 py-1.5">{splitLabelHeaders[1]}</th>
                </>
              ) : (
                <th className="px-2 py-1.5">{labelHeader}</th>
              )}
              <th className="px-2 py-1.5 text-right">n</th>
              <th className="px-2 py-1.5 text-right">near</th>
              <th className="px-2 py-1.5 text-right">partial</th>
              <th className="px-2 py-1.5 text-right">far</th>
              <th className="px-2 py-1.5" title="Stage — when in the agent loop the failure happened">top A — stage</th>
              <th className="px-2 py-1.5" title="Root cause — why the agent failed">top B — cause</th>
              <th className="px-2 py-1.5" title="Behavior — what the agent did wrong">top C — behavior</th>
              <th className="px-2 py-1.5" title="Impact — how bad the failure was">top D — impact</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ label, rs, href, parts }, i) => {
              const cl = aftClosenessTally(rs);
              const pct = (n: number) => rs.length ? `${((100 * n) / rs.length).toFixed(0)}%` : "—";
              const h = headers[i];
              return (
                <React.Fragment key={label}>
                  {h.newDomain && (
                    <tr>
                      <td colSpan={colSpan} className="px-2 py-1.5 font-semibold text-[0.75rem]"
                          style={{ background: COLORS.lavender, color: COLORS.purple }}>
                        {h.domain}
                      </td>
                    </tr>
                  )}
                  {h.newSub && !h.newDomain && (
                    <tr>
                      <td colSpan={colSpan} className="px-2 py-1 text-[0.65rem] uppercase tracking-wide"
                          style={{ background: COLORS.veryLightGray, color: COLORS.purple }}>
                        {h.sub}
                      </td>
                    </tr>
                  )}
                  {h.newDomain && (
                    <tr>
                      <td colSpan={colSpan} className="px-2 py-1 text-[0.65rem] uppercase tracking-wide"
                          style={{ background: COLORS.veryLightGray, color: COLORS.purple }}>
                        {h.sub}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-200 hover:bg-slate-50">
                    {splitMode && parts ? (
                      <>
                        <td className="px-2 py-1.5 text-right">
                          <span className="font-mono text-slate-700">{parts.left}</span>
                          <span className="text-slate-400 ml-1">·</span>
                        </td>
                        <td className="px-2 py-1.5">
                          {href ? (
                            <Link href={href} className="font-mono hover:underline" style={{ color: COLORS.deepBlue }}>
                              {parts.right}
                            </Link>
                          ) : (
                            <span className="font-mono text-slate-800">{parts.right}</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td className="px-2 py-1.5">
                        {href ? (
                          <Link href={href} className="font-mono hover:underline" style={{ color: COLORS.deepBlue }}>
                            {label}
                          </Link>
                        ) : (
                          <span className="font-mono text-slate-800">{label}</span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right tabular-nums">{rs.length}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: COLORS.darkGreen }}>{pct(cl["near-miss"] ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: COLORS.ochre }}>{pct(cl.partial ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: COLORS.darkBrownRed }}>{pct(cl.far ?? 0)}</td>
                    <FacetCell rs={rs} facet="A" />
                    <FacetCell rs={rs} facet="B" />
                    <FacetCell rs={rs} facet="C" />
                    <FacetCell rs={rs} facet="D" />
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClosenessProfileChart({
  groups,
  headers,
  splitMode = false,
}: {
  groups: Group[];
  headers?: { newDomain: boolean; newSub: boolean; domain: string; sub: string }[];
  splitMode?: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="mb-4 border border-slate-100 rounded-md bg-slate-50 px-3 py-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-semibold text-slate-700">Closeness profile</div>
        <div className="flex items-center gap-3 text-[0.65rem] text-slate-600">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CLOSENESS_SOLID["near-miss"] }} />
            near-miss
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CLOSENESS_SOLID.partial }} />
            partial
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CLOSENESS_SOLID.far }} />
            far
          </span>
        </div>
      </div>
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
      <div className="space-y-1.5 min-w-[26rem]">
        {groups.map(({ label, rs, href, parts }, i) => {
          const cl = aftClosenessTally(rs);
          const n = rs.length;
          const nm = cl["near-miss"] ?? 0;
          const pa = cl.partial ?? 0;
          const fa = cl.far ?? 0;
          const su = cl.success ?? 0;
          const pct = (x: number) => (n ? (100 * x) / n : 0);
          const h = headers?.[i];
          const gridCols = splitMode && parts
            ? "grid-cols-[7rem_8rem_1fr_5rem]"
            : "grid-cols-[14rem_1fr_8rem]";
          return (
            <React.Fragment key={label}>
              {h?.newDomain && (
                <div className="mt-2 pt-1 text-[0.7rem] font-semibold" style={{ color: COLORS.purple }}>
                  {h.domain}
                </div>
              )}
              {h?.newSub && !h.newDomain && (
                <div className="text-[0.6rem] uppercase tracking-wide" style={{ color: COLORS.purple }}>
                  {h.sub}
                </div>
              )}
              {h?.newDomain && (
                <div className="text-[0.6rem] uppercase tracking-wide" style={{ color: COLORS.purple }}>
                  {h.sub}
                </div>
              )}
              <div className={`grid ${gridCols} items-center gap-3 text-xs`}>
                {splitMode && parts ? (
                  <>
                    <span className="font-mono text-slate-700 text-right truncate" title={parts.left}>
                      {parts.left} <span className="text-slate-400">·</span>
                    </span>
                    {href ? (
                      <Link href={href} className="font-mono text-slate-700 hover:underline truncate">
                        {parts.right}
                      </Link>
                    ) : (
                      <span className="font-mono text-slate-700 truncate" title={parts.right}>{parts.right}</span>
                    )}
                  </>
                ) : href ? (
                  <Link href={href} className="font-mono text-slate-700 hover:underline truncate">
                    {label}
                  </Link>
                ) : (
                  <span className="font-mono text-slate-700 truncate" title={label}>{label}</span>
                )}
              <div className="h-5 flex rounded overflow-hidden border border-slate-200 bg-white">
                {nm > 0 && (
                  <div
                    className="h-full flex items-center justify-center text-[0.6rem] font-semibold"
                    style={{ width: `${pct(nm)}%`, background: CLOSENESS_SOLID["near-miss"], color: COLORS.darkGreen }}
                    title={`near-miss: ${nm} (${pct(nm).toFixed(0)}%)`}
                  >
                    {pct(nm) >= 8 ? `${pct(nm).toFixed(0)}%` : ""}
                  </div>
                )}
                {pa > 0 && (
                  <div
                    className="h-full flex items-center justify-center text-[0.6rem] font-semibold"
                    style={{ width: `${pct(pa)}%`, background: CLOSENESS_SOLID.partial, color: COLORS.ochre }}
                    title={`partial: ${pa} (${pct(pa).toFixed(0)}%)`}
                  >
                    {pct(pa) >= 8 ? `${pct(pa).toFixed(0)}%` : ""}
                  </div>
                )}
                {fa > 0 && (
                  <div
                    className="h-full flex items-center justify-center text-[0.6rem] font-semibold"
                    style={{ width: `${pct(fa)}%`, background: CLOSENESS_SOLID.far, color: COLORS.darkBrownRed }}
                    title={`far: ${fa} (${pct(fa).toFixed(0)}%)`}
                  >
                    {pct(fa) >= 8 ? `${pct(fa).toFixed(0)}%` : ""}
                  </div>
                )}
                {su > 0 && (
                  <div
                    className="h-full flex items-center justify-center text-[0.6rem] font-semibold"
                    style={{ width: `${pct(su)}%`, background: CLOSENESS_SOLID.success, color: COLORS.deepBlue }}
                    title={`success: ${su} (${pct(su).toFixed(0)}%)`}
                  >
                    {pct(su) >= 8 ? `${pct(su).toFixed(0)}%` : ""}
                  </div>
                )}
              </div>
                <div className="text-[0.65rem] text-slate-500 tabular-nums text-right">
                  n={n}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function FacetCell({ rs, facet }: { rs: AFTReportWithSample[]; facet: FacetKey }) {
  const counts = aftFacetCounts(rs, facet);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const showAll = facet !== "C";
  const segCount = showAll ? sorted.length : Math.min(5, sorted.length);
  const visible = sorted.slice(0, segCount);
  const otherSum = sorted.slice(segCount).reduce((a, b) => a + b[1], 0);
  const segs: [string, number][] = otherSum > 0 ? [...visible, ["other", otherSum]] : visible;
  return (
    <td className="px-2 py-1.5 align-middle min-w-[10rem]">
      <div
        className="h-5 flex rounded overflow-hidden border border-slate-200"
        title={`${facet}: ${total} assignments`}
      >
        {segs.map(([code, n]) => {
          const pct = total ? (100 * n) / total : 0;
          const tip = code === "other"
            ? `other ${segCount + 1}+ codes — ${n} (${pct.toFixed(1)}%)`
            : `${code} — ${aftCodeTitle(code)} · ${n} (${pct.toFixed(1)}%)`;
          return (
            <div
              key={code}
              style={{
                width: `${pct}%`,
                background: code === "other" ? "#cbd5e1" : aftCodeColor(code),
              }}
              title={tip}
            />
          );
        })}
      </div>
    </td>
  );
}

export function CodeChip({ code, className = "" }: { code: string; className?: string }) {
  const bare = stripCode(code);
  const c = bare?.[0] ?? "?";
  const bg =
    c === "A" ? COLORS.palePeriwinkle :
    c === "B" ? COLORS.lavender       :
    c === "C" ? COLORS.paleYellow     :
    c === "D" ? COLORS.paleGreen      :
    COLORS.veryLightGray;
  const fg =
    c === "A" ? COLORS.deepBlue       :
    c === "B" ? COLORS.purple         :
    c === "C" ? COLORS.ochre          :
    c === "D" ? COLORS.darkGreen      :
    COLORS.nearBlack;
  return (
    <span
      title={aftCodeTitle(bare)}
      className={`inline-block px-1.5 py-0.5 rounded text-[0.65rem] font-mono border cursor-help ${className}`}
      style={{ background: bg, color: fg, borderColor: fg + "40" }}
    >
      {bare}
    </span>
  );
}

export function Stat({ label, value, cls = "bg-slate-50 border-slate-200", style }: {
  label: string;
  value: string | number;
  cls?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`border rounded p-2 ${style ? "" : cls}`} style={style}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
