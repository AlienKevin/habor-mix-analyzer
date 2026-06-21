/**
 * Persisted layout preferences for the 3-column trial viewer
 * (CitedTrajectoryReview): the left (steps) and right (workspace/task-dir)
 * column widths as percentages of the container, and whether the right panel
 * is collapsed. The middle (labels) column flex-fills whatever remains.
 *
 * This is the project's only general UI-pref persistence — the annotation
 * bundle (lib/annotation-storage.ts) and API token (lib/annotation-sync.ts)
 * are domain-specific. Kept tiny and SSR-safe (all access guarded by
 * `typeof window`).
 */
const LAYOUT_PREFS_KEY = "harbor-trial-layout-v1";

export type TrialLayoutPrefs = {
  /** Width % of the LEFT (steps) column out of the full container. */
  leftPct: number;
  /** Width % of the RIGHT (workspace) column out of the full container. */
  rightPct: number;
  /** Whether the right workspace/task-dir panel is collapsed to a thin bar. */
  rightCollapsed: boolean;
};

export const DEFAULT_LAYOUT_PREFS: TrialLayoutPrefs = {
  leftPct: 46,
  rightPct: 26,
  rightCollapsed: true,
};

export const LEFT_PCT_MIN = 25;
export const LEFT_PCT_MAX = 65;
export const RIGHT_PCT_MIN = 18;
export const RIGHT_PCT_MAX = 45;
/** Keep the middle (labels) column at least this wide. */
export const MIDDLE_PCT_MIN = 20;

export function clampLeftPct(pct: number): number {
  if (!Number.isFinite(pct)) return DEFAULT_LAYOUT_PREFS.leftPct;
  return Math.min(LEFT_PCT_MAX, Math.max(LEFT_PCT_MIN, pct));
}

export function clampRightPct(pct: number): number {
  if (!Number.isFinite(pct)) return DEFAULT_LAYOUT_PREFS.rightPct;
  return Math.min(RIGHT_PCT_MAX, Math.max(RIGHT_PCT_MIN, pct));
}

/** Returns stored prefs, or null when nothing is saved under `key` (so callers
 *  can apply a layout-specific default, e.g. the review compare page keeps its
 *  third pane expanded by default). `key` lets distinct layouts persist
 *  independently. */
export function loadLayoutPrefs(key: string = LAYOUT_PREFS_KEY): TrialLayoutPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TrialLayoutPrefs>;
    return {
      leftPct: clampLeftPct(parsed.leftPct ?? DEFAULT_LAYOUT_PREFS.leftPct),
      rightPct: clampRightPct(parsed.rightPct ?? DEFAULT_LAYOUT_PREFS.rightPct),
      rightCollapsed:
        typeof parsed.rightCollapsed === "boolean"
          ? parsed.rightCollapsed
          : DEFAULT_LAYOUT_PREFS.rightCollapsed,
    };
  } catch {
    return null;
  }
}

export function saveLayoutPrefs(prefs: TrialLayoutPrefs, key: string = LAYOUT_PREFS_KEY): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        leftPct: clampLeftPct(prefs.leftPct),
        rightPct: clampRightPct(prefs.rightPct),
        rightCollapsed: prefs.rightCollapsed,
      }),
    );
  } catch {
    /* ignore quota / disabled storage */
  }
}
