"use client";

import { useMemo } from "react";
import { splitArcGridText } from "@/lib/arc-agi-grid";
import { preprocessInstructionMarkdown } from "@/lib/instruction-markdown";
import ArcGrid from "./ArcGrid";
import InstructionMarkdown from "./InstructionMarkdown";

export default function InstructionContent({
  text,
  renderArcGrids,
}: {
  text: string;
  renderArcGrids?: boolean;
}) {
  const prepared = useMemo(() => preprocessInstructionMarkdown(text), [text]);

  const segments = useMemo(
    () => (renderArcGrids ? splitArcGridText(prepared) : null),
    [prepared, renderArcGrids],
  );

  if (segments) {
    return (
      <div className="space-y-3">
        {segments.map((seg, i) =>
          seg.kind === "grid" ? (
            <ArcGrid key={i} grid={seg.grid} label={seg.label} compact />
          ) : seg.text.trim() ? (
            <InstructionMarkdown key={i} content={seg.text} />
          ) : null,
        )}
      </div>
    );
  }

  return <InstructionMarkdown content={prepared} />;
}
