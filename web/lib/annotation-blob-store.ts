import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { get, put } from "@vercel/blob";
import type { AnnotatorBundle } from "./annotation-types";
import type { AdjudicationRecord } from "./adjudication-types";
import type { InsightAnnotationBundle } from "./insight-annotation-types";
import { canonicalAnnotator } from "./annotation-identity";

const BLOB_PREFIX = "harbor-annotate/";

function sanitizeAnnotator(name: string): string {
  return canonicalAnnotator(name).replace(/[^a-z0-9._-]+/g, "-").slice(0, 80);
}

function blobPath(annotator: string): string {
  return `${BLOB_PREFIX}${sanitizeAnnotator(annotator)}.json`;
}

function localPath(annotator: string): string {
  return join(process.cwd(), ".data", "annotations", `${sanitizeAnnotator(annotator)}.json`);
}

function useBlobStore(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function annotationStoreEnabled(): boolean {
  return Boolean(process.env.ANNOTATION_API_TOKEN);
}

function legacySanitizeAnnotator(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function blobPathsForAnnotator(annotator: string): string[] {
  const paths = new Set<string>();
  paths.add(blobPath(annotator));
  const legacy = `${BLOB_PREFIX}${legacySanitizeAnnotator(annotator)}.json`;
  paths.add(legacy);
  return [...paths];
}

async function readBlobJson(path: string): Promise<AnnotatorBundle | null> {
  try {
    const result = await get(path, { access: "private" });
    if (!result?.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as AnnotatorBundle;
  } catch {
    return null;
  }
}

export async function readAnnotationBundle(annotator: string): Promise<AnnotatorBundle | null> {
  if (useBlobStore()) {
    for (const path of blobPathsForAnnotator(annotator)) {
      const bundle = await readBlobJson(path);
      if (bundle) return bundle;
    }
    return null;
  }

  const candidates = [
    localPath(annotator),
    join(process.cwd(), ".data", "annotations", `${legacySanitizeAnnotator(annotator)}.json`),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8")) as AnnotatorBundle;
    }
  }
  return null;
}

export async function writeAnnotationBundle(bundle: AnnotatorBundle): Promise<void> {
  const body = JSON.stringify(bundle, null, 2) + "\n";
  if (useBlobStore()) {
    await put(blobPath(bundle.annotator), body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  const path = localPath(bundle.annotator);
  mkdirSync(join(process.cwd(), ".data", "annotations"), { recursive: true });
  writeFileSync(path, body, "utf-8");
}

// ----- Insightfulness annotations (agree/disagree + comment on the verdict) -----
const INSIGHT_PREFIX = "harbor-insight-annotate/";
const insightBlobPath = (a: string) => `${INSIGHT_PREFIX}${sanitizeAnnotator(a)}.json`;
const insightLocalPath = (a: string) =>
  join(process.cwd(), ".data", "insight-annotations", `${sanitizeAnnotator(a)}.json`);

export async function readInsightAnnotation(annotator: string): Promise<InsightAnnotationBundle | null> {
  if (useBlobStore()) {
    try {
      const result = await get(insightBlobPath(annotator), { access: "private" });
      if (!result?.stream) return null;
      return JSON.parse(await new Response(result.stream).text()) as InsightAnnotationBundle;
    } catch {
      return null;
    }
  }
  const p = insightLocalPath(annotator);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as InsightAnnotationBundle) : null;
}

export async function writeInsightAnnotation(bundle: InsightAnnotationBundle): Promise<void> {
  const body = JSON.stringify(bundle, null, 2) + "\n";
  if (useBlobStore()) {
    await put(insightBlobPath(bundle.annotator), body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }
  mkdirSync(join(process.cwd(), ".data", "insight-annotations"), { recursive: true });
  writeFileSync(insightLocalPath(bundle.annotator), body, "utf-8");
}

// ----- Adjudication records (per-trial discussion + converged GT) -----
// Shared across both reviewers of a trial; same storage backend + auth as the
// annotation bundles, under a distinct blob prefix.

const ADJUDICATION_PREFIX = "harbor-adjudication/";

function sanitizeTrialId(trialId: string): string {
  return trialId.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80);
}

function adjudicationBlobPath(trialId: string): string {
  return `${ADJUDICATION_PREFIX}${sanitizeTrialId(trialId)}.json`;
}

function adjudicationLocalPath(trialId: string): string {
  return join(process.cwd(), ".data", "adjudications", `${sanitizeTrialId(trialId)}.json`);
}

async function readBlobText(path: string): Promise<string | null> {
  try {
    const result = await get(path, { access: "private" });
    if (!result?.stream) return null;
    return await new Response(result.stream).text();
  } catch {
    return null;
  }
}

export async function readAdjudicationRecord(trialId: string): Promise<AdjudicationRecord | null> {
  if (useBlobStore()) {
    const text = await readBlobText(adjudicationBlobPath(trialId));
    return text ? (JSON.parse(text) as AdjudicationRecord) : null;
  }
  const p = adjudicationLocalPath(trialId);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as AdjudicationRecord) : null;
}

export async function writeAdjudicationRecord(record: AdjudicationRecord): Promise<void> {
  const body = JSON.stringify(record, null, 2) + "\n";
  if (useBlobStore()) {
    await put(adjudicationBlobPath(record.trial_id), body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }
  const p = adjudicationLocalPath(record.trial_id);
  mkdirSync(join(process.cwd(), ".data", "adjudications"), { recursive: true });
  writeFileSync(p, body, "utf-8");
}
