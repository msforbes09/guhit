/**
 * Test drawings made in code (no downloaded or generated art): simple
 * characters with crayon-like hatching, wobbly outlines, and photo problems
 * on top (uneven light, a phone shadow, grey paper, sensor noise).
 */

export interface Sample {
  id: string;
  label: string;
  make: () => Promise<Blob>;
}

type Ctx = CanvasRenderingContext2D;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function wobblyPath(ctx: Ctx, pts: [number, number][], rand: () => number, closed = true, j = 2.5) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const px = x + (rand() - 0.5) * j;
    const py = y + (rand() - 0.5) * j;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  if (closed) ctx.closePath();
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 40): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Crayon fill: diagonal hatching clipped to the shape, with gaps and spill. */
function crayonFill(ctx: Ctx, pts: [number, number][], color: string, rand: () => number, spill = 4) {
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 20,
    x1 = Math.max(...xs) + 20,
    y0 = Math.min(...ys) - 20,
    y1 = Math.max(...ys) + 20;
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    // Grow the clip a little: children colour over the lines.
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    const dx = x - cx,
      dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const gx = x + (dx / d) * spill * rand();
    const gy = y + (dy / d) * spill * rand();
    if (i === 0) ctx.moveTo(gx, gy);
    else ctx.lineTo(gx, gy);
  });
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let k = x0 - (y1 - y0); k < x1; k += 5) {
    if (rand() < 0.08) continue;
    ctx.globalAlpha = 0.55 + rand() * 0.4;
    ctx.lineWidth = 4 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(k, y1);
    ctx.lineTo(k + (y1 - y0) * (0.9 + rand() * 0.2), y0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function outline(ctx: Ctx, pts: [number, number][], rand: () => number, width = 9, color = "#2a2140", closed = true) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  wobblyPath(ctx, pts, rand, closed);
  ctx.stroke();
}

function paper(ctx: Ctx, w: number, h: number, tone = "#f6f2ea") {
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, w, h);
}

