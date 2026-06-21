"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_LAYOUT_PREFS,
  LEFT_PCT_MIN,
  LEFT_PCT_MAX,
  MIDDLE_PCT_MIN,
  RIGHT_PCT_MIN,
  RIGHT_PCT_MAX,
  loadLayoutPrefs,
  saveLayoutPrefs,
} from "@/lib/ui-layout-prefs";

const COLLAPSED_RIGHT_REM = 2.25;

type DragKind = "left" | "right" | null;

/**
 * Two-or-three pane horizontal shell with drag-to-resize dividers and a
 * collapsible right panel. Left + right widths are percentages of the
 * container; the middle slot flex-fills the remainder. Children own their own
 * sticky/scroll behaviour. Widths + collapsed state persist to localStorage
 * via ui-layout-prefs.
 */
export default function ResizableColumns({
  left,
  middle,
  right,
  rightAvailable,
  rightLabel = "Task dir",
  storageKey,
  defaultRightCollapsed = DEFAULT_LAYOUT_PREFS.rightCollapsed,
}: {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
  /** Whether the right panel has content (e.g. workspace files exist). When
   *  false the right column + its divider are not rendered. */
  rightAvailable: boolean;
  rightLabel?: string;
  /** Distinct localStorage key so unrelated layouts (trajectory viewer vs
   *  review compare) persist independently. */
  storageKey?: string;
  /** Right-panel collapse state when nothing is stored yet. */
  defaultRightCollapsed?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind>(null);

  const [leftPct, setLeftPct] = useState(DEFAULT_LAYOUT_PREFS.leftPct);
  const [rightPct, setRightPct] = useState(DEFAULT_LAYOUT_PREFS.rightPct);
  const [rightCollapsed, setRightCollapsed] = useState(defaultRightCollapsed);
  const [hydrated, setHydrated] = useState(false);
  // Below `lg` we abandon the drag-resize horizontal shell and stack the panes
  // vertically (mobile). Default to desktop on first paint to keep SSR/hydration
  // in agreement, then switch after mount.
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Hydrate from localStorage after mount (SSR-safe; first render uses
  // defaults so server + client agree).
  useEffect(() => {
    const p = loadLayoutPrefs(storageKey);
    if (p) {
      setLeftPct(p.leftPct);
      setRightPct(p.rightPct);
      setRightCollapsed(p.rightCollapsed);
    } else {
      setRightCollapsed(defaultRightCollapsed);
    }
    setHydrated(true);
  }, [storageKey, defaultRightCollapsed]);

  const persist = useCallback(
    (next: { leftPct?: number; rightPct?: number; rightCollapsed?: boolean }) => {
      saveLayoutPrefs(
        {
          leftPct: next.leftPct ?? leftPct,
          rightPct: next.rightPct ?? rightPct,
          rightCollapsed: next.rightCollapsed ?? rightCollapsed,
        },
        storageKey,
      );
    },
    [leftPct, rightPct, rightCollapsed, storageKey],
  );

  const rightExpanded = rightAvailable && !rightCollapsed;

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const kind = dragRef.current;
      const el = containerRef.current;
      if (!kind || !el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pctFromLeft = ((e.clientX - rect.left) / rect.width) * 100;
      const rightReserve = rightExpanded ? rightPct : 0;
      if (kind === "left") {
        let next = Math.min(LEFT_PCT_MAX, Math.max(LEFT_PCT_MIN, pctFromLeft));
        // keep the middle column at least MIDDLE_PCT_MIN wide
        next = Math.min(next, 100 - rightReserve - MIDDLE_PCT_MIN);
        setLeftPct(next);
      } else {
        // dragging the divider on the LEFT edge of the right panel
        const pctFromRight = 100 - pctFromLeft;
        let next = Math.min(RIGHT_PCT_MAX, Math.max(RIGHT_PCT_MIN, pctFromRight));
        next = Math.min(next, 100 - leftPct - MIDDLE_PCT_MIN);
        setRightPct(next);
      }
    }
    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      persist({});
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [rightExpanded, rightPct, leftPct, persist]);

  const startDrag = (kind: Exclude<DragKind, null>) => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = kind;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const toggleRight = () => {
    const next = !rightCollapsed;
    setRightCollapsed(next);
    persist({ rightCollapsed: next });
  };

  const handleClass =
    "shrink-0 self-stretch w-1.5 cursor-col-resize bg-slate-200 hover:bg-indigo-400 active:bg-indigo-500 transition-colors";

  // ----- MOBILE: stack the panes vertically (no drag-resize) -----
  if (isNarrow) {
    return (
      <div className="flex flex-col" aria-busy={!hydrated || undefined}>
        {/* Labels stay pinned at the top; the steps scroll beneath them so the
            master/detail pairing survives on a narrow screen. */}
        {middle}
        <div className="min-w-0">{left}</div>
        {rightAvailable && (
          <details className="border-t border-slate-200 bg-slate-50/70">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600 select-none">
              <span>{rightLabel}</span>
              <span aria-hidden>▾</span>
            </summary>
            <div className="max-h-[70vh] overflow-auto p-2">{right}</div>
          </details>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex items-stretch min-h-0" aria-busy={!hydrated || undefined}>
      <div className="min-w-0 shrink-0" style={{ width: `${leftPct}%` }}>
        {left}
      </div>

      <div className={handleClass} onMouseDown={startDrag("left")} role="separator" aria-orientation="vertical" title="Drag to resize" />

      <div className="flex-1 min-w-0 basis-0">{middle}</div>

      {rightAvailable && rightExpanded && (
        <>
          <div className={handleClass} onMouseDown={startDrag("right")} role="separator" aria-orientation="vertical" title="Drag to resize" />
          <div className="min-w-0 shrink-0 border-l border-slate-200 bg-slate-50/60" style={{ width: `${rightPct}%` }}>
            <div className="sticky top-4 z-10 h-[calc(100vh-2rem)] min-h-0 flex flex-col">
              <button
                type="button"
                onClick={toggleRight}
                className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border-b border-slate-200 shrink-0"
                title="Collapse panel"
              >
                <span className="uppercase tracking-wide">{rightLabel}</span>
                <span aria-hidden>▸</span>
              </button>
              <div className="flex-1 min-h-0 overflow-hidden p-1">{right}</div>
            </div>
          </div>
        </>
      )}

      {rightAvailable && !rightExpanded && (
        <button
          type="button"
          onClick={toggleRight}
          className="shrink-0 self-stretch border-l border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-start justify-center pt-3 text-slate-500 hover:text-slate-800 transition-colors"
          style={{ width: `${COLLAPSED_RIGHT_REM}rem` }}
          title={`Expand ${rightLabel}`}
        >
          <span className="[writing-mode:vertical-rl] rotate-180 text-[0.65rem] font-medium uppercase tracking-wide select-none">
            ◂ {rightLabel}
          </span>
        </button>
      )}
    </div>
  );
}
