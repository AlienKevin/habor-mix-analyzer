"use client";

/**
 * "Report this experiment as broken" panel — distinct from TaskBrokenPanel.
 * Use when the *run/trial* is invalid (agent cut off mid-turn, harness or
 * environment failure during the run, truncated trajectory) even though the
 * task itself may be fine. Like task_broken it marks the trial complete and
 * deactivates the closeness + failure-mode labels below.
 */
export default function ExperimentBrokenPanel({
  checked,
  note,
  onCheckedChange,
  onNoteChange,
  readOnly = false,
}: {
  checked: boolean;
  note: string;
  onCheckedChange: (next: boolean) => void;
  onNoteChange: (next: string) => void;
  readOnly?: boolean;
}) {
  return (
    <section
      className={`rounded-lg border-2 p-4 space-y-2 ${
        checked ? "border-rose-400 bg-rose-50" : "border-rose-200 bg-rose-50/40"
      }`}
      aria-label="Report experiment as broken"
    >
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          disabled={readOnly}
          className="mt-1 h-4 w-4 accent-rose-600 shrink-0"
        />
        <span className="flex-1">
          <span className="text-sm font-semibold text-rose-900">🧪 Report this experiment as broken</span>
          <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
            Use this when <strong>this run</strong> is invalid — the agent was cut off
            prematurely in the middle of a turn, the harness/environment failed during the
            run, or the trajectory is truncated. The task itself may be fine (a re-run could
            work). <strong>The failure-mode annotations below will be inactive.</strong>
          </p>
        </span>
      </label>
      {checked && (
        <div className="pl-7 space-y-1">
          <label className="block text-[0.7rem] font-medium text-rose-900">Brief explanation</label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="What went wrong with this run? (e.g. cut off at step 40, container OOM)"
            readOnly={readOnly}
            className="w-full rounded border border-rose-300 bg-white px-2 py-1.5 text-xs min-h-[3rem]"
          />
        </div>
      )}
    </section>
  );
}
