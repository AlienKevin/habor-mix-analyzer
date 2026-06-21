/** Client-safe model-name normalization (no fs imports, usable in client
 *  components). Re-exported from lib/data for server callers. */

/** Strip context-window suffixes like `[1m]`/`[200k]`, and canonicalize
 *  route-prefixed model ids — merging provider routes for the same underlying
 *  model (e.g. tb3's `openai/@anthropic/...` and `openai/@bedrock/...`
 *  claude-opus-4-8 collapse to one `claude-opus-4.8`). */
export function normalizeModel(m: string): string {
  const s = (m || "unknown").replace(/\[[^\]]+\]$/, "").trim();
  const low = s.toLowerCase();
  if (low.includes("claude-opus-4-8") || low.includes("claude-opus-4.8")) return "claude-opus-4.8";
  if (low.includes("gpt-5.5")) return "gpt-5.5";
  return s;
}
