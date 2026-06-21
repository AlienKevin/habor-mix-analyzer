"use client";

import Link from "next/link";
import { useState } from "react";

export type StackExample = {
  annId: string | null;
  step: number | null; // 1-based display step (tb3 report steps are 1-based)
  task: string;
  model: string;
  name: string;
  quote: string;
  closeness: string;
};
export type StackCat = {
  key: string; // legend code / closeness key
  color: string;
  short: string; // short label
  desc: string; // one-sentence description
  total: number;
  counts: Record<string, number>; // model -> count
  example: StackExample | null;
  href?: string; // optional "see all" target
};

type Hover = { key: string; model: string | null; x: number; y: number };

/**
 * Per-model equal-width stacked bar over a categorical dimension (AFT codes or
 * closeness). Hover a segment/legend entry for a tooltip (count, share %, and a
 * one-sentence description); click to pin a panel with an illustrative trial and
 * an optional link to all trials in that category. Shared by the "Failure modes
 * by model" and "Closeness by model" sections.
 */
export default function Tb3StackChart({
  id,
  title,
  blurb,
  models,
  cats,
}: {
  id: string;
  title: string;
  blurb: string;
  models: string[];
  cats: StackCat[];
}) {
  const [sel, setSel] = useState<string | null>(cats[0]?.key ?? null);
  const [hover, setHover] = useState<Hover | null>(null);
  if (!cats.length || !models.length) return null;

  const byKey = (k: string | null) => cats.find((c) => c.key === k) ?? null;
  const selCat = byKey(sel);
  const modelTotal = (m: string) => cats.reduce((a, c) => a + (c.counts[m] ?? 0), 0);

  const tip = hover
    ? (() => {
        const c = byKey(hover.key);
        if (!c) return null;
        const n = hover.model ? (c.counts[hover.model] ?? 0) : c.total;
        const denom = hover.model ? modelTotal(hover.model) : models.reduce((a, m) => a + modelTotal(m), 0);
        const pct = denom ? ((100 * n) / denom).toFixed(1) : "0";
        return { c, n, pct };
      })()
    : null;

  return (
    <section id={id} className="mt-10 scroll-mt-4">
      <h2 className="group text-base font-semibold">
        {title}
        <a href={`#${id}`} className="ml-1.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">#</a>
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">{blurb}</p>

      {/* per-model equal-width stacked bars */}
      <div className="mt-4 max-w-3xl space-y-1.5">
        {models.map((m) => {
          const total = modelTotal(m);
          return (
            <div key={m} className="grid grid-cols-[8.5rem_minmax(0,1fr)_4rem] items-center gap-2">
              <div className="truncate font-mono text-xs text-slate-700" title={m}>{m}</div>
              <div className="flex h-5 w-full overflow-hidden rounded bg-slate-100">
                {cats.map((c) => {
                  const n = c.counts[m] ?? 0;
                  if (!n || !total) return null;
                  const dim = hover && hover.key !== c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onMouseEnter={(e) => setHover({ key: c.key, model: m, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHover({ key: c.key, model: m, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setSel(c.key)}
                      className="h-full transition-opacity"
                      style={{ width: `${(100 * n) / total}%`, background: c.color, opacity: dim ? 0.4 : 1 }}
                      aria-label={`${c.key} ${c.short}, ${n} of ${m}`}
                    />
                  );
                })}
              </div>
              <div className="text-right text-[0.7rem] tabular-nums text-slate-400">{total}</div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div className="mt-3 flex max-w-3xl flex-wrap gap-x-3 gap-y-1.5">
        {cats.map((c) => {
          const on = sel === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onMouseEnter={(e) => setHover({ key: c.key, model: null, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover({ key: c.key, model: null, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              onClick={() => setSel(c.key)}
              className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[0.7rem] transition-colors ${
                on ? "bg-slate-200 font-semibold text-slate-900 ring-1 ring-slate-300" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
              <span className="font-mono">{c.key}</span>
              <span className="hidden sm:inline">{c.short}</span>
              <span className="tabular-nums text-slate-400">{c.total}</span>
            </button>
          );
        })}
      </div>

      {/* floating tooltip */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg"
          style={{ left: Math.min(hover!.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 320), top: hover!.y + 14 }}
        >
          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: tip.c.color }} />
            <span className="font-mono">{tip.c.key}</span>
            <span>{tip.c.short}</span>
          </div>
          <div className="mt-0.5 text-slate-600">
            <strong className="text-slate-800">{tip.n}</strong> ({tip.pct}%){" "}
            {hover!.model ? `of ${hover!.model}` : "across all models"}
          </div>
          <div className="mt-1 leading-snug text-slate-500">{tip.c.desc}</div>
        </div>
      )}

      {/* selected-category panel */}
      {selCat && (
        <div className="mt-4 max-w-3xl rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: selCat.color }} />
            <span className="font-mono text-sm font-semibold text-slate-900">{selCat.key}</span>
            <span className="text-sm font-medium text-slate-800">{selCat.short}</span>
            <span className="text-xs text-slate-400">· {selCat.total} trials</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{selCat.desc}</p>
          {selCat.example && (
            <div className="mt-2 text-xs leading-relaxed text-slate-700">
              <span className="font-medium text-slate-500">Example —</span>{" "}
              <span className="font-mono text-slate-700">{selCat.example.model}</span> on{" "}
              <span className="font-mono text-slate-700">{selCat.example.task}</span> ({selCat.example.closeness}):{" "}
              {selCat.example.name}
              {selCat.example.quote && (
                <p className="mt-1 border-l-2 border-slate-200 pl-2 italic text-slate-600">&ldquo;{selCat.example.quote}&rdquo;</p>
              )}
              {selCat.example.annId && (
                <Link
                  href={`/tb3/${selCat.example.annId}/${selCat.example.step ? `#step-${selCat.example.step}` : ""}`}
                  className="mt-1 inline-block font-medium text-indigo-600 no-underline hover:underline"
                >
                  open this trajectory{selCat.example.step ? ` · step ${selCat.example.step}` : ""} ↗
                </Link>
              )}
            </div>
          )}
          {selCat.href && (
            <Link href={selCat.href} className="mt-2 inline-block text-xs font-semibold text-indigo-700 no-underline hover:underline">
              See all {selCat.total} {selCat.key} trials →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
