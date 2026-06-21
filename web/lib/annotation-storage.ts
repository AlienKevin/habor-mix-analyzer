"use client";

import type { AnnotatorBundle, TrialReview, Verdict } from "./annotation-types";
import { canonicalAnnotator, displayAnnotator } from "./annotation-identity";
import {
  fetchStoreStatus,
  pickNewerBundle,
  pullBundleFromServer,
  scheduleServerSync,
} from "./annotation-sync";

// 2026-05-28 bump: cloud bundles were cleared, so invalidate any stale local
// caches too. Without bumping the key, browsers with v1 data would re-upload
// it to cloud on the next edit (refreshFromServer sees 404, keeps local, then
// the next debounced push re-establishes the deleted bundle). v2 forces every
// session to sign in fresh against the now-empty cloud.
const STORAGE_KEY = "harbor-annotate-v2";

function normalizeVerdict(v: unknown): import("./annotation-types").Verdict | null {
  if (v === "agree" || v === "disagree") return v;
  return null;
}

function normalizeBundle(raw: AnnotatorBundle): AnnotatorBundle {
  const reviews: AnnotatorBundle["reviews"] = {};
  for (const [key, review] of Object.entries(raw.reviews ?? {})) {
    reviews[key] = {
      ...review,
      closeness: normalizeVerdict(review.closeness),
      failure_modes: (review.failure_modes ?? []).map((fm) => ({
        ...fm,
        overall: normalizeVerdict(fm.overall),
      })),
    };
  }
  return { ...raw, reviews };
}

export function loadBundle(): AnnotatorBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeBundle(JSON.parse(raw) as AnnotatorBundle);
  } catch {
    return null;
  }
}

export function saveBundle(bundle: AnnotatorBundle) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  scheduleServerSync(bundle);
}

/** Clear local annotator session (cloud copy is unchanged). */
export function clearAnnotatorSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export async function ensureAnnotator(name: string): Promise<AnnotatorBundle> {
  const trimmed = displayAnnotator(name);
  const key = canonicalAnnotator(name);
  await fetchStoreStatus();

  let remote: AnnotatorBundle | null = null;
  try {
    remote = await pullBundleFromServer(key);
    if (remote) remote = normalizeBundle(remote);
  } catch {
    remote = null;
  }

  const local = loadBundle();
  const merged = pickNewerBundle(
    local && canonicalAnnotator(local.annotator) === key ? local : null,
    remote,
  );

  const bundle: AnnotatorBundle = merged ?? {
    annotator: trimmed,
    version: 1,
    exported_at: new Date().toISOString(),
    reviews: {},
  };

  bundle.annotator = trimmed;
  saveBundle(bundle);
  return bundle;
}

/** Pull cloud copy on load when a local session already exists. */
export async function refreshFromServer(): Promise<AnnotatorBundle | null> {
  const local = loadBundle();
  if (!local) return null;
  await fetchStoreStatus();
  try {
    const remote = await pullBundleFromServer(local.annotator);
    if (!remote) return local;
    const merged = pickNewerBundle(local, normalizeBundle(remote));
    if (merged) {
      saveBundle(merged);
      return merged;
    }
  } catch {
    /* keep local */
  }
  return local;
}

export function upsertReview(trialKey: string, patch: Partial<TrialReview>) {
  const bundle = loadBundle();
  if (!bundle) throw new Error("No annotator session");
  const prev = bundle.reviews[trialKey];
  bundle.reviews[trialKey] = {
    trial_key: trialKey,
    closeness: prev?.closeness ?? null,
    closeness_note: prev?.closeness_note ?? "",
    failure_modes: prev?.failure_modes ?? [],
    task_broken: prev?.task_broken ?? false,
    task_broken_note: prev?.task_broken_note ?? "",
    experiment_broken: prev?.experiment_broken ?? false,
    experiment_broken_note: prev?.experiment_broken_note ?? "",
    non_instructional: prev?.non_instructional ?? false,
    non_instructional_note: prev?.non_instructional_note ?? "",
    updated_at: new Date().toISOString(),
    ...patch,
  };
  bundle.exported_at = new Date().toISOString();
  saveBundle(bundle);
}

export function exportBundle(): AnnotatorBundle | null {
  const bundle = loadBundle();
  if (!bundle) return null;
  return { ...bundle, exported_at: new Date().toISOString() };
}

export function downloadBundle(bundle: AnnotatorBundle) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `harbor-annotate-${bundle.annotator.replace(/\W+/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBundleFile(file: File): Promise<AnnotatorBundle> {
  const parsed = normalizeBundle(JSON.parse(await file.text()) as AnnotatorBundle);
  if (!parsed.annotator || !parsed.reviews) throw new Error("Invalid annotation export");
  saveBundle(parsed);
  return parsed;
}

export function isTrialComplete(review: TrialReview | undefined, failureModeIds: string[] = []): boolean {
  if (!review) return false;
  // Marking the task — or this experiment/run — as broken short-circuits
  // completeness: the annotator explicitly opted out of judging agent failures.
  if (review.task_broken || review.experiment_broken) return true;
  if (!review.closeness) return false;
  if (failureModeIds.length === 0) return true;
  return failureModeIds.every((id) => {
    const fm = review.failure_modes.find((f) => f.id === id);
    return Boolean(fm?.overall);
  });
}

export function emptyReview(trialKey: string, failureModeIds: string[]): TrialReview {
  return {
    trial_key: trialKey,
    closeness: null,
    closeness_note: "",
    task_broken: false,
    task_broken_note: "",
    experiment_broken: false,
    experiment_broken_note: "",
    non_instructional: false,
    non_instructional_note: "",
    updated_at: "",
    failure_modes: failureModeIds.map((id) => ({
      id,
      overall: null,
      note: "",
    })),
  };
}

export function mergeReview(base: TrialReview | undefined, trialKey: string, failureModeIds: string[]): TrialReview {
  const seed = emptyReview(trialKey, failureModeIds);
  if (!base) return seed;
  return {
    ...seed,
    ...base,
    failure_modes: failureModeIds.map((id) => {
      const prev = base.failure_modes.find((f) => f.id === id);
      return prev ?? { id, overall: null, note: "" };
    }),
  };
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  agree: "Agree",
  disagree: "Disagree",
};

export { fetchStoreStatus, subscribeSyncState } from "./annotation-sync";
export type { SyncState } from "./annotation-sync";
