"use client";

import { useEffect, useState } from "react";
import InstructionContent from "./InstructionContent";

function trialArtifactUrl(slug: string, name: string) {
  return `/annotate/trials/${slug}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

export default function InstructionPanel({
  slug,
  available,
  figureAvailable,
  renderArcGrids,
}: {
  slug: string;
  available: boolean;
  figureAvailable?: boolean;
  renderArcGrids?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [figureError, setFigureError] = useState(false);

  useEffect(() => {
    if (!available || text) return;
    fetch(`/annotate/trials/${slug}/instruction.md`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("Not found"))))
      .then(setText)
      .catch(() => setText(null));
  }, [slug, text, available]);

  useEffect(() => {
    setFigureError(false);
  }, [slug, figureAvailable]);

  if (!available) {
    return (
      <section className="border border-slate-200 rounded bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Task instruction</h2>
        <p className="text-xs text-slate-500 mt-1 italic">instruction.md not available for this trial.</p>
      </section>
    );
  }

  const figureUrl = figureAvailable ? trialArtifactUrl(slug, "figure.jpg") : null;

  return (
    <section className="border border-slate-200 rounded bg-white overflow-hidden">
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer px-4 py-2 text-sm font-semibold text-slate-900 bg-slate-50 border-b border-slate-200 select-none">
          Task instruction (instruction.md)
        </summary>
        <div className="px-4 py-3 max-h-[48rem] overflow-y-auto">
          {!text ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : (
            <InstructionContent text={text} renderArcGrids={renderArcGrids} />
          )}
          {figureUrl && !figureError && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-600 mb-2 font-mono">figure.jpg</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={figureUrl}
                alt="Task figure referenced in instruction.md"
                className="max-w-full h-auto rounded border border-slate-200 bg-white"
                onError={() => setFigureError(true)}
              />
            </div>
          )}
          {figureUrl && figureError && (
            <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 italic">
              figure.jpg not available for this trial.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
