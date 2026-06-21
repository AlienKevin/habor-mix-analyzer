import type { AnnotationPack, AnnotationTrial } from "./annotation-types";

// Legacy annotation data is no longer synced in the slim build.
// Return empty stubs so imports don't break the type checker.
const EMPTY_PACK = { trials: [] } as unknown as AnnotationPack;

export function loadAnnotationPack(): AnnotationPack {
  return EMPTY_PACK;
}

export function loadAnnotationTrial(_id: string): AnnotationTrial | null {
  return null;
}

export function annotationTrialIds(): string[] {
  return [];
}
