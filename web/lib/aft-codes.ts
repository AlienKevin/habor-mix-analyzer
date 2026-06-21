/** Client-safe AFT helpers: pure functions, no Node `fs` / `path`.
 *  Both server and client components can import from here. */
import { COLORS } from "./colors";

export type FacetKey = "A" | "B" | "C" | "D";

export function stripCode(raw: string | undefined): string {
  const m = (raw || "").match(/^([A-Z]\d+(?:\.\d+)?)/);
  return m ? m[1] : (raw || "");
}

export const AFT_CODE_DESC: Record<string, string> = {
  // A facet — stage (when)
  A1: "Understanding & planning — agent's task understanding, decomposition, strategy formation",
  A2: "Locating & exploring — searches the codebase/environment to find the target",
  A3: "Executing & generating — edits, generates code, applies a patch",
  A4: "Verifying & testing — checks whether the result is correct",
  A5: "Iterating & converging — adjusts strategy / retries based on feedback",
  A6: "Terminating & delivering — decides to stop and deliver",
  // B facet — root cause (why)
  B1: "Reasoning defect — flaw in the agent's logical reasoning, judgment, or decision",
  B2: "Knowledge gap — agent lacks the domain / technical knowledge needed",
  B3: "Context-management failure — agent failed to maintain / retrieve / use context info",
  B4: "Tool / environment interaction — interaction with tools, APIs, or runtime erred",
  B5: "Spec non-compliance — agent did not honor task requirements, role, or constraints",
  B6: "Coordination & communication (multi-agent only) — info passing, role, or consensus failure",
  // C facet — behavior (what)
  "C1.1": "Requirement misunderstanding — misread or ignored a task constraint",
  "C1.2": "Role overreach — performed actions outside its scope",
  "C1.3": "Instruction non-compliance — had clear instructions, did not follow",
  "C2.1": "Logical error — logical fallacy in the reasoning chain",
  "C2.2": "Reasoning-action mismatch — analysis correct but action wrong",
  "C2.3": "Hallucination — invented facts / code / APIs that don't exist",
  "C2.4": "Problem misidentification — misjudged the problem's essence or root cause",
  "C2.5": "Blind strategy switch — changed approach with no reason",
  "C3.1": "Surface-match locating — relied on keyword / stack-trace shallow matches only",
  "C3.2": "Wrong search scope — too narrow (missed target) or too broad (wasted budget)",
  "C3.3": "Issue-description misled — the GitHub Issue text led the agent astray",
  "C4.1": "Insufficient surrounding-context understanding — doesn't grasp nearby code semantics",
  "C4.2": "Type / data-structure error — improper handling of types or data structures",
  "C4.3": "Missing error handling — failed to add necessary exception handling",
  "C4.4": "Incomplete fix — fix did not cover all affected sites",
  "C4.5": "Evasive fix — worked around the symptom instead of fixing the cause",
  "C4.6": "Overfit fix — fixed only the specific reported case",
  "C4.7": "Performance regression — fix introduced a performance problem",
  "C4.8": "Dependency / compatibility break — broke an existing dependency or version",
  "C5.1": "Conversation / history loss — forgot prior interaction content and results",
  "C5.2": "Selective amnesia — forgot a path it already explored",
  "C5.3": "State drift — gradually diverged from the correct problem state",
  "C5.4": "Context bloat — token snowball; context growth degrades reasoning",
  "C6.1": "Step repetition / infinite loop — repeats the same step without progress",
  "C6.2": "Premature termination — claimed done before actually finishing",
  "C6.3": "Task drift / off-track — diverged from the original goal to unrelated work",
  "C6.4": "Non-monotonic iteration — iterative fixes make things worse",
  "C6.5": "Non-convergence — keeps changing strategy without approaching a solution",
  "C7.1": "Validation missing / incomplete — did no validation or only surface-level",
  "C7.2": "Validation-logic error — ran validation but reached the wrong conclusion",
  "C7.3": "Ignored validation feedback — test failed but the agent continued anyway",
  "C7.4": "Validation skipped — gave up on validation and shipped",
  "C8.1": "Wrong tool choice — picked an inappropriate tool or API",
  "C8.2": "Tool-call format error — wrong arguments / syntax / calling convention",
  "C8.3": "Missing environment dependency — missing lib / service / config",
  "C8.4": "Tool-output misread — incorrectly interpreted a tool's return value",
  "C9.1": "Info concealment (multi-agent) — had critical info, did not share",
  "C9.2": "Ignored input from other agent (multi-agent)",
  "C9.3": "Conversation reset (multi-agent) — dialog improperly restarted",
  "C9.4": "Did not ask for clarification (multi-agent)",
  // D facet — impact (how bad)
  D1: "Recoverable, mild — agent self-recovers, only resources wasted",
  D2: "Recoverable, moderate — needs a strategy pivot to recover",
  D3: "Unrecoverable — leads to a wrong final result",
  D4: "Cascading — failure propagates and triggers a chain of follow-on failures",
  D5: "Silent — no obvious error signal; the bug is not detected",
};

