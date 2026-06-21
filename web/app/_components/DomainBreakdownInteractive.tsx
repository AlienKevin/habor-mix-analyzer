"use client";

import React from "react";
import { aftCodeColor, aftCodeTitle, type DomainSection, type RowAgg } from "../../lib/aft-codes";
import { COLORS, CLOSENESS_SOLID } from "../../lib/colors";

/** Per benchmark-domain breakdown, hierarchical with click-to-expand. */
export default function DomainBreakdownInteractive({
  sections,
  commentary,
}: {
  sections: DomainSection[];
  commentary?: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  const expandAll = () => setExpanded(new Set(sections.map((s) => `${s.domain}|${s.sub}`)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <section id="per-domain" className="mb-8 border border-slate-200 rounded-lg p-4 bg-white scroll-mt-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-base">Per benchmark-domain breakdown</h2>
        <div className="text-xs text-slate-500 flex items-center gap-3">
          <span>{sections.length} subcategories · click a row to see per-benchmark breakdown</span>
          <button onClick={expandAll} className="underline hover:no-underline">expand all</button>
          <button onClick={collapseAll} className="underline hover:no-underline">collapse all</button>
        </div>
      </div>
      {commentary}
      <ClosenessProfile sections={sections} expanded={expanded} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="px-2 py-1.5">subcategory / benchmark</th>
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
            {sections.map((s, i) => {
              const k = `${s.domain}|${s.sub}`;
              const prev = i === 0 ? null : sections[i - 1];
              const newDomain = !prev || prev.domain !== s.domain;
              const isOpen = expanded.has(k);
              return (
                <React.Fragment key={k}>
                  {newDomain && (
                    <tr>
                      <td colSpan={9} className="px-2 py-1.5 font-semibold text-[0.75rem]"
                          style={{ background: COLORS.lavender, color: COLORS.purple }}>
                        {s.domain}
                      </td>
                    </tr>
                  )}
                  <tr
                    className="border-t border-slate-200 cursor-pointer hover:bg-slate-50"
                    onClick={() => toggle(k)}
                  >
                    <td className="px-2 py-1.5">
                      <span className="inline-block w-3 mr-1 text-slate-500 select-none">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span className="font-semibold">{s.sub}</span>
                      <span className="text-[0.65rem] text-slate-500 ml-2">
                        ({s.benchmarks.length} benchmark{s.benchmarks.length === 1 ? "" : "s"})
                      </span>
                    </td>
                    <ClosenessAndFacetCells row={s.agg} />
                  </tr>
                  {isOpen &&
                    s.benchmarks.map((b) => (
                      <tr key={`${k}-${b.label}`} className="border-t border-slate-100" style={{ background: COLORS.veryLightGray }}>
                        <td className="px-2 py-1.5 pl-8">
                          <span className="font-mono text-[0.7rem]" style={{ color: COLORS.deepBlue }}>{b.label}</span>
                        </td>
                        <ClosenessAndFacetCells row={b} />
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClosenessAndFacetCells({ row }: { row: RowAgg }) {
  const pct = (n: number) => row.n ? `${((100 * n) / row.n).toFixed(0)}%` : "—";
  return (
    <>
      <td className="px-2 py-1.5 text-right tabular-nums">{row.n}</td>
      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: COLORS.darkGreen }}>{pct(row.closeness["near-miss"])}</td>
      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: COLORS.ochre }}>{pct(row.closeness.partial)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: COLORS.darkBrownRed }}>{pct(row.closeness.far)}</td>
      <FacetAggCell counts={row.facets.A} facet="A" />
      <FacetAggCell counts={row.facets.B} facet="B" />
      <FacetAggCell counts={row.facets.C} facet="C" />
      <FacetAggCell counts={row.facets.D} facet="D" />
    </>
  );
}

function FacetAggCell({ counts, facet }: { counts: [string, number][]; facet: string }) {
  const total = counts.reduce((a, b) => a + b[1], 0);
  const showAll = facet !== "C";
  const segCount = showAll ? counts.length : Math.min(5, counts.length);
  const visible = counts.slice(0, segCount);
  const otherSum = counts.slice(segCount).reduce((a, b) => a + b[1], 0);
  const segs: [string, number][] = otherSum > 0 ? [...visible, ["other", otherSum]] : visible;
  return (
    <td className="px-2 py-1.5 align-middle min-w-[10rem]">
      <div className="h-5 flex rounded overflow-hidden border border-slate-200" title={`${facet}: ${total} assignments`}>
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

// MiniCodeChip removed — the FacetAggCell no longer shows under-bar chip rows;
// hover the bar segment for the code + description + count.

function ClosenessProfile({
  sections, expanded,
}: {
  sections: DomainSection[];
  expanded: Set<string>;
}) {
  return (
    <div className="mb-4 border border-slate-100 rounded-md bg-slate-50 px-3 py-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-semibold text-slate-700">Closeness profile</div>
        <div className="flex items-center gap-3 text-[0.65rem] text-slate-600">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CLOSENESS_SOLID["near-miss"] }} />near-miss
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CLOSENESS_SOLID.partial }} />partial
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CLOSENESS_SOLID.far }} />far
          </span>
        </div>
      </div>
      <div className="space-y-1">
        {sections.map((s, i) => {
          const k = `${s.domain}|${s.sub}`;
          const prev = i === 0 ? null : sections[i - 1];
          const newDomain = !prev || prev.domain !== s.domain;
          const isOpen = expanded.has(k);
          return (
            <React.Fragment key={k}>
              {newDomain && (
                <div className="mt-2 pt-1 text-[0.7rem] font-semibold" style={{ color: COLORS.purple }}>
                  {s.domain}
                </div>
              )}
              <ProfileBar row={s.agg} label={s.sub} bold />
              {isOpen &&
                s.benchmarks.map((b) => (
                  <div key={`${k}-${b.label}`} className="pl-4">
                    <ProfileBar row={b} label={b.label} bold={false} />
                  </div>
                ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function ProfileBar({ row, label, bold }: { row: RowAgg; label: string; bold: boolean }) {
  const n = row.n;
  const pct = (x: number) => (n ? (100 * x) / n : 0);
  const cl = row.closeness;
  return (
    <div className="grid grid-cols-[14rem_1fr_8rem] items-center gap-3 text-xs">
      <span className={`truncate ${bold ? "font-semibold text-slate-800" : "font-mono text-slate-600"}`} title={label}>
        {label}
      </span>
      <div className="h-5 flex rounded overflow-hidden border border-slate-200 bg-white">
        {cl["near-miss"] > 0 && (
          <div
            className="h-full flex items-center justify-center text-[0.6rem] font-semibold"
            style={{ width: `${pct(cl["near-miss"])}%`, background: CLOSENESS_SOLID["near-miss"], color: COLORS.darkGreen }}
            title={`near-miss: ${cl["near-miss"]} (${pct(cl["near-miss"]).toFixed(0)}%)`}
          >
            {pct(cl["near-miss"]) >= 8 ? `${pct(cl["near-miss"]).toFixed(0)}%` : ""}
          </div>
        )}
        {cl.partial > 0 && (
          <div
            className="h-full flex items-center justify-center text-[0.6rem] font-semibold"
            style={{ width: `${pct(cl.partial)}%`, background: CLOSENESS_SOLID.partial, color: COLORS.ochre }}
            title={`partial: ${cl.partial} (${pct(cl.partial).toFixed(0)}%)`}
          >
            {pct(cl.partial) >= 8 ? `${pct(cl.partial).toFixed(0)}%` : ""}
          </div>
        )}
        {cl.far > 0 && (
          <div
            className="h-full flex items-center justify-center text-[0.6rem] font-semibold"
            style={{ width: `${pct(cl.far)}%`, background: CLOSENESS_SOLID.far, color: COLORS.darkBrownRed }}
            title={`far: ${cl.far} (${pct(cl.far).toFixed(0)}%)`}
          >
            {pct(cl.far) >= 8 ? `${pct(cl.far).toFixed(0)}%` : ""}
          </div>
        )}
        {cl.success > 0 && (
          <div
            className="h-full flex items-center justify-center text-[0.6rem] font-semibold"
            style={{ width: `${pct(cl.success)}%`, background: CLOSENESS_SOLID.success, color: COLORS.deepBlue }}
            title={`success: ${cl.success} (${pct(cl.success).toFixed(0)}%)`}
          >
            {pct(cl.success) >= 8 ? `${pct(cl.success).toFixed(0)}%` : ""}
          </div>
        )}
      </div>
      <div className="text-[0.65rem] text-slate-500 tabular-nums text-right">n={n}</div>
    </div>
  );
}
