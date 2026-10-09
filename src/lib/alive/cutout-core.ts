/**
 * Classical cut-out of a child's drawing photographed on paper (or drawn on
 * screen). Pure typed-array code with no DOM access, so it runs the same in a
 * Web Worker, on the main thread, and in Node for offline tuning.
 *
 * Pipeline:
 *  1. Composite any transparency onto white (on-screen drawings).
 *  2. Shading pass: a local "paper brightness" estimate from a small-window
 *     max filter, so ink and crayon read as dark/colourful even under uneven
 *     light or a phone shadow.
 *  3. Ink mask with hysteresis thresholds, plus a "not paper coloured" mask
 *     so a wooden table or coloured surface around the sheet is detected.
 *  4. Morphological close bridges crayon gaps; big regions hugging the image
 *     border (table, sheet edge, shadows) are discarded.
 *  5. Flood-fill paper from the border: everything enclosed becomes solid,
 *     so white or coloured interiors inside an outline stay.
 *  6. Keep the main character (largest piece) plus nearby pieces.
 *  7. Colour pass: paper brightness re-estimated from paper pixels only and
 *     inpainted under the character, so big crayon fills keep their colour
 *     while the paper turns clean white (a scanner-style flat-field fix; the
 *     child's strokes are never redrawn).
 *  8. Feather the edge and crop with padding.
 */

export interface CoreOptions {
  /** Close radius as a fraction of the long side. */
  closeFrac?: number;
  /** Return intermediate masks for the lab page. */
  debug?: boolean;
}

export interface CoreResult {
  /** Cropped cut-out, straight (non-premultiplied) RGBA. */
  rgba: Uint8ClampedArray;
  /** Cropped alpha, one byte per pixel. */
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  /** Crop rectangle in the processed image. */
  crop: { x: number; y: number; w: number; h: number };
  quality: "good" | "poor";
  reasons: string[];
  timings: Record<string, number>;
  stats: Record<string, number>;
  /** Full-frame alpha (processed size), for debug views. */
  fullAlpha?: Uint8ClampedArray;
  /** Full-frame ink score 0..255 (processed size), for debug views. */
  scoreMap?: Uint8ClampedArray;
}

type Now = () => number;
const now: Now =
  typeof performance !== "undefined" ? () => performance.now() : () => Date.now();

const LUM_R = 0.299;
const LUM_G = 0.587;
const LUM_B = 0.114;

