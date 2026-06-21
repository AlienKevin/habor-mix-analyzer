"use client";

import type { AnnotatorBundle } from "./annotation-types";
import { canonicalAnnotator } from "./annotation-identity";

const TOKEN_KEY = "harbor-annotate-api-token";

export type SyncState = "idle" | "disabled" | "syncing" | "synced" | "error" | "no-token";

let syncState: SyncState = "idle";
let syncListeners: Array<(s: SyncState) => void> = [];
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let storeEnabled: boolean | null = null;

export function subscribeSyncState(listener: (s: SyncState) => void): () => void {
  syncListeners.push(listener);
  listener(syncState);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
  };
}

function setSyncState(next: SyncState) {
  syncState = next;
  for (const l of syncListeners) l(next);
}

export function getApiToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromEnv = process.env.NEXT_PUBLIC_ANNOTATION_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setApiToken(token: string) {
  const trimmed = token.trim();
  localStorage.setItem(TOKEN_KEY, trimmed);
  sessionStorage.setItem(TOKEN_KEY, trimmed);
}

export function hasClientApiToken(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ANNOTATION_API_TOKEN?.trim());
}

export function needsApiTokenInput(storeEnabled: boolean): boolean {
  return storeEnabled && !hasClientApiToken() && !getApiToken();
}

export async function fetchStoreStatus(): Promise<{
  enabled: boolean;
  backend?: string;
  client_auth?: boolean;
}> {
  try {
    const res = await fetch("/api/annotate/status");
    if (!res.ok) return { enabled: false };
    const data = (await res.json()) as {
      enabled: boolean;
      backend?: string;
      client_auth?: boolean;
    };
    storeEnabled = data.enabled;
    if (!data.enabled) setSyncState("disabled");
    else if (needsApiTokenInput(data.enabled)) setSyncState("no-token");
    return data;
  } catch {
    storeEnabled = false;
    setSyncState("disabled");
    return { enabled: false };
  }
}

export function isStoreEnabled(): boolean {
  return storeEnabled === true;
}

function authHeaders(): HeadersInit {
  const token = getApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function pullBundleFromServer(annotator: string): Promise<AnnotatorBundle | null> {
  if (!getApiToken()) {
    if (storeEnabled) setSyncState("no-token");
    return null;
  }
  const res = await fetch(
    `/api/annotate?annotator=${encodeURIComponent(canonicalAnnotator(annotator))}`,
    { headers: authHeaders() },
  );
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error("Invalid annotation API token");
  if (res.status === 503) return null;
  if (!res.ok) throw new Error(`Failed to load annotations (${res.status})`);
  return (await res.json()) as AnnotatorBundle;
}

export async function pushBundleToServer(bundle: AnnotatorBundle): Promise<void> {
  if (!getApiToken()) return;
  const res = await fetch("/api/annotate", {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
  if (res.status === 401) throw new Error("Invalid annotation API token");
  if (!res.ok) throw new Error(`Failed to save annotations (${res.status})`);
}

export function scheduleServerSync(bundle: AnnotatorBundle) {
  if (typeof window === "undefined") return;
  if (storeEnabled === false) return;
  if (!getApiToken()) {
    if (storeEnabled) setSyncState("no-token");
    return;
  }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    setSyncState("syncing");
    pushBundleToServer(bundle)
      .then(() => setSyncState("synced"))
      .catch(() => setSyncState("error"));
  }, 500);
}

export function pickNewerBundle(
  local: AnnotatorBundle | null,
  remote: AnnotatorBundle | null,
): AnnotatorBundle | null {
  if (!local) return remote;
  if (!remote) return local;
  return local.exported_at >= remote.exported_at ? local : remote;
}
