/**
 * Guhit's logo artwork as data (from assets/logo/final), so the splash can
 * animate each part while the printed logo stays one source of truth.
 */
export const BRAND = {
  ink: "#1E1B2E",
  orange: "#F26B3A",
  yellow: "#FFC21A",
  blue: "#2F9BEA",
  cream: "#FFF8EE",
};

/** mark.svg, viewBox 0 0 512 512. */
export const MARK = {
  face: { cx: 277, cy: 247, r: 100 },
  rays: [
    { x1: 167, y1: 105, x2: 203, y2: 138, color: BRAND.yellow },
    { x1: 254, y1: 70, x2: 254, y2: 117, color: BRAND.yellow },
    { x1: 352, y1: 102, x2: 322, y2: 130, color: BRAND.yellow },
    { x1: 442, y1: 200, x2: 407, y2: 227, color: BRAND.blue },
    { x1: 412, y1: 262, x2: 450, y2: 272, color: BRAND.blue },
    { x1: 130, y1: 247, x2: 80, y2: 260, color: BRAND.blue },
    { x1: 90, y1: 189, x2: 135, y2: 213, color: BRAND.blue },
  ],
  loop: "M358,388 C346,406 322,400 314,374 C310,358 308,348 305,340 A97,97 0 1 0 249,154 A97,97 0 1 0 305,340 C282,364 232,398 168,408 C122,415 85,395 85,360 C85,330 110,313 135,313 C165,313 183,335 175,360 C170,378 152,390 128,392",
  eyes: [
    { cx: 243, cy: 243, r: 12.5 },
    { cx: 325, cy: 238, r: 12.5 },
  ],
  smile: "M272,261 Q287,284 304,260",
};

/** wordmark-block.svg, viewBox 0 0 420 190: the printed logo. */
export const BLOCK = {
  viewBox: { x: 0, y: 0, w: 420, h: 190 },
  letters: [
    "M82,62 V122 C82,152 62,168 34,160",
    "M126,62 V102 C126,130 168,130 171,102 M171,62 V132",
    "M214,12 V132 M214,98 C216,58 266,56 266,94 V132",
    "M368,28 V112 C368,128 382,134 402,130 M348,64 H398",
  ],
  gBowl: { cx: 52, cy: 92, r: 30 },
  crayon: {
    body: "M300,66 H324 V126 Q324,134 316,134 H308 Q300,134 300,126 Z",
    tip: "M300,66 L312,32 L324,66 Z",
    lead: "M308,44 L312,32 L316,44 Z",
    band: { x: 300, y: 86, width: 24, height: 12 },
    /** Where the lead touches the paper: the pivot while it writes. */
    point: { x: 312, y: 32 },
  },
  dot: { cx: 312, cy: 8, r: 7 },
};