export function cutoutCore(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  options: CoreOptions = {},
): CoreResult {
  const timings: Record<string, number> = {};
  const stats: Record<string, number> = {};
  let t = now();
  const lap = (name: string) => {
    const n = now();
    timings[name] = Math.round((n - t) * 10) / 10;
    t = n;
  };

  const W = width;
  const H = height;
  const N = W * H;
  const longSide = Math.max(W, H);

  // 1. RGB planes with transparency composited onto white.
  const R = new Float32Array(N);
  const G = new Float32Array(N);
  const B = new Float32Array(N);
  let transparent = 0;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const a = src[j + 3] / 255;
    if (a < 0.98) transparent++;
    const inv = 255 * (1 - a);
    R[i] = src[j] * a + inv;
    G[i] = src[j + 1] * a + inv;
    B[i] = src[j + 2] * a + inv;
  }
  stats.transparentFrac = transparent / N;
  lap("prepare");

  // 2. Shading pass: block max (by luminance) over a small window. A stroke
  //    thinner than one block always has paper within the window.
  const block1 = Math.max(6, Math.round(longSide / 64));
  const shade1 = shadingFromBlockMax(R, G, B, W, H, block1);
  lap("shading");

  // 3. Ink score: darkness or colourfulness relative to the local paper.
  const score = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = Math.min(1.2, R[i] / shade1.r[i]);
    const g = Math.min(1.2, G[i] / shade1.g[i]);
    const b = Math.min(1.2, B[i] / shade1.b[i]);
    const lum = LUM_R * r + LUM_G * g + LUM_B * b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    score[i] = Math.max(1 - lum, (mx - mn) * 0.9);
  }
  const noise = percentileOf(score, 0.6);
  const tLo = clamp(noise * 2.2 + 0.05, 0.09, 0.2);
  const tHi = clamp(tLo * 2, 0.2, 0.36);
  stats.noise = round3(noise);
  stats.tLo = round3(tLo);
  stats.tHi = round3(tHi);
  const ink = hysteresis(score, W, H, tLo, tHi);
  lap("threshold");

  // Surfaces that are not paper-coloured (a wooden table, a coloured cloth)
  // are judged on raw chromaticity against the sheet's own colour, because
  // the local shading pass would treat a big uniform table as "paper".
  const paperChroma = estimatePaperChroma(R, G, B, score, tLo);
  const colourful = new Uint8Array(N);
  let colourfulCount = 0;
  for (let i = 0; i < N; i++) {
    const s = R[i] + G[i] + B[i] + 1;
    const dr = R[i] / s - paperChroma.r;
    const dg = G[i] / s - paperChroma.g;
    const db = B[i] / s - paperChroma.b;
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    if (d > 0.045) {
      colourful[i] = 1;
      colourfulCount++;
    }
  }
  stats.colourfulFrac = round3(colourfulCount / N);

  // 4. Close small gaps so crayon texture and broken outlines join up.
  const closeR = Math.max(2, Math.round(longSide * (options.closeFrac ?? 0.007)));
  const candidate = new Uint8Array(N);
  for (let i = 0; i < N; i++) candidate[i] = ink[i] | colourful[i];
  const closed = close(candidate, W, H, closeR);
  lap("morphology");

  // Big regions hugging the frame are the table, the sheet edge or a shadow.
  const comps = labelComponents(closed, W, H, true);
  const perimeter = 2 * (W + H);
  const junk = new Uint8Array(comps.count + 1);
  let junkPixels = 0;
  for (let c = 1; c <= comps.count; c++) {
    const touch = comps.border[c];
    const area = comps.area[c];
    if (touch > perimeter * 0.08 || (touch > 0 && area > N * 0.2)) {
      junk[c] = 1;
      junkPixels += area;
    }
  }
  stats.junkFrac = round3(junkPixels / N);
  const kept = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const l = comps.labels[i];
    if (l && !junk[l]) kept[i] = 1;
  }

  // 5. Paper = what the border can reach; enclosed areas become solid.
  const filled = fillHoles(kept, W, H);
  lap("components");

  // 6. Main character plus nearby pieces (a detached antenna tip, a tail).
  const pieces = labelComponents(filled, W, H, true);
  let main = 0;
  for (let c = 1; c <= pieces.count; c++) {
    if (!main || pieces.area[c] > pieces.area[main]) main = c;
  }
  const selected = new Uint8Array(N);
  let selectedArea = 0;
  if (main) {
    const keep = new Uint8Array(pieces.count + 1);
    const mb = pieces.bbox[main];
    const mainArea = pieces.area[main];
    for (let c = 1; c <= pieces.count; c++) {
      if (c === main) {
        keep[c] = 1;
        continue;
      }
      const gap = bboxGap(mb, pieces.bbox[c]);
      const area = pieces.area[c];
      if (
        (gap <= longSide * 0.04 && area >= Math.max(12, mainArea * 0.002)) ||
        (gap <= longSide * 0.12 && area >= mainArea * 0.2)
      ) {
        keep[c] = 1;
      }
    }
    for (let i = 0; i < N; i++) {
      if (keep[pieces.labels[i]]) {
        selected[i] = 1;
        selectedArea++;
      }
    }
  }
  stats.fgFrac = round3(selectedArea / N);
  lap("select");

  // 7. Colour pass from paper pixels only, inpainted under the character.
  const paperOnly = new Uint8Array(N);
  const nearInk = dilate(filled, W, H, Math.max(2, Math.round(closeR * 0.6)));
  for (let i = 0; i < N; i++) {
    const l = comps.labels[i];
    paperOnly[i] = !nearInk[i] && !(l && junk[l]) && !colourful[i] ? 1 : 0;
  }
  const shade2 = shadingFromPaper(R, G, B, paperOnly, W, H, Math.max(8, Math.round(longSide / 40)), shade1);
  lap("colour");

  // 8. Soft 1-2 px edge, crop, and straight-alpha output.
  const alphaFull = feather(selected, W, H);
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (alphaFull[row + x] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const reasons: string[] = [];
  if (x1 < 0) {
    x0 = 0;
    y0 = 0;
    x1 = W - 1;
    y1 = H - 1;
    reasons.push("no drawing found");
  }
  const pad = Math.max(6, Math.round(Math.max(x1 - x0, y1 - y0) * 0.04));
  const cx = Math.max(0, x0 - pad);
  const cy = Math.max(0, y0 - pad);
  const cw = Math.min(W, x1 + pad + 1) - cx;
  const ch = Math.min(H, y1 + pad + 1) - cy;
  const rgba = new Uint8ClampedArray(cw * ch * 4);
  const alpha = new Uint8ClampedArray(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = (y + cy) * W + (x + cx);
      const di = y * cw + x;
      const a = alphaFull[si];
      alpha[di] = a;
      if (a === 0) continue;
      const o = di * 4;
      rgba[o] = (R[si] / shade2.r[si]) * 255;
      rgba[o + 1] = (G[si] / shade2.g[si]) * 255;
      rgba[o + 2] = (B[si] / shade2.b[si]) * 255;
      rgba[o + 3] = a;
    }
  }
  lap("crop");

  // Quality: the lab and the app offer the AI cut-out when this says poor.
  if (stats.fgFrac > 0.65) reasons.push("most of the photo was kept; background not separated");
  if (stats.fgFrac < 0.004 && x1 >= 0) reasons.push("very little drawing found");
  if (x0 <= 1 || y0 <= 1 || x1 >= W - 2 || y1 >= H - 2) reasons.push("drawing touches the photo edge");
  const strayInk = countStray(ink, selected, comps.labels, junk);
  stats.strayFrac = round3(selectedArea ? strayInk / selectedArea : 0);
  if (stats.strayFrac > 0.35) reasons.push("lots of marks outside the character (busy background?)");
  const quality = reasons.some((r) => r !== "drawing touches the photo edge") ? "poor" : "good";

  timings.total = Object.values(timings).reduce((s, v) => s + v, 0);
  timings.total = Math.round(timings.total * 10) / 10;

  const result: CoreResult = {
    rgba,
    alpha,
    width: cw,
    height: ch,
    crop: { x: cx, y: cy, w: cw, h: ch },
    quality,
    reasons,
    timings,
    stats,
  };
  if (options.debug) {
    result.fullAlpha = alphaFull;
    const sm = new Uint8ClampedArray(N);
    for (let i = 0; i < N; i++) sm[i] = score[i] * 255;
    result.scoreMap = sm;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Shading estimates                                                   */
/* ------------------------------------------------------------------ */

interface Shade {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

/**
 * Local paper brightness: per block, the colour of its brightest pixels;
 * then the brightest neighbour within one block; then a light blur.
 */
function shadingFromBlockMax(
  R: Float32Array,
  G: Float32Array,
  B: Float32Array,
  W: number,
  H: number,
  bs: number,
): Shade {
  const gw = Math.ceil(W / bs);
  const gh = Math.ceil(H / bs);
  const br = new Float32Array(gw * gh);
  const bg = new Float32Array(gw * gh);
  const bb = new Float32Array(gw * gh);
  const bl = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const xs = gx * bs,
        ys = gy * bs;
      const xe = Math.min(W, xs + bs),
        ye = Math.min(H, ys + bs);
      hist.fill(0);
      let n = 0;
      for (let y = ys; y < ye; y++) {
        for (let x = xs; x < xe; x++) {
          const i = y * W + x;
          const l = (LUM_R * R[i] + LUM_G * G[i] + LUM_B * B[i]) | 0;
          hist[l > 255 ? 255 : l]++;
          n++;
        }
      }
      // Brightest ~8% of the block, skipping the top 1% (sensor noise).
      let acc = 0,
        cut = 255;
      const want = Math.max(1, Math.round(n * 0.08));
      for (let v = 255; v >= 0; v--) {
        acc += hist[v];
        if (acc >= want) {
          cut = v;
          break;
        }
      }
      let sr = 0,
        sg = 0,
        sb = 0,
        c = 0;
      for (let y = ys; y < ye; y++) {
        for (let x = xs; x < xe; x++) {
          const i = y * W + x;
          const l = LUM_R * R[i] + LUM_G * G[i] + LUM_B * B[i];
          if (l >= cut) {
            sr += R[i];
            sg += G[i];
            sb += B[i];
            c++;
          }
        }
      }
      const k = gy * gw + gx;
      br[k] = sr / c;
      bg[k] = sg / c;
      bb[k] = sb / c;
      bl[k] = LUM_R * br[k] + LUM_G * bg[k] + LUM_B * bb[k];
    }
  }
  // Brightest neighbour (keeps the three channels of one block together).
  const mr = new Float32Array(gw * gh);
  const mg = new Float32Array(gw * gh);
  const mb = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let best = -1,
        bk = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = gy + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = gx + dx;
          if (xx < 0 || xx >= gw) continue;
          const k = yy * gw + xx;
          if (bl[k] > best) {
            best = bl[k];
            bk = k;
          }
        }
      }
      const k = gy * gw + gx;
      mr[k] = br[bk];
      mg[k] = bg[bk];
      mb[k] = bb[bk];
    }
  }
  return {
    r: upsampleGrid(blurGrid(mr, gw, gh), gw, gh, bs, W, H),
    g: upsampleGrid(blurGrid(mg, gw, gh), gw, gh, bs, W, H),
    b: upsampleGrid(blurGrid(mb, gw, gh), gw, gh, bs, W, H),
  };
}

