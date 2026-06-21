import fs from "node:fs";
import path from "node:path";

export type ToolActionChartData = {
  harness: string;
  harnessLabel: string;
  model: string;
  displayTitle?: string;
  categories: string[];
  nTrials: number;
  maxTurn: number;
  byTurn: { turn: number; [key: string]: number }[];
  actionMix?: string;
  caption?: string;
};

export type ToolActionChartRow = {
  rowId: string;
  commonTasks: number;
  charts: ToolActionChartData[];
};

export type ToolActionInsightBlock = {
  label: string;
  text: string;
};

export type ToolActionComparisonRow = {
  model: string;
  turnsPerTask: number;
  toolCallsPerTurn: number;
  Read: number;
  Write: number;
  Execute: number;
  "Internet search": number;
};

export type ToolActionComparisonTable = {
  title: string;
  description: string;
  rows: ToolActionComparisonRow[];
};

export type ToolActionChartsBundle = {
  commonTasks: number;
  yMax: number;
  insightBlocks: ToolActionInsightBlock[];
  comparisonTable?: ToolActionComparisonTable;
  chartRows?: ToolActionChartRow[];
  charts: ToolActionChartData[];
};

const CHARTS_PATH = path.join(process.cwd(), "data", "tool_action_charts.json");

/** Read chart bundle from disk (avoids stale webpack JSON import cache in dev). */
export function loadToolActionCharts(): ToolActionChartsBundle {
  if (!fs.existsSync(CHARTS_PATH)) {
    return { commonTasks: 0, yMax: 1, insightBlocks: [], charts: [] };
  }
  const raw = JSON.parse(fs.readFileSync(CHARTS_PATH, "utf8")) as Partial<ToolActionChartsBundle>;
  return {
    commonTasks: raw.commonTasks ?? 0,
    yMax: raw.yMax ?? 1,
    insightBlocks: raw.insightBlocks ?? [],
    comparisonTable: raw.comparisonTable,
    chartRows: raw.chartRows,
    charts: raw.charts ?? [],
  };
}
