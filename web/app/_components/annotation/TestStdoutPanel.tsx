"use client";

import { useEffect, useMemo, useState } from "react";
import { isArcAgiTask, parseArcVerifierOutput } from "@/lib/arc-agi-grid";
import ArcVerifierOutputView from "./ArcVerifierOutputView";

export default function TestStdoutPanel({
  slug,
  available,
  task,
}: {
  slug: string;
  available: boolean;
  task?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const renderArcGrids = task ? isArcAgiTask(task) : false;

  useEffect(() => {
    if (!available || text) return;
    fetch(`/annotate/trials/${slug}/test_stdout.txt`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("Not found"))))
      .then(setText)
      .catch(() => setText("(test stdout unavailable)"));
  }, [slug, text, available]);

  const parsedVerifier = useMemo(
    () => (text && renderArcGrids ? parseArcVerifierOutput(text) : null),
    [text, renderArcGrids],
  );

  if (!available) return null;

  return (
    <section className="border border-slate-200 rounded bg-white overflow-hidden">
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer px-4 py-2 text-sm font-semibold text-slate-900 bg-slate-50 border-b border-slate-200 select-none">
          Verifier output (test_stdout)
        </summary>
        <div
          className={`px-4 py-3 overflow-y-auto ${parsedVerifier?.expectedGrid || parsedVerifier?.gotGrid ? "max-h-[40rem]" : "max-h-64"}`}
        >
          {!text ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : parsedVerifier ? (
            <ArcVerifierOutputView parsed={parsedVerifier} />
          ) : (
            <pre className="text-[0.65rem] whitespace-pre-wrap font-mono text-slate-800">{text}</pre>
          )}
        </div>
      </details>
    </section>
  );
}
