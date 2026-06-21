/** Normalize instruction.md before markdown + math rendering. */

const FENCE_RE = /(```[\s\S]*?```)/g;

function transformProse(segment: string): string {
  let text = segment;

  // Harbor/Python template escaping in LaTeX, e.g. \begin{{cases}} → \begin{cases}
  text = text.replace(/\{\{/g, "{").replace(/\}\}/g, "}");

  // BBCode-style lists used in some math tasks
  text = text.replace(/\[list\]\s*/gi, "\n");
  text = text.replace(/\[\*\]\s*/g, "\n- ");
  text = text.replace(/\[\/list\]\s*/gi, "\n");

  // BBCode italic attribution, e.g. [i]Sean Li[/i]
  text = text.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "_$1_");

  // LaTeX display math delimiters \[ ... \] → $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`);

  // LaTeX inline \( ... \) → $ ... $
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => `$${body.trim()}$`);

  return text;
}

export function preprocessInstructionMarkdown(raw: string): string {
  const out: string[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(raw)) !== null) {
    out.push(transformProse(raw.slice(last, match.index)));
    out.push(match[1]);
    last = match.index + match[1].length;
  }
  out.push(transformProse(raw.slice(last)));
  return out.join("");
}
