"use client";

import { useMemo } from "react";
import { COLORS } from "../../lib/colors";
import type { ToolActionChartData } from "../../lib/tool-action-charts";

const CATEGORY_COLORS: Record<string, string> = {
  Read: COLORS.skyBlue,
  Write: COLORS.coral,
  "Internet search": COLORS.goldenYellow,
  Execute: COLORS.mutedGreen,
  Other: COLORS.gray,
};

type Props = {
  data: ToolActionChartData;
  layout?: "stacked" | "inline";
  /** Shared y-axis cap so side-by-side panels are comparable. */
  yMax?: number;
  hiddenCategories?: Set<string>;
};

export default function ToolActionChart({
  data,
  layout = "stacked",
  yMax: sharedYMax,
  hiddenCategories,
}: Props) {
  const categories = data.categories;
  const hidden = hiddenCategories ?? new Set<string>();
  const visibleCats = categories.filter((c) => !hidden.has(c));
  const maxTurnDisplay = Math.min(data.maxTurn, 50);

  const { scaleMax, bars } = useMemo(() => {
    let localPeak = 0;
    const bars = data.byTurn
      .filter((row) => row.turn < maxTurnDisplay)
      .map((row) => {
        const segments = visibleCats.map((cat) => ({
          cat,
          value: Number(row[cat] ?? 0),
        }));
        const total = segments.reduce((s, x) => s + x.value, 0);
        localPeak = Math.max(localPeak, total);
        return { turn: row.turn, segments, total };
      });
    const scaleMax = sharedYMax ?? (localPeak || 1);
    return { scaleMax, bars };
  }, [data.byTurn, maxTurnDisplay, visibleCats, sharedYMax]);

  const chartW = layout === "inline" ? 280 : 720;
  const chartH = 200;
  const padL = 28;
  const padR = 4;
  const padT = 6;
  const padB = 22;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const barGap = 1;
  const barW = Math.max(2, (plotW - barGap * (bars.length - 1)) / Math.max(bars.length, 1));

  return (
    <div className={layout === "inline" ? "min-w-0" : ""}>
      <h3 className="text-sm font-semibold mb-0.5 text-center">
        {data.displayTitle ?? `${data.model} · ${data.harnessLabel ?? data.harness}`}
      </h3>
      <p className="text-xs text-slate-500 mb-2 text-center">
        {data.nTrials} trials
      </p>

      <div
        className="overflow-x-auto border rounded-lg bg-white p-2"
        style={{ borderColor: COLORS.lightGray }}
      >
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full"
          role="img"
          aria-label={`Stacked bar chart of tool actions per turn for ${data.harness} ${data.model}`}
        >
          {[0, 0.5, 1].map((frac) => {
            const y = padT + plotH * (1 - frac);
            const val = Math.round(scaleMax * frac);
            return (
              <g key={frac}>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={y}
                  y2={y}
                  stroke={COLORS.veryLightGray}
                  strokeWidth={1}
                />
                <text x={padL - 4} y={y + 3} textAnchor="end" className="fill-slate-500" fontSize={7}>
                  {val}
                </text>
              </g>
            );
          })}

          {bars.map((bar, i) => {
            const x = padL + i * (barW + barGap);
            let yBottom = padT + plotH;
            return (
              <g key={bar.turn}>
                <title>
                  {`Turn ${bar.turn}: ${bar.segments
                    .filter((s) => s.value > 0)
                    .map((s) => `${s.cat} ${s.value}`)
                    .join(", ")}`}
                </title>
                {bar.segments.map((seg) => {
                  if (seg.value <= 0) return null;
                  const h = (seg.value / scaleMax) * plotH;
                  yBottom -= h;
                  return (
                    <rect
                      key={`${bar.turn}-${seg.cat}`}
                      x={x}
                      y={yBottom}
                      width={barW}
                      height={h}
                      fill={CATEGORY_COLORS[seg.cat] ?? COLORS.gray}
                    />
                  );
                })}
                {bar.turn % 10 === 0 && (
                  <text
                    x={x + barW / 2}
                    y={chartH - 5}
                    textAnchor="middle"
                    className="fill-slate-500"
                    fontSize={7}
                  >
                    {bar.turn}
                  </text>
                )}
              </g>
            );
          })}

          {layout === "inline" && (
            <text
              x={padL + plotW / 2}
              y={chartH - 1}
              textAnchor="middle"
              className="fill-slate-600"
              fontSize={8}
            >
              Turn
            </text>
          )}
        </svg>
      </div>

      {data.maxTurn > maxTurnDisplay && layout === "stacked" && (
        <p className="text-xs text-slate-500 mt-1">
          Showing turns 0–{maxTurnDisplay - 1} (max {data.maxTurn} turns).
        </p>
      )}

      {data.actionMix ? (
        <p className="text-xs text-slate-700 leading-relaxed mt-2 px-0.5">
          <span className="font-semibold text-slate-900">Action mix. </span>
          {data.actionMix}
        </p>
      ) : null}
    </div>
  );
}