/** Photo problems: light falloff, an optional soft shadow, grain. */
function photoLook(
  ctx: Ctx,
  w: number,
  h: number,
  rand: () => number,
  opts: { falloff?: number; shadow?: boolean; vignette?: number },
) {
  if (opts.falloff) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(40,30,20,${opts.falloff})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (opts.vignette) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(20,20,30,${opts.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (opts.shadow) {
    ctx.save();
    ctx.filter = "blur(40px)";
    ctx.fillStyle = "rgba(30,30,40,0.38)";
    ctx.beginPath();
    ctx.ellipse(w * 0.05, h * 0.1, w * 0.45, h * 0.16, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function toBlob(c: HTMLCanvasElement, type = "image/png", q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), type, q));
}

async function tala(): Promise<Blob> {
  const W = 900,
    H = 1200;
  const [c, ctx] = canvas(W, H);
  const r = rng(7);
  paper(ctx, W, H);
  const body = ellipsePts(450, 720, 170, 210);
  const head = ellipsePts(450, 410, 130, 115);
  const wingL: [number, number][] = [
    [300, 600],
    [150, 500],
    [190, 590],
    [110, 640],
    [200, 680],
    [150, 760],
    [290, 720],
  ];
  const wingR = wingL.map(([x, y]) => [900 - x, y] as [number, number]);
  const tail: [number, number][] = [
    [590, 850],
    [700, 900],
    [770, 860],
    [800, 760],
    [830, 790],
    [810, 900],
    [720, 960],
    [600, 920],
  ];
  const footL = ellipsePts(370, 930, 70, 32);
  const footR = ellipsePts(530, 930, 70, 32);
  crayonFill(ctx, wingL, "#f59ac0", r);
  crayonFill(ctx, wingR, "#f59ac0", r);
  crayonFill(ctx, tail, "#9b6fd6", r);
  crayonFill(ctx, body, "#9b6fd6", r);
  crayonFill(ctx, head, "#9b6fd6", r);
  crayonFill(ctx, ellipsePts(450, 760, 85, 120), "#f4d36b", r, 2);
  crayonFill(ctx, footL, "#8457c9", r);
  crayonFill(ctx, footR, "#8457c9", r);
  for (const s of [wingL, wingR, tail, body, head, footL, footR]) outline(ctx, s, r);
  // Horns
  for (const sx of [-1, 1]) {
    const horn: [number, number][] = [
      [450 + sx * 60, 310],
      [450 + sx * 100, 220],
      [450 + sx * 110, 320],
    ];
    crayonFill(ctx, horn, "#f2c94c", r, 1);
    outline(ctx, horn, r, 7);
  }
  // Face
  for (const sx of [-1, 1]) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(450 + sx * 50, 400, 32, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, ellipsePts(450 + sx * 50, 400, 32, 32, 20), r, 6);
    ctx.fillStyle = "#1d1630";
    ctx.beginPath();
    ctx.arc(450 + sx * 46, 404, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  outline(ctx, [
    [395, 465],
    [450, 495],
    [505, 465],
  ], r, 6, "#2a2140", false);
  photoLook(ctx, W, H, r, { falloff: 0.18 });
  return toBlob(c, "image/jpeg", 0.85);
}

async function star(): Promise<Blob> {
  const W = 1000,
    H = 1000;
  const [c, ctx] = canvas(W, H);
  const r = rng(11);
  paper(ctx, W, H, "#f3efe6");
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? 150 : 330;
    pts.push([500 + Math.cos(a) * rad, 540 + Math.sin(a) * rad]);
  }
  crayonFill(ctx, pts, "#ffcc33", r, 6);
  outline(ctx, pts, r, 5, "#6b5a3a");
  ctx.fillStyle = "#3b2f1d";
  ctx.beginPath();
  ctx.arc(455, 510, 14, 0, Math.PI * 2);
  ctx.arc(545, 510, 14, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, [
    [450, 580],
    [500, 610],
    [550, 580],
  ], r, 5, "#3b2f1d", false);
  photoLook(ctx, W, H, r, { shadow: true, falloff: 0.25 });
  return toBlob(c, "image/jpeg", 0.85);
}

async function fish(): Promise<Blob> {
  const W = 1200,
    H = 900;
  const [c, ctx] = canvas(W, H);
  const r = rng(23);
  paper(ctx, W, H, "#ece9e2");
  const body = ellipsePts(560, 450, 260, 150);
  const tail: [number, number][] = [
    [800, 450],
    [960, 330],
    [930, 450],
    [960, 570],
  ];
  crayonFill(ctx, tail, "#f28b30", r);
  crayonFill(ctx, body, "#f6a04d", r);
  outline(ctx, tail, r, 10);
  outline(ctx, body, r, 10);
  for (let i = 0; i < 3; i++) {
    outline(ctx, ellipsePts(560 + i * 70, 450, 30, 90, 16).slice(0, 9), r, 6, "#c05a14", false);
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(400, 410, 30, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, ellipsePts(400, 410, 30, 30, 18), r, 6);
  ctx.fillStyle = "#1c1c2a";
  ctx.beginPath();
  ctx.arc(395, 412, 12, 0, Math.PI * 2);
  ctx.fill();
  // A bubble: a separate small piece next to the fish.
  outline(ctx, ellipsePts(250, 280, 26, 26, 18), r, 5, "#3a6fb0");
  photoLook(ctx, W, H, r, { vignette: 0.45 });
  return toBlob(c, "image/jpeg", 0.8);
}

async function stickKid(): Promise<Blob> {
  // An on-screen drawing: transparent background, crisp strokes.
  const W = 800,
    H = 1000;
  const [c, ctx] = canvas(W, H);
  const r = rng(5);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const head = ellipsePts(400, 250, 100, 100);
  ctx.fillStyle = "#ffd7b0";
  wobblyPath(ctx, head, r);
  ctx.fill();
  outline(ctx, head, r, 12, "#1f3b73");
  ctx.fillStyle = "#1f3b73";
  ctx.beginPath();
  ctx.arc(365, 240, 10, 0, Math.PI * 2);
  ctx.arc(435, 240, 10, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, [
    [360, 290],
    [400, 315],
    [440, 290],
  ], r, 10, "#e0475b", false);
  const shirt: [number, number][] = [
    [330, 360],
    [470, 360],
    [500, 640],
    [300, 640],
  ];
  ctx.fillStyle = "#4cc38a";
  wobblyPath(ctx, shirt, r);
  ctx.fill();
  outline(ctx, shirt, r, 12, "#1f3b73");
  // Arms out to the side, legs.
  outline(ctx, [
    [335, 400],
    [220, 470],
    [140, 430],
  ], r, 14, "#1f3b73", false);
  outline(ctx, [
    [465, 400],
    [590, 380],
    [660, 300],
  ], r, 14, "#1f3b73", false);
  outline(ctx, [
    [360, 640],
    [340, 880],
    [290, 900],
  ], r, 14, "#1f3b73", false);
  outline(ctx, [
    [440, 640],
    [460, 880],
    [510, 900],
  ], r, 14, "#1f3b73", false);
  return toBlob(c);
}

export const SAMPLES: Sample[] = [
  { id: "tala", label: "Tala the dragon", make: tala },
  { id: "star", label: "Star (phone shadow)", make: star },
  { id: "fish", label: "Fish (dark corners)", make: fish },
  { id: "stick", label: "Screen drawing", make: stickKid },
];
