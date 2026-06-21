import { aftCodeColor, aftCodeTitle } from "@/lib/aft-codes";
import { contrastTextOn } from "@/lib/colors";
import type { FacetKey } from "@/lib/annotation-types";

/** Anchor on the /aft taxonomy page for a code: C-subcodes jump to their group
 *  (C4.2 → #C4), A/B/D jump to the facet section. */
function aftAnchor(facet: FacetKey, code: string): string {
  if (facet === "C") return code.match(/^C\d+/)?.[0] ?? "C";
  return facet;
}

export default function AftCodeBadge({ facet, code }: { facet: FacetKey; code: string }) {
  const bg = aftCodeColor(code);
  const fg = contrastTextOn(bg);
  return (
    <div className="flex items-baseline gap-2 text-xs leading-snug">
      <span className="font-mono text-slate-500 w-3 shrink-0">{facet}</span>
      <a
        href={`/aft/#${aftAnchor(facet, code)}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open the AFT taxonomy at ${code}`}
        className="inline-block px-1.5 py-0.5 rounded font-mono border shrink-0 font-semibold no-underline transition hover:ring-2 hover:ring-slate-400"
        style={{ background: bg, color: fg, borderColor: `${fg}33` }}
      >
        {code}
      </a>
      <span className="text-slate-700">{aftCodeTitle(code)}</span>
    </div>
  );
}