/**
 * Paper colour from paper pixels only. Blocks without enough paper (under
 * the character, or outside the sheet) are filled from their neighbours by
 * pull-push, so a large crayon fill is divided by the paper around it rather
 * than by itself.
 */
function shadingFromPaper(
  R: Float32Array,
  G: Float32Array,
  B: Float32Array,
  paper: Uint8Array,
  W: number,
  H: number,
  bs: number,
  fallback: Shade,
): Shade {
  const gw = Math.ceil(W / bs);
  const gh = Math.ceil(H / bs);
  const M = gw * gh;
  const sr = new Float32Array(M);
  const sg = new Float32Array(M);
  const sb = new Float32Array(M);
  const cnt = new Float32Array(M);
  for (let y = 0; y < H; y++) {
    const gy = (y / bs) | 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!paper[i]) continue;
      const k = gy * gw + ((x / bs) | 0);
      sr[k] += R[i];
      sg[k] += G[i];
      sb[k] += B[i];
      cnt[k]++;
    }
  }
  const known = new Uint8Array(M);
  let knownCount = 0;
  const minCount = bs * bs * 0.2;
  for (let k = 0; k < M; k++) {
    if (cnt[k] >= minCount) {
      sr[k] /= cnt[k];
      sg[k] /= cnt[k];
      sb[k] /= cnt[k];
      known[k] = 1;
      knownCount++;
    }
  }
  if (knownCount < Math.max(4, M * 0.05)) return fallback;
  const fr = pullPush(sr, known, gw, gh);
  const fg = pullPush(sg, known, gw, gh);
  const fb = pullPush(sb, known, gw, gh);
  // The mean of paper pixels sits a little below the paper's white point
  // (grain, noise); a small lift turns clean paper fully white.
  const lift = 0.97;
  for (let k = 0; k < M; k++) {
    fr[k] *= lift;
    fg[k] *= lift;
    fb[k] *= lift;
  }
  return {
    r: upsampleGrid(blurGrid(fr, gw, gh), gw, gh, bs, W, H),
    g: upsampleGrid(blurGrid(fg, gw, gh), gw, gh, bs, W, H),
    b: upsampleGrid(blurGrid(fb, gw, gh), gw, gh, bs, W, H),
  };
}

