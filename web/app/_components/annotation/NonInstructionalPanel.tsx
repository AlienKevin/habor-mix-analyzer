"use client";

/**
 * "Report this task as non-instructional" panel — a task-quality signal distinct
 * from task/experiment-broken. The task isn't broken and the run + failure-mode
 * labels stay valid; it just doesn't probe a significant missing capability of
 * frontier models, so it's low-signal as a benchmark item. Does NOT deactivate
 * the labels below.
 */
export default function NonInstructionalPanel({
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
        checked ? "border-violet-400 bg-violet-50" : "border-violet-200 bg-violet-50/40"
      }`}
      aria-label="Report task as non-instructional"
    >
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          disabled={readOnly}
          className="mt-1 h-4 w-4 accent-violet-600 shrink-0"
        />
        <span className="flex-1">
          <span className="text-sm font-semibold text-violet-900">📋 Report this task as non-instructional</span>
          <p className="text-xs text-violet-800 mt-0.5 leading-relaxed">
            Use this when the task <strong>doesn&rsquo;t probe a significant missing capability</strong> of
            frontier models — it&rsquo;s a valid, solvable task but low-signal as a benchmark item. The task
            isn&rsquo;t broken and <strong>the failure-mode labels below stay active.</strong> (A task IS
            instructional if it tests a real capability gap — e.g. some GAIA2 tasks probe <em>time awareness</em>,
            a capability still missing across many agents, so those are instructional.)
          </p>
        </span>
      </label>
      {checked && (
        <div className="pl-7 space-y-1">
          <label className="block text-[0.7rem] font-medium text-violet-900">Brief explanation</label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Why is it non-instructional? (which capability it fails to probe)"
            readOnly={readOnly}
            className="w-full rounded border border-violet-300 bg-white px-2 py-1.5 text-xs min-h-[3rem]"
          />
        </div>
      )}
    </section>
  );
}
