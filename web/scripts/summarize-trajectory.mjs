// Shared ATIF trajectory normalizer: raw `trajectory.json` → TrajectoryStepSummary[].
//
// Extracted verbatim from build-annotation-pack.mjs (the richest copy: it handles
// the redacted_thinking / text content-block envelopes, tool_call↔observation
// matching, content-block separators, and per-step wall-clock timing). Kept as a
// standalone module so build-audit-trajectories.mjs can reuse the exact same
// summarization the annotation pack uses, without re-deriving the ATIF quirks.
// build-annotation-pack.mjs / build-tb3-pack.mjs keep their own inline copies for
// now to avoid churn on the two live packs; this module is the canonical one.

const TOOL_OUTPUT_MAX = 16_000;

// Some harness/adapter combinations record assistant CONTENT BLOCKS raw in ATIF
// `message` instead of unwrapping them — e.g. {"type":"redacted_thinking",
// "data":"openrouter.reasoning:<b64>"} (claude-code × tencent/hy3-preview, where
// OpenRouter wraps the reasoning in Anthropic's redacted_thinking envelope) or
// {"type":"text","text":"…"} (Anthropic's standard text block stored verbatim).
// Without this decoder both render as "No agent message" fallbacks even when they
// carry thousands of useful characters. Returns { kind: "reasoning"|"message",
// text } so the caller routes the payload to the right field, else null.
function decodeContentBlockEnvelope(rawMessage) {
  if (!rawMessage || !rawMessage.startsWith('{"type":')) return null;
  try {
    const env = JSON.parse(rawMessage);
    if (env?.type === "redacted_thinking") {
      const data = env.data;
      if (typeof data !== "string" || !data.startsWith("openrouter.reasoning:")) return null;
      const b64 = data.slice("openrouter.reasoning:".length);
      const inner = JSON.parse(Buffer.from(b64 + "==", "base64").toString("utf-8"));
      return typeof inner.text === "string" ? { kind: "reasoning", text: inner.text.trim() } : null;
    }
    if (env?.type === "text" && typeof env.text === "string") {
      return { kind: "message", text: env.text.trim() };
    }
  } catch {
    /* not parseable as JSON */
  }
  return null;
}

// Match each tool_call to its observation output, by source_call_id when tagged,
// else positionally when counts line up, else fan a lone observation across calls.
function buildCallOutputMap(toolCalls, observationResults) {
  const byIndex = new Map();
  if (!toolCalls.length || !observationResults.length) return byIndex;
  const byId = new Map();
  for (const r of observationResults) {
    if (r && typeof r === "object" && r.source_call_id != null) byId.set(r.source_call_id, r.content);
  }
  const canPositional = observationResults.length === toolCalls.length;
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i] ?? {};
    const id = tc.tool_call_id ?? tc.id;
    if (id != null && byId.has(id)) {
      byIndex.set(i, byId.get(id));
    } else if (canPositional) {
      const r = observationResults[i];
      if (r && typeof r === "object" && "content" in r) byIndex.set(i, r.content);
    }
  }
  if (byIndex.size === 0 && observationResults.length === 1 && toolCalls.length > 1) {
    const r = observationResults[0];
    if (r && typeof r === "object" && "content" in r) {
      for (let i = 0; i < toolCalls.length; i++) byIndex.set(i, r.content);
    }
  }
  return byIndex;
}

function summarizeToolOutput(content) {
  const text = typeof content === "string" ? content : content == null ? "" : String(content);
  if (text.length === 0) return {};
  if (text.length <= TOOL_OUTPUT_MAX) return { output: text };
  const head = text.slice(0, TOOL_OUTPUT_MAX);
  return { output: head, output_truncated_bytes: text.length - head.length };
}

export function summarizeTrajectory(traj) {
  const steps = traj?.steps ?? [];
  const tsMs = steps.map((s) => {
    const t = Date.parse(s?.timestamp ?? "");
    return Number.isNaN(t) ? null : t;
  });
  const firstTs = tsMs.find((t) => t != null) ?? null;
  return steps.map((s, arrayIndex) => {
    const stepId = s.step_id != null ? Number(s.step_id) : arrayIndex + 1;
    const index = Number.isFinite(stepId) ? stepId - 1 : arrayIndex;
    const rawMessage = String(s.message ?? s.text ?? "").trim();
    const decoded = decodeContentBlockEnvelope(rawMessage);
    const message =
      decoded?.kind === "message" ? decoded.text : decoded?.kind === "reasoning" ? "" : rawMessage;
    const reasoning =
      String(s.reasoning_content ?? "").trim() || (decoded?.kind === "reasoning" ? decoded.text : "");
    const toolCalls = Array.isArray(s.tool_calls) ? s.tool_calls : [];
    const observationResults = Array.isArray(s.observation?.results) ? s.observation.results : [];
    const outputByIndex = buildCallOutputMap(toolCalls, observationResults);
    const role = s.source ?? s.role ?? "unknown";
    const isBlockSeparator = !message && !reasoning && toolCalls.length === 0;

    const thisTs = tsMs[arrayIndex];
    let nextTs = null;
    for (let j = arrayIndex + 1; j < tsMs.length; j++) {
      if (tsMs[j] != null) { nextTs = tsMs[j]; break; }
    }
    const durMs = thisTs != null && nextTs != null ? nextTs - thisTs : null;
    const elapsedMs = thisTs != null && firstTs != null ? thisTs - firstTs : null;

    return {
      index,
      step_id: stepId,
      role,
      text: message,
      ...(reasoning ? { reasoning } : {}),
      tool_calls: toolCalls.map((tc, i) => ({
        name: tc.function_name ?? tc.name ?? "tool",
        args: JSON.stringify(tc.arguments ?? tc.args ?? {}),
        ...(outputByIndex.has(i) ? summarizeToolOutput(outputByIndex.get(i)) : {}),
      })),
      ...(isBlockSeparator ? { kind: "tool_use_block_separator" } : {}),
      ...(durMs != null ? { dur_ms: durMs } : {}),
      ...(elapsedMs != null ? { elapsed_ms: elapsedMs } : {}),
    };
  });
}

/** Total wall-clock span of the run (first → last timestamped step). */
export function trajTimingMeta(traj) {
  const ts = (traj?.steps ?? [])
    .map((s) => Date.parse(s?.timestamp ?? ""))
    .filter((t) => !Number.isNaN(t));
  if (ts.length < 2) return {};
  const min = Math.min(...ts);
  return { total_ms: Math.max(...ts) - min, started_at: new Date(min).toISOString() };
}