/** Fill unknown grid cells from known ones through a coarse pyramid. */
function pullPush(values: Float32Array, known: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = known[i] ? values[i] : 0;
  if (w <= 1 && h <= 1) return out;
  const cw = Math.ceil(w / 2);
  const chh = Math.ceil(h / 2);
  const cv = new Float32Array(cw * chh);
  const ck = new Uint8Array(cw * chh);
  for (let y = 0; y < chh; y++) {
    for (let x = 0; x < cw; x++) {
      let s = 0,
        n = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const xx = x * 2 + dx,
            yy = y * 2 + dy;
          if (xx >= w || yy >= h) continue;
          const k = yy * w + xx;
          if (known[k]) {
            s += values[k];
            n++;
          }
        }
      }
      if (n) {
        cv[y * cw + x] = s / n;
        ck[y * cw + x] = 1;
      }
    }
  }
  const coarse = pullPush(cv, ck, cw, chh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!known[k]) {
        // Bilinear read of the coarse level for a smooth fill.
        const fx = Math.min(cw - 1, Math.max(0, (x - 0.5) / 2));
        const fy = Math.min(chh - 1, Math.max(0, (y - 0.5) / 2));
        out[k] = bilinear(coarse, cw, chh, fx, fy);
      }
    }
  }
  return out;
}

