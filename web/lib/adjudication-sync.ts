"use client";

import { getApiToken } from "./annotation-sync";
import type { AdjudicationRecord } from "./adjudication-types";

function authHeaders(): HeadersInit {
  const token = getApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Fetch the shared adjudication record for a trial (discussion + converged GT),
 *  or null if none saved yet / no token. */
export async function pullAdjudication(trialId: string): Promise<AdjudicationRecord | null> {
  if (!getApiToken()) return null;
  const res = await fetch(`/api/adjudicate?trial=${encodeURIComponent(trialId)}`, {
    headers: authHeaders(),
  });
  if (res.status === 404 || res.status === 503) return null;
  if (res.status === 401) throw new Error("Invalid annotation API token");
  if (!res.ok) throw new Error(`Failed to load adjudication (${res.status})`);
  return (await res.json()) as AdjudicationRecord;
}

/** Persist the whole adjudication record. Returns the server-stamped
 *  updated_at, or null when there's no token. */
export async function pushAdjudication(record: AdjudicationRecord): Promise<string | null> {
  if (!getApiToken()) return null;
  const res = await fetch("/api/adjudicate", {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (res.status === 401) throw new Error("Invalid annotation API token");
  if (!res.ok) throw new Error(`Failed to save adjudication (${res.status})`);
  const data = (await res.json()) as { updated_at?: string };
  return data.updated_at ?? null;
}
