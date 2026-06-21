"use client";

/**
 * Prominent "report this task as broken" panel rendered between the
 * InstructionPanel and the TestStdout / trajectory review. Checking it
 * (a) marks the trial as complete via task_broken, and (b) tells the
 * CitedTrajectoryReview below to grey out its closeness + failure-mode
 * label blocks so the annotator doesn't have to judge agent failures on
 * a task they've already flagged as broken.
 */
export default function TaskBrokenPanel({
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
        checked
          ? "border-amber-400 bg-amber-50"
          : "border-amber-200 bg-amber-50/40"
      }`}
      aria-label="Report task as broken"
    >
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          disabled={readOnly}
          className="mt-1 h-4 w-4 accent-amber-600 shrink-0"
        />
        <span className="flex-1">
          <span className="text-sm font-semibold text-amber-900">
            🚩 Report this task as broken
          </span>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            Use this when the task itself has a problem — ambiguous instructions,
            impossible / wrong tests, missing files, broken environment, mis-stated
            reward criterion, etc. <strong>The failure-mode annotations below will
            be inactive</strong>; you shouldn&rsquo;t need to judge agent failures
            if the task is broken.
          </p>
        </span>
      </label>
      {checked && (
        <div className="pl-7 space-y-1">
          <label className="block text-[0.7rem] font-medium text-amber-900">
            Brief explanation
          </label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="What's wrong with the task? (one or two sentences)"
            readOnly={readOnly}
            className="w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-xs min-h-[3rem]"
          />
        </div>
      )}
    </section>
  );
}