export function aftCodeTitle(code: string): string {
  const bare = stripCode(code);
  return AFT_CODE_DESC[bare] || bare;
}

const A_RAMP = [
  COLORS.palePeriwinkle, COLORS.lightBlue, COLORS.lightBlueLavender,
  COLORS.skyBlue, COLORS.brightBlue, COLORS.deepBlue,
];
const B_RAMP = [
  COLORS.lavender, COLORS.paleRose, COLORS.dustyPink,
  COLORS.peach, COLORS.mauve, COLORS.purple,
];
const D_RAMP = [
  COLORS.paleGreen, COLORS.mutedGreen, COLORS.coral,
  COLORS.darkBrownRed, COLORS.mauve,
];
const C_RAMPS: Record<number, string[]> = {
  1: [COLORS.paleYellow, COLORS.goldenYellow, COLORS.amber, COLORS.ochre],
  2: [COLORS.mintGreen, COLORS.mutedGreen, COLORS.darkGreen],
  3: [COLORS.lightBlue, COLORS.skyBlue, COLORS.brightBlue, COLORS.deepBlue],
  4: [COLORS.lavender, COLORS.paleRose, COLORS.dustyPink, COLORS.mauve,
      COLORS.purple, COLORS.peach, COLORS.coral, COLORS.darkBrownRed],
  5: [COLORS.palePeriwinkle, COLORS.lightBlueLavender, COLORS.skyBlue, COLORS.brightBlue],
  6: [COLORS.peach, COLORS.coral, COLORS.orange, COLORS.amber, COLORS.darkBrownRed],
  7: [COLORS.paleRose, COLORS.dustyPink, COLORS.mauve, COLORS.purple],
  8: [COLORS.paleGreen, COLORS.mintGreen, COLORS.mutedGreen, COLORS.darkGreen],
  9: [COLORS.gray, COLORS.lightGray, COLORS.veryLightGray],
};

export function aftCodeColor(code: string): string {
  const bare = stripCode(code);
  const facet = bare[0];
  const rest = bare.slice(1);
  if (facet === "A") {
    const i = Math.max(0, (parseInt(rest, 10) || 1) - 1);
    return A_RAMP[i % A_RAMP.length];
  }
  if (facet === "B") {
    const i = Math.max(0, (parseInt(rest, 10) || 1) - 1);
    return B_RAMP[i % B_RAMP.length];
  }
  if (facet === "D") {
    const i = Math.max(0, (parseInt(rest, 10) || 1) - 1);
    return D_RAMP[i % D_RAMP.length];
  }
  if (facet === "C") {
    const m = rest.match(/^(\d+)(?:\.(\d+))?/);
    if (m) {
      const alpha = parseInt(m[1], 10);
      const beta = m[2] ? parseInt(m[2], 10) : 1;
      const ramp = C_RAMPS[alpha] || [COLORS.gray];
      return ramp[(beta - 1) % ramp.length];
    }
  }
  return COLORS.gray;
}

/** Compact, JSON-serializable aggregate of a set of reports. */
export type RowAgg = {
  label: string;
  n: number;
  closeness: { success: number; "near-miss": number; partial: number; far: number };
  facets: { A: [string, number][]; B: [string, number][]; C: [string, number][]; D: [string, number][] };
};

export type DomainSection = {
  domain: string;
  sub: string;
  agg: RowAgg;
  benchmarks: RowAgg[];
};
