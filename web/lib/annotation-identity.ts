/** Canonical key for cloud/local storage (case-insensitive). */
export function canonicalAnnotator(name: string): string {
  return name.trim().toLowerCase();
}

export function displayAnnotator(name: string): string {
  const t = name.trim();
  return t || name;
}
