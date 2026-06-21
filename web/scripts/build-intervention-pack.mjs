// Build web/lib/intervention_pack.json from the intervention experiment
// (bottomup_judge/intervention/intervention_results.json) for the /audit/intervention page.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
// argv: [srcResultsJson] [outPackName] — defaults to the harbor-index intervention.
const SRC = process.argv[2] || join(WEB, "..", "bottomup_judge", "intervention", "intervention_results.json");
const OUT = join(WEB, "lib", process.argv[3] || "intervention_pack.json");

const r = JSON.parse(readFileSync(SRC, "utf-8"));
const arms = r.arms;
const parse = (s) => (s && s.includes("/") ? s.split("/").map(Number) : [0, 0]); // "p/n" -> [p,n]

const agg = {};
for (const a of arms) agg[a] = { pass: 0, n: 0 };
const rows = r.rows.map((row) => {
  const out = { task: row.slug, outcome: row.outcome, failure_mode: row.failure_mode, hint: row.hint };
  for (const a of arms) {
    const [p, n] = parse(row[a]);
    out[a] = row[a];
    out[a + "_rate"] = n ? p / n : null;
    agg[a].pass += p; agg[a].n += n;
  }
  const t = out.treatment_rate, c = out.control_rate, pl = out.placebo_rate;
  out.corroborated = t != null && c != null && t > c && (pl == null || t > pl);
  return out;
});

const pack = {
  agent: "composer-2.5 (cursor-cli, Daytona)",
  judge: "cursor/composer-2.5",
  k: 3,
  arms,
  aggregate: Object.fromEntries(arms.map((a) => [a, { pass: agg[a].pass, n: agg[a].n, rate: agg[a].n ? agg[a].pass / agg[a].n : null }])),
  n_tested: rows.filter((x) => x.treatment_rate != null).length,
  n_corroborated: rows.filter((x) => x.corroborated).length,
  rows,
};
writeFileSync(OUT, JSON.stringify(pack, null, 2) + "\n");
console.log(`wrote ${OUT}: ${pack.n_corroborated}/${pack.n_tested} corroborated; aggregate`,
  Object.fromEntries(arms.map((a) => [a, `${agg[a].pass}/${agg[a].n}`])));