function blurGrid(v: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(v.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0,
        n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const wt = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          s += v[yy * w + xx] * wt;
          n += wt;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

function bilinear(v: Float32Array, w: number, h: number, fx: number, fy: number): number {
  const x0 = Math.floor(fx),
    y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1),
    y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0,
    ty = fy - y0;
  const a = v[y0 * w + x0] * (1 - tx) + v[y0 * w + x1] * tx;
  const b = v[y1 * w + x0] * (1 - tx) + v[y1 * w + x1] * tx;
  return a * (1 - ty) + b * ty;
}

/** Grid values sit at block centres; bilinear to full resolution. */
function upsampleGrid(
  v: Float32Array,
  gw: number,
  gh: number,
  bs: number,
  W: number,
  H: number,
): Float32Array {
  const out = new Float32Array(W * H);
  const xs = new Float32Array(W);
  for (let x = 0; x < W; x++) xs[x] = Math.min(gw - 1, Math.max(0, (x + 0.5) / bs - 0.5));
  for (let y = 0; y < H; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / bs - 0.5));
    for (let x = 0; x < W; x++) {
      out[y * W + x] = Math.max(1, bilinear(v, gw, gh, xs[x], fy));
    }
  }
  return out;
}

function estimatePaperChroma(
  R: Float32Array,
  G: Float32Array,
  B: Float32Array,
  score: Float32Array,
  tLo: number,
): { r: number; g: number; b: number } {
  // Median chromaticity of clearly-paper pixels (sampled for speed).
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const step = Math.max(1, Math.floor(R.length / 40000));
  for (let i = 0; i < R.length; i += step) {
    if (score[i] > tLo * 0.5) continue;
    const s = R[i] + G[i] + B[i] + 1;
    rs.push(R[i] / s);
    gs.push(G[i] / s);
    bs.push(B[i] / s);
  }
  if (rs.length < 10) return { r: 1 / 3, g: 1 / 3, b: 1 / 3 };
  return { r: median(rs), g: median(gs), b: median(bs) };
}

/* ------------------------------------------------------------------ */
/* Masks                                                               */
/* ------------------------------------------------------------------ */

function hysteresis(score: Float32Array, W: number, H: number, lo: number, hi: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  for (let i = 0; i < N; i++) {
    if (score[i] >= hi) {
      out[i] = 1;
      stack[sp++] = i;
    }
  }
  while (sp) {
    const i = stack[--sp];
    const x = i % W;
    const y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const j = yy * W + xx;
        if (!out[j] && score[j] >= lo) {
          out[j] = 1;
          stack[sp++] = j;
        }
      }
    }
  }
  return out;
}

const EDT_INF = 1e20;

/** Squared distance to the nearest pixel where mask === target (Felzenszwalb). */
function distance2(mask: Uint8Array, W: number, H: number, target: number): Float32Array {
  const N = W * H;
  const d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = mask[i] === target ? 0 : EDT_INF;
  const n = Math.max(W, H);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = d[y * W + x];
    edt1d(f, H, out, v, z);
    for (let y = 0; y < H; y++) d[y * W + x] = out[y];
  }
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) f[x] = d[row + x];
    edt1d(f, W, out, v, z);
    for (let x = 0; x < W; x++) d[row + x] = out[x];
  }
  return d;
}

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -EDT_INF;
  z[1] = EDT_INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = EDT_INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

function dilate(mask: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const d = distance2(mask, W, H, 1);
  const out = new Uint8Array(W * H);
  const r2 = r * r;
  for (let i = 0; i < out.length; i++) out[i] = d[i] <= r2 ? 1 : 0;
  return out;
}

