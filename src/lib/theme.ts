export type Mode = "system" | "light" | "dark";
/** What's actually shown. Dark is a soft slate, not near-black. */
export type Shade = "light" | "dark";

/** Auto follows the phone's light/dark setting. */
export const resolveShade = (mode: Mode, systemDark: boolean): Shade =>
  mode === "system" ? (systemDark ? "dark" : "light") : mode;

export const BG = { light: "#eef0ec", dark: "#2b303b" } as const;

type Swatch = { accent: string; soft: string; on: string };
export type Palette = { name: string; light: Swatch; dark: Swatch };

export const PALETTES: Record<string, Palette> = {
  green: {
    name: "Green",
    light: { accent: "#0f8a5f", soft: "#e3f3ec", on: "#ffffff" },
    dark: { accent: "#34c48b", soft: "rgba(52,196,139,0.14)", on: "#08291c" },
  },
  blue: {
    name: "Blue",
    light: { accent: "#2563eb", soft: "#e4ecfd", on: "#ffffff" },
    dark: { accent: "#60a5fa", soft: "rgba(96,165,250,0.15)", on: "#0b1e3a" },
  },
  purple: {
    name: "Purple",
    light: { accent: "#7c3aed", soft: "#efe8fd", on: "#ffffff" },
    dark: { accent: "#a78bfa", soft: "rgba(167,139,250,0.16)", on: "#1e1338" },
  },
  pink: {
    name: "Pink",
    light: { accent: "#db2777", soft: "#fce7f1", on: "#ffffff" },
    dark: { accent: "#f472b6", soft: "rgba(244,114,182,0.15)", on: "#3a0d22" },
  },
  orange: {
    name: "Orange",
    light: { accent: "#c2410c", soft: "#fcebe2", on: "#ffffff" },
    dark: { accent: "#fb923c", soft: "rgba(251,146,60,0.15)", on: "#3a1a06" },
  },
  teal: {
    name: "Teal",
    light: { accent: "#0e7490", soft: "#e0f2f6", on: "#ffffff" },
    dark: { accent: "#22d3ee", soft: "rgba(34,211,238,0.14)", on: "#062a33" },
  },
};

export const DEFAULT_PALETTE = "green";

export type Settings = { palette: string; mode: Mode };
const KEY = "e0gas:settings";

export function loadSettings(): Settings {
  const fallback: Settings = { palette: DEFAULT_PALETTE, mode: "system" };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return {
      palette: raw?.palette in PALETTES ? raw.palette : fallback.palette,
      // "dim" was the old name for today's Dark.
      mode: raw?.mode === "dim" ? "dark" : ["system", "light", "dark"].includes(raw?.mode) ? raw.mode : fallback.mode,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** Push the theme onto <html> so the CSS variables follow it. */
export function applyTheme(palette: string, shade: Shade) {
  const sw = paletteSwatch(palette, shade);
  const root = document.documentElement;
  root.dataset.theme = shade;
  root.style.setProperty("--accent", sw.accent);
  root.style.setProperty("--accent-soft", sw.soft);
  root.style.setProperty("--on-accent", sw.on);
  // Browser chrome color: the media-keyed metas from layout only know the system theme.
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.content = BG[shade];
  }
}

/**
 * Inline <head> script: apply saved settings before first paint to avoid a flash
 * of the default theme. Mirrors loadSettings/applyTheme.
 */
export const THEME_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||"null")||{};var P=${JSON.stringify(
  Object.fromEntries(Object.entries(PALETTES).map(([k, p]) => [k, [p.light, p.dark]])),
)};var m=s.mode;var t=m==="light"?"light":m==="dim"||m==="dark"?"dark":(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var p=P[s.palette]||P[${JSON.stringify(DEFAULT_PALETTE)}];var w=p[t==="light"?0:1];var r=document.documentElement;r.dataset.theme=t;r.style.setProperty("--accent",w.accent);r.style.setProperty("--accent-soft",w.soft);r.style.setProperty("--on-accent",w.on)}catch(e){}`;

export function paletteSwatch(palette: string, shade: Shade): Swatch {
  return (PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE])[shade === "light" ? "light" : "dark"];
}
