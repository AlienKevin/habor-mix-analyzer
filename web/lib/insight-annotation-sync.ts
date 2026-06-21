"use client";

import { getApiToken } from "./annotation-sync";
import type { InsightAnnotationBundle } from "./insight-annotation-types";

const lsKey = (annotator: string) => `insight-annotate:${annotator}`;

function authHeaders(): HeadersInit {
  const t = getApiToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function loadLocalInsight(annotator: string): InsightAnnotationBundle | null {
  try {
    return JSON.parse(localStorage.getItem(lsKey(annotator)) || "null") as InsightAnnotationBundle | null;
  } catch {
    return null;
  }
}

export function saveLocalInsight(bundle: InsightAnnotationBundle): void {
  try {
    localStorage.setItem(lsKey(bundle.annotator), JSON.stringify(bundle));
  } catch {}
}

/** Cloud pull (token required); falls back to the caller's local copy. */
export async function pullInsightBundle(annotator: string): Promise<InsightAnnotationBundle | null> {
  if (!getApiToken()) return loadLocalInsight(annotator);
  try {
    const res = await fetch(`/api/insight-annotate?annotator=${encodeURIComponent(annotator)}`, { headers: authHeaders() });
    if (res.ok) return (await res.json()) as InsightAnnotationBundle;
    if (res.status === 404) return loadLocalInsight(annotator);
  } catch {}
  return loadLocalInsight(annotator);
}

/** Persist locally always; push to cloud when a token is present. */
export async function saveInsightBundle(bundle: InsightAnnotationBundle): Promise<void> {
  saveLocalInsight(bundle);
  if (!getApiToken()) return;
  try {
    await fetch("/api/insight-annotate", {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
    });
  } catch {}
}
