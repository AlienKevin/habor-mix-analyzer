// Shared secret redaction for published trajectory summaries. Agent/judge
// sandboxes carry API keys + task-fixture secrets in their env, and commands
// (`printenv`, `cat config`, `head -c 20 $KEY`) capture them into the
// trajectory. These summaries get committed + served publicly, so scrub before
// writing. Consumers: build-audit-trajectories.mjs, build-insight-trajectories.mjs
// (which also asserts scrub(body)===body on every emitted bundle), build-tb3-pack.mjs,
// build-insight-pack.mjs, build-task-filesystem.mjs.

const SECRET_RULES = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/g, "sk-ant-[REDACTED]"],
  [/sk-[A-Za-z0-9]{16,}/g, "sk-[REDACTED]"],
  [/sk_live_[A-Za-z0-9]{16,}/g, "sk_live_[REDACTED]"],
  [/crsr_[A-Za-z0-9]{8,}/g, "crsr_[REDACTED]"],
  [/dtn_[A-Za-z0-9]{16,}/g, "dtn_[REDACTED]"],
  [/ghp_[A-Za-z0-9]{16,}/g, "ghp_[REDACTED]"],
  [/gho_[A-Za-z0-9]{16,}/g, "gho_[REDACTED]"],
  [/github_pat_[A-Za-z0-9_]{20,}/g, "github_pat_[REDACTED]"],
  [/vercel_blob_rw_[A-Za-z0-9_]{12,}/g, "vercel_blob_rw_[REDACTED]"],
  [/AKIA[0-9A-Z]{16}/g, "AKIA[REDACTED]"],
  [/AIza[A-Za-z0-9_-]{30,}/g, "AIza[REDACTED]"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, "xox-[REDACTED]"],
  // JWTs (header.payload.signature, all base64url) — e.g. signed download URLs.
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED-JWT]"],
  // Internal AWS ELB hostnames (e.g. the model-proxy base URL `*_BASE_URL=
  // http://pp-api-….elb.us-west-2.amazonaws.com:3000`). Raw elb.amazonaws.com
  // hosts are always private infra — public services front them with a domain.
  [/https?:\/\/[a-z0-9-]+\.elb\.[a-z0-9-]+\.amazonaws\.com(?::\d+)?/gi, "http://[REDACTED-INTERNAL-HOST]"],
];
// Generic ENV-style secret: keep the var name, redact the value. The var name is
// a secret keyword (API_KEY/TOKEN/SECRET/…) as a whole _-delimited component, with
// an optional prefix (FLASK_SECRET_KEY) and/or _-delimited suffix (*_TOKEN_SALT) —
// so bare API_KEY=/TOKEN=/SECRET= match, but TOKENIZER=/MAX_TOKENS= (keyword is a
// substring, not a component) do not. Quotes around the value are consumed by the
// separator so the value itself is redacted.
const ENV_SECRET =
  /\b((?:[A-Z][A-Z0-9_]*_)?(?:API_?KEY|ACCESS_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)(?:_[A-Z0-9]+)*)(\s*[=:]\s*['"\\]*)([A-Za-z0-9_\-./+]{12,})/g;

export function scrub(s) {
  if (typeof s !== "string" || !s) return s;
  let out = s;
  for (const [re, rep] of SECRET_RULES) out = out.replace(re, rep);
  out = out.replace(ENV_SECRET, (_m, k, sep) => `${k}${sep}[REDACTED]`);
  return out;
}

/** Scrub a normalized TrajectoryStepSummary in place-safe (returns a copy). */
export function scrubStep(s) {
  return {
    ...s,
    text: scrub(s.text),
    ...(s.reasoning ? { reasoning: scrub(s.reasoning) } : {}),
    tool_calls: (s.tool_calls || []).map((tc) => ({
      ...tc,
      args: scrub(tc.args),
      ...(tc.output != null ? { output: scrub(tc.output) } : {}),
    })),
  };
}
