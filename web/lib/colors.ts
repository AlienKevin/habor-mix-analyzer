/** Single source of truth for the site palette.
 *  Keep raw hex values here; all visualizations import from this file so a
 *  palette tweak is one edit. */
export const COLORS = {
  white: "#FFFFFF",
  nearBlack: "#111111",

  paleGreen: "#D9F0D4",
  mintGreen: "#BFEFC5",
  mutedGreen: "#B4D3AB",
  darkGreen: "#123D1E",

  palePeriwinkle: "#D6DDF7",
  lightBlueLavender: "#B8C7F3",
  deepBlue: "#174F8F",
  lightBlue: "#CFDEF0",
  skyBlue: "#9BC6EA",
  brightBlue: "#4D82DB",

  paleYellow: "#FFF1B8",
  goldenYellow: "#FFD45C",
  ochre: "#B98B00",

  peach: "#E4B6AC",
  coral: "#E47766",
  darkBrownRed: "#7A2E1F",

  paleRose: "#EECFD4",
  dustyPink: "#C28FA9",
  mauve: "#AD5781",

  orange: "#FB8C00",
  amber: "#FFB300",

  lavender: "#D6D2F0",
  purple: "#6D51A6",

  veryLightGray: "#F1F1F1",
  gray: "#C6C6C6",
  lightGray: "#D9D9D9",
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick near-black or white text for readable contrast on a pastel chip background. */
export function contrastTextOn(background: string): string {
  const bgL = relativeLuminance(background);
  const darkL = relativeLuminance(COLORS.nearBlack);
  const lightL = relativeLuminance(COLORS.white);
  const darkContrast = (Math.max(bgL, darkL) + 0.05) / (Math.min(bgL, darkL) + 0.05);
  const lightContrast = (Math.max(bgL, lightL) + 0.05) / (Math.min(bgL, lightL) + 0.05);
  return darkContrast >= lightContrast ? COLORS.nearBlack : COLORS.white;
}

/** Closeness verdict colors. Pale shades for backgrounds, dark for text. */
export const CLOSENESS_BG: Record<string, string> = {
  "success":    COLORS.palePeriwinkle,
  "near-miss":  COLORS.mintGreen,
  "partial":    COLORS.paleYellow,
  "far":        COLORS.peach,
};
export const CLOSENESS_FG: Record<string, string> = {
  "success":    COLORS.deepBlue,
  "near-miss":  COLORS.darkGreen,
  "partial":    COLORS.ochre,
  "far":        COLORS.darkBrownRed,
};
export const CLOSENESS_SOLID: Record<string, string> = {
  "success":    COLORS.skyBlue,
  "near-miss":  COLORS.mutedGreen,
  "partial":    COLORS.goldenYellow,
  "far":        COLORS.coral,
};

/** Reward-hacking / task-quality verdict colors. */
export const VERDICT_BG: Record<string, string> = {
  "clean":                COLORS.paleGreen,
  "accept":               COLORS.paleGreen,
  "suspicious":           COLORS.paleYellow,
  "accept_with_caveats":  COLORS.paleYellow,
  "questionable":         COLORS.paleYellow,
  "hack":                 COLORS.paleRose,
  "reject":               COLORS.paleRose,
  "broken":               COLORS.paleRose,
};
export const VERDICT_FG: Record<string, string> = {
  "clean":                COLORS.darkGreen,
  "accept":               COLORS.darkGreen,
  "suspicious":           COLORS.ochre,
  "accept_with_caveats":  COLORS.ochre,
  "questionable":         COLORS.ochre,
  "hack":                 COLORS.darkBrownRed,
  "reject":               COLORS.darkBrownRed,
  "broken":               COLORS.darkBrownRed,
};

/** Facet-letter chip palette (backgrounds for AFT code chips). */
export const FACET_BG: Record<string, string> = {
  A: COLORS.palePeriwinkle,
  B: COLORS.lavender,
  C: COLORS.paleYellow,
  D: COLORS.paleGreen,
};
export const FACET_FG: Record<string, string> = {
  A: COLORS.deepBlue,
  B: COLORS.purple,
  C: COLORS.ochre,
  D: COLORS.darkGreen,
};
