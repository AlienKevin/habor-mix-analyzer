import type { AnnotationPack, AnnotationTrial } from "./annotation-types";

// Legacy tb3 annotation data is no longer synced in the slim build.
const EMPTY_PACK = { trials: [] } as unknown as AnnotationPack;

export function loadTb3Pack(): AnnotationPack {
  return EMPTY_PACK;
}

export function loadTb3Trial(_id: string): AnnotationTrial | null {
  return null;
}

export function tb3TrialIds(): string[] {
  return [];
}
