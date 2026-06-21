// Maps the free-text "Origin" strings in the /aft C-facet tables
// (e.g. "MAST FM-1.3 15.7%; SWECompass INF") onto the scraped source-paper
// definitions in web/data/aft_sources.json, so each sub-code can be expanded
// to show the original failure-mode definition + example it was distilled from.
//
// Matching is deliberately tiered and best-effort: a reference always resolves
// to its *paper* (when the paper token is recognised) and, when possible, to a
// specific *failure mode* within that paper via — in order — exact code id,
// reported percentage, or significant-name-token overlap. References whose
// paper token isn't one of the 8 Tier-1 sources (e.g. "Cognitive Degradation",
// "SWE-Effi") are left unresolved and render as plain text.

export type AftSourceMode = {
  id: string;
  name: string;
  definition: string;
  example: string;
};
export type AftSourcePaper = {
  title: string;
  url: string;
  abstract: string;
  failure_modes: AftSourceMode[];
};
export type AftSources = Record<string, AftSourcePaper>;

export type ParsedOriginRef = {
  /** the recognised paper key into AftSources, e.g. "mast" */
  abbr: string;
  paper: AftSourcePaper;
  /** specific failure modes this reference resolved to (may be empty → paper-level only) */
  modes: AftSourceMode[];
};

// Paper-token aliases, most specific first (SWE-PRM before PRM).
const PAPER_ALIASES: [RegExp, string][] = [
  [/\bMAST\b/i, "mast"],
  [/\bEmpirical ?Fail\b/i, "empiricalfail"],
  [/\bUnveil ?Pitfalls\b/i, "unveilpitfalls"],
  [/\bWhen ?Agents ?Fail\b/i, "whenagentsfail"],
  [/\bSWE-?PRM\b/i, "swe_prm"],
  [/\bPRM\b/i, "swe_prm"],
  [/\bPAGENT\b/i, "pagent"],
  [/\bTRAIL\b/i, "trail"],
  [/\bSWE-?Compass\b/i, "swecompass"],
];

const GENERIC = new Set([
  "error", "errors", "bug", "bugs", "failure", "failures", "issue", "issues",
  "code", "agent", "agents", "system", "systems", "handling", "problem", "problems",
]);

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectPaper(chunk: string): { abbr: string; rest: string } | null {
  for (const [re, abbr] of PAPER_ALIASES) {
    const m = chunk.match(re);
    if (m && m.index !== undefined) {
      const rest = (chunk.slice(0, m.index) + chunk.slice(m.index + m[0].length)).trim();
      return { abbr, rest };
    }
  }
  return null;
}

function expandRange(a: string, b: string, ids: string[]): string[] {
  const pa = a.match(/^([A-Za-z]+\d*)\.(\d+)$/);
  const pb = b.match(/^([A-Za-z]+\d*)\.(\d+)$/);
  if (pa && pb && pa[1] === pb[1]) {
    const lo = +pa[2], hi = +pb[2];
    const out: string[] = [];
    for (let k = lo; k <= hi; k++) {
      const id = `${pa[1]}.${k}`;
      if (ids.includes(id)) out.push(id);
    }
    return out;
  }
  return [a, b].filter((id) => ids.includes(id));
}

function matchIds(rest: string, paper: AftSourcePaper): AftSourceMode[] {
  const ids = paper.failure_modes.map((m) => m.id).filter(Boolean);
  if (!ids.length) return [];
  const hit = new Set<string>();
  for (const id of ids) {
    const re = new RegExp(`(?:^|[^\\w.])${esc(id)}(?![\\w.])`);
    if (re.test(rest)) hit.add(id);
  }
  const rangeRe = /([A-Za-z]+\d+(?:\.\d+)?)\s*[–—-]\s*([A-Za-z]+\d+(?:\.\d+)?)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rangeRe.exec(rest)) !== null) {
    expandRange(rm[1], rm[2], ids).forEach((id) => hit.add(id));
  }
  return paper.failure_modes.filter((m) => m.id && hit.has(m.id));
}

function matchPct(rest: string, paper: AftSourcePaper): AftSourceMode[] {
  const pcts = [...rest.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => m[1]);
  if (!pcts.length) return [];
  return paper.failure_modes.filter((m) => {
    const hay = `${m.example} ${m.definition}`;
    return pcts.some((p) => hay.includes(`${p}%`));
  });
}

function toks(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9]+/g) || []).filter((t) => t.length >= 4);
}

function nameMatch(rest: string, paper: AftSourcePaper): AftSourceMode[] {
  const rt = toks(rest);
  if (!rt.length) return [];
  let best: AftSourceMode | null = null;
  let bestScore = 0;
  let tie = false;
  for (const m of paper.failure_modes) {
    const nt = toks(m.name);
    let score = 0;
    for (const a of rt) {
      for (const b of nt) {
        if (a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))) {
          score += GENERIC.has(b) ? 0 : 1;
          break;
        }
      }
    }
    if (score > bestScore) {
      best = m;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return best && bestScore >= 1 && !tie ? [best] : [];
}

/** Parse an Origin string into its resolved source references. */
export function parseOrigin(origin: string, sources: AftSources): ParsedOriginRef[] {
  if (!origin || !sources || !Object.keys(sources).length) return [];
  const out: ParsedOriginRef[] = [];
  let prevAbbr: string | null = null;
  for (const rawChunk of origin.split(";")) {
    const chunk = rawChunk.trim();
    if (!chunk) continue;
    let abbr: string | null = null;
    let rest = chunk;
    const det = detectPaper(chunk);
    if (det) {
      abbr = det.abbr;
      rest = det.rest;
    } else if (prevAbbr && /^[A-Za-z]+\d/.test(chunk)) {
      // bare code continuation, e.g. "EmpiricalFail A1; B4"
      abbr = prevAbbr;
      rest = chunk;
    }
    if (!abbr) continue;
    prevAbbr = abbr;
    const paper = sources[abbr];
    if (!paper) continue;

    let modes = matchIds(rest, paper);
    if (!modes.length) modes = matchPct(rest, paper);
    if (!modes.length) modes = nameMatch(rest, paper);

    const existing = out.find((r) => r.abbr === abbr);
    if (existing) {
      for (const m of modes) {
        if (!existing.modes.some((x) => x.id === m.id && x.name === m.name)) {
          existing.modes.push(m);
        }
      }
    } else {
      out.push({ abbr, paper, modes });
    }
  }
  return out;
}
