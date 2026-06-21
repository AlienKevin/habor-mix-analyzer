// Build web/lib/composer_audit_pack.json from the composer-2.5 bottom-up audit
// (bottomup_judge/fresh20_audit.json) so the composer run + judge verdicts show
// under /audit alongside the original stratified-failure set. Verdict prose +
// evidence quotes are secret-scrubbed (they echo trajectory/verifier content).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrub } from "./scrub-secrets.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
// argv: [srcAuditJson] [outPackName] [sourceLabel] [generatedFor]
const SRC = process.argv[2] || join(WEB, "..", "bottomup_judge", "fresh20_audit.json");
const OUT = join(WEB, "lib", process.argv[3] || "composer_audit_pack.json");
const SOURCE = process.argv[4] || "composer-2.5";
const GENERATED_FOR = process.argv[5] ||
  "composer-2.5 fresh rollouts (cursor-cli) on the 20 audit tasks, one trial each, then bottom-up audited";

const scrubVerdict = (v) => ({
  ...v,
  source: SOURCE,
  outcome_rationale: scrub(v.outcome_rationale),
  verifier_or_task_concern: v.verifier_or_task_concern ? scrub(v.verifier_or_task_concern) : null,
  judge_verdict: { ...v.judge_verdict, summary: scrub(v.judge_verdict?.summary ?? "") },
  evidence: (v.evidence ?? []).map((e) => ({
    ...e,
    claim: scrub(e.claim),
    citations: (e.citations ?? []).map((c) => (c.quote ? { ...c, quote: scrub(c.quote) } : c)),
  })),
});

const audit = JSON.parse(readFileSync(SRC, "utf-8"));
const verdicts = audit.verdicts.map(scrubVerdict);
const cells = { TP: 0, TN: 0, FP: 0, FN: 0 };
for (const v of verdicts) cells[v.outcome_class] = (cells[v.outcome_class] || 0) + 1;
const n = verdicts.length;

const pack = {
  judge: "cursor/composer-2.5 (Cursor) on Daytona",
  generated_for: GENERATED_FOR,
  source: SOURCE,
  summary: {
    n_judged: n, n_failed: 0, n_total: n,
    TP: cells.TP, TN: cells.TN, FP: cells.FP, FN: cells.FN,
    disagreement_rate: n ? Math.round(((cells.FP + cells.FN) / n) * 1000) / 1000 : null,
  },
  note: "Fresh composer-2.5 rollouts on the 20 /audit tasks, then judged by the same bottom-up rollout judge.",
  verdicts,
  failures: [],
};
writeFileSync(OUT, JSON.stringify(pack, null, 2) + "\n");
console.log(`wrote ${OUT}: ${n} verdicts ${JSON.stringify(cells)}`);
