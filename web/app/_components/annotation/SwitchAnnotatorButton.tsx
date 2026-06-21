"use client";

import { useState } from "react";
import { useAnnotateSession } from "./AnnotateSessionContext";

export default function SwitchAnnotatorButton({ className = "" }: { className?: string }) {
  const { annotator, switchAnnotator } = useAnnotateSession();
  const [confirming, setConfirming] = useState(false);

  if (!annotator) return null;

  if (confirming) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-2 text-xs ${className}`}>
        <span className="text-slate-600">Switch away from {annotator}?</span>
        <button
          type="button"
          onClick={() => {
            switchAnnotator();
            setConfirming(false);
          }}
          className="rounded bg-indigo-600 px-2 py-1 font-medium text-white hover:bg-indigo-700"
        >
          Yes, switch
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded border border-slate-200 px-2 py-1 text-slate-700 hover:bg-white"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={`rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-white ${className}`}
    >
      Switch annotator
    </button>
  );
}
