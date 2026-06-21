"use client";

import { useEffect, useRef, useState } from "react";
import { loadBundle, ensureAnnotator, clearAnnotatorSession } from "@/lib/annotation-storage";
import { canonicalAnnotator } from "@/lib/annotation-identity";
import { hasClientApiToken } from "@/lib/annotation-sync";
import { pullInsightBundle, saveInsightBundle } from "@/lib/insight-annotation-sync";
import type { InsightAnnotationBundle, InsightVerdict } from "@/lib/insight-annotation-types";
import { INSIGHT_STYLE } from "@/lib/insight-data";

const OPTIONS = ["lin", "haowei", "zixuan", "crystal", "kevin"];
const LEVELS: InsightVerdict[] = ["high", "medium", "low"];

/**
 * Lightweight per-annotator insightfulness labeller: the auditor picks their own
 * high/medium/low rating + an optional comment. Shares the trial-annotation
 * sign-in (loadBundle/ensureAnnotator) and cloud token; stores under its own
 * blob prefix. `judgeLevel` is the judge's rating, shown for reference.
 */
export default function InsightAnnotate({ taskId, judgeLevel }: { taskId: string; judgeLevel: string }) {
  const [hydrated, setHydrated] = useState(false);
  const [annotator, setAnnotator] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [bundle, setBundle] = useState<InsightAnnotationBundle | null>(null);
  const [v, setV] = useState<InsightVerdict | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const commentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAnnotator(loadBundle()?.annotator ?? null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!annotator) {
      setBundle(null);
      return;
    }
    let live = true;
    pullInsightBundle(annotator).then((b) => {
      if (!live) return;
      const bb: InsightAnnotationBundle = b ?? { annotator, version: 1, reviews: {} };
      setBundle(bb);
      const r = bb.reviews[taskId];
      setV(r?.verdict ?? null);
      setComment(r?.comment ?? "");
      setStatus("idle");
    });
    return () => {
      live = false;
    };
  }, [annotator, taskId]);

  const persist = (nextV: InsightVerdict | null, nextComment: string) => {
    if (!annotator) return;
    const base = bundle ?? { annotator, version: 1 as const, reviews: {} };
    const next: InsightAnnotationBundle = {
      annotator,
      version: 1,
      reviews: { ...base.reviews, [taskId]: { verdict: nextV, comment: nextComment, updated_at: new Date().toISOString() } },
    };
    setBundle(next);
    setStatus("saving");
    saveInsightBundle(next).then(() => setStatus("saved"));
  };

  const onVerdict = (nv: InsightVerdict) => {
    setV(nv);
    persist(nv, comment);
  };
  const onComment = (c: string) => {
    setComment(c);
    if (commentTimer.current) clearTimeout(commentTimer.current);
    commentTimer.current = setTimeout(() => persist(v, c), 600);
  };

  if (!hydrated) return null;

  return (
    <section className="mt-6 rounded-lg border-2 border-indigo-200 bg-indigo-50/30 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Your insight rating</h3>

      {!annotator ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            Sign in to label
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="mt-1 block rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="">Your name…</option>
              {OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!pick}
            onClick={() => ensureAnnotator(pick).then(() => setAnnotator(canonicalAnnotator(pick)))}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Sign in
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              signed in as <span className="font-mono text-slate-700">{annotator}</span>
            </span>
            <button type="button" onClick={() => { clearAnnotatorSession(); setAnnotator(null); }} className="hover:underline">
              switch
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-700">How insightful is this task?</span>
            <div className="inline-flex gap-1">
              {LEVELS.map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => onVerdict(lv)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold capitalize ring-1 transition ${
                    v === lv ? INSIGHT_STYLE[lv].badge : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {lv}
                </button>
              ))}
            </div>
            <span className="text-[0.7rem] text-slate-400">judge rated: {judgeLevel}</span>
          </div>
          <label className="block text-xs text-slate-600">
            Comment (optional)
            <textarea
              value={comment}
              onChange={(e) => onComment(e.target.value)}
              rows={2}
              placeholder="Why you rated it this way, or what the real insight is…"
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-center gap-3 text-[0.7rem] text-slate-400">
            <span>{status === "saving" ? "saving…" : status === "saved" ? "saved" : ""}</span>
            {!hasClientApiToken() && (
              <span className="text-amber-700">no cloud token: this label stays in your browser only</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
