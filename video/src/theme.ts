// Guhit's look: warm paper, a box of crayons, the logo's four brand colours.
import "@fontsource/grandstander/700.css";
import "@fontsource/grandstander/800.css";
import "@fontsource/grandstander/900.css";
import "@fontsource/andika/400.css";
import "@fontsource/andika/700.css";

export const C = {
  // Brand (assets/logo/final)
  ink: "#1E1B2E",
  orange: "#F26B3A",
  yellow: "#FFC21A",
  blue: "#2F9BEA",
  cream: "#FFF8EE",
  // App crayons (src/app/globals.css)
  paper: "#FFF8EC",
  paperDeep: "#F6EAD3",
  paperEdge: "#E8D6B5",
  inkSoft: "#594C6B",
  red: "#E5533C",
  sun: "#FFC93C",
  grass: "#5CB85C",
  sky: "#5AAEE8",
  grape: "#7C4CC8",
  pink: "#F585AE",
  skyTop: "#CFE9FB",
  skyBottom: "#FFF3DC",
} as const;

export const DISPLAY = "Grandstander, ui-rounded, system-ui, sans-serif";
export const BODY = "Andika, ui-rounded, system-ui, sans-serif";

/** Soft long shadow, like a paper cut-out lifted off the table. */
export const LONG_SHADOW = "0 60px 90px -30px rgba(42,34,56,0.45), 0 18px 30px -12px rgba(42,34,56,0.25)";

/** Paper grain as a data-URI SVG (the app's own body texture). */
export const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.27 0 0 0 0 0.16 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
