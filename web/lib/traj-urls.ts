// Resolve trajectory file URLs from the Blob manifest (public Vercel Blob CDN).
// Falls back to local /audit-traj/ paths if the manifest or entry is missing.
import blobManifest from "@/lib/audit-traj-blob-manifest.json";

type BlobEntry = { agent?: string; judge?: string; verifier?: string };
const manifest = blobManifest as Record<string, BlobEntry>;

export function trajUrl(id: string, which: "agent" | "judge"): string {
  const entry = manifest[id];
  if (entry?.[which]) return entry[which]!;
  return `/audit-traj/${encodeURIComponent(id)}/${which}.json`;
}

export function verifierUrl(id: string): string {
  const entry = manifest[id];
  if (entry?.verifier) return entry.verifier!;
  return `/audit-traj/${encodeURIComponent(id)}/verifier.txt`;
}

export function hasTraj(id: string, which: "agent" | "judge"): boolean {
  const entry = manifest[id];
  if (entry?.[which]) return true;
  // fall back to local manifest check
  return false;
}