function erode(mask: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const d = distance2(mask, W, H, 0);
  const out = new Uint8Array(W * H);
  const r2 = r * r;
  for (let i = 0; i < out.length; i++) out[i] = d[i] > r2 ? 1 : 0;
  return out;
}

function close(mask: Uint8Array, W: number, H: number, r: number): Uint8Array {
  return erode(dilate(mask, W, H, r), W, H, r);
}

interface Components {
  labels: Int32Array;
  count: number;
  area: number[];
  border: number[];
  bbox: [number, number, number, number][];
}

function labelComponents(mask: Uint8Array, W: number, H: number, eight: boolean): Components {
  const N = W * H;
  const labels = new Int32Array(N);
  const stack = new Int32Array(N);
  const area: number[] = [0];
  const border: number[] = [0];
  const bbox: [number, number, number, number][] = [[0, 0, 0, 0]];
  let count = 0;
  for (let s = 0; s < N; s++) {
    if (!mask[s] || labels[s]) continue;
    count++;
    let a = 0,
      b = 0;
    let bx0 = W,
      by0 = H,
      bx1 = 0,
      by1 = 0;
    let sp = 0;
    stack[sp++] = s;
    labels[s] = count;
    while (sp) {
      const i = stack[--sp];
      const x = i % W;
      const y = (i / W) | 0;
      a++;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) b++;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!eight && dx !== 0 && dy !== 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx;
          if (mask[j] && !labels[j]) {
            labels[j] = count;
            stack[sp++] = j;
          }
        }
      }
    }
    area.push(a);
    border.push(b);
    bbox.push([bx0, by0, bx1, by1]);
  }
  return { labels, count, area, border, bbox };
}

/** Everything the image border cannot reach through background becomes 1. */
function fillHoles(mask: Uint8Array, W: number, H: number): Uint8Array {
  const N = W * H;
  const outside = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const seed = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < W; x++) {
    seed(x);
    seed((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    seed(y * W);
    seed(y * W + W - 1);
  }
  while (sp) {
    const i = stack[--sp];
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (y > 0) seed(i - W);
    if (y < H - 1) seed(i + W);
  }
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/** 1-2 px soft edge: 5x5 tent blur of the binary mask, eased so the edge stays tight. */
function feather(mask: Uint8Array, W: number, H: number): Uint8ClampedArray {
  const N = W * H;
  const tmp = new Float32Array(N);
  const k = [1, 2, 3, 2, 1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let d = -2; d <= 2; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= W) continue;
        s += mask[y * W + xx] * k[d + 2];
        n += k[d + 2];
      }
      tmp[y * W + x] = s / n;
    }
  }
  const out = new Uint8ClampedArray(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let d = -2; d <= 2; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= H) continue;
        s += tmp[yy * W + x] * k[d + 2];
        n += k[d + 2];
      }
      const a = s / n;
      // Pull the half-transparent band slightly inward to avoid a paper halo.
      const eased = clamp((a - 0.2) / 0.7, 0, 1);
      out[y * W + x] = eased * 255;
    }
  }
  return out;
}

/** Ink on the sheet that is not part of the character (the table is excluded). */
function countStray(
  ink: Uint8Array,
  selected: Uint8Array,
  labels: Int32Array,
  junk: Uint8Array,
): number {
  let n = 0;
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && !selected[i] && !junk[labels[i]]) n++;
  }
  return n;
}

function bboxGap(a: [number, number, number, number], b: [number, number, number, number]): number {
  const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
  const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
  return Math.hypot(dx, dy);
}

/** Histogram percentile of 0..1 scores. */
function percentileOf(v: Float32Array, p: number): number {
  const bins = 512;
  const hist = new Uint32Array(bins);
  for (let i = 0; i < v.length; i++) {
    const b = Math.min(bins - 1, Math.max(0, (v[i] * bins) | 0));
    hist[b]++;
  }
  const want = v.length * p;
  let acc = 0;
  for (let b = 0; b < bins; b++) {
    acc += hist[b];
    if (acc >= want) return (b + 0.5) / bins;
  }
  return 1;
}

function median(a: number[]): number {
  a.sort((x, y) => x - y);
  return a[a.length >> 1];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
