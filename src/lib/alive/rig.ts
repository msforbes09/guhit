/**
 * Turns a cut-out mask into an animatable rig: where the feet are, how big
 * the character is, a guess at a waving arm, and a grid mesh that only
 * covers the drawn pixels. Units are "character heights": the feet sit at
 * y = 0 and the top of the drawing at y = 1.
 */

export interface ArmGuess {
  /** +1 right side of the drawing, -1 left. */
  side: 1 | -1;
  pivotX: number;
  pivotY: number;
  /** Horizontal distance over which the arm blends from body to fully rotating. */
  reach: number;
  /** Vertical half-size of the region that rotates with the arm. */
  halfHeight: number;
}

export interface RigInfo {
  texW: number;
  texH: number;
  /** Feet centre in texture pixels. */
  anchorX: number;
  anchorY: number;
  /** Texture pixels per character height. */
  unit: number;
  left: number;
  right: number;
  /** Half-width of the lowest part of the drawing, for the ground shadow. */
  footHalf: number;
  arm: ArmGuess;
}

export interface Mesh {
  /** Rest positions in character units (x right, y up), two floats per vertex. */
  positions: Float32Array;
  /** Texture coordinates 0..1, two floats per vertex. */
  uvs: Float32Array;
  indices: Uint16Array;
}

export interface MaskLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const ALPHA_ON = 40;

export function analyzeMask(mask: MaskLike): RigInfo {
  const { width: W, height: H, data } = mask;
  const rowL = new Int32Array(H).fill(-1);
  const rowR = new Int32Array(H).fill(-1);
  let x0 = W,
    x1 = -1,
    y0 = H,
    y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > ALPHA_ON) {
        if (rowL[y] < 0) rowL[y] = x;
        rowR[y] = x;
      }
    }
    if (rowL[y] >= 0) {
      if (rowL[y] < x0) x0 = rowL[y];
      if (rowR[y] > x1) x1 = rowR[y];
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) {
    x0 = 0;
    x1 = W - 1;
    y0 = 0;
    y1 = H - 1;
  }
  const unit = Math.max(1, y1 - y0);

  // Feet centre: middle of the lowest 8% of the drawing, so a tail sticking
  // out to one side does not drag the balance point off the body.
  const footTop = y1 - Math.max(1, Math.round(unit * 0.08));
  let fl = W,
    fr = -1;
  for (let y = footTop; y <= y1; y++) {
    if (rowL[y] < 0) continue;
    if (rowL[y] < fl) fl = rowL[y];
    if (rowR[y] > fr) fr = rowR[y];
  }
  if (fr < 0) {
    fl = x0;
    fr = x1;
  }
  // Blend the foot centre with the overall centre: balanced but grounded.
  const anchorX = ((fl + fr) / 2) * 0.6 + ((x0 + x1) / 2) * 0.4;
  const anchorY = y1;

  const toUx = (x: number) => (x - anchorX) / unit;
  const toUy = (y: number) => (anchorY - y) / unit;

  const arm = guessArm(rowL, rowR, y0, y1, toUx, toUy, unit, anchorX);

  return {
    texW: W,
    texH: H,
    anchorX,
    anchorY,
    unit,
    left: toUx(x0),
    right: toUx(x1),
    footHalf: Math.max(0.12, (fr - fl) / 2 / unit),
    arm,
  };
}

/**
 * Children draw arms as things that stick out sideways from the body in the
 * upper half. Find the side that sticks out most compared with the body's
 * usual edge, and rotate that region about where it leaves the body.
 */
function guessArm(
  rowL: Int32Array,
  rowR: Int32Array,
  y0: number,
  y1: number,
  toUx: (x: number) => number,
  toUy: (y: number) => number,
  unit: number,
  anchorX: number,
): ArmGuess {
  const edges: { side: 1 | -1; values: { h: number; e: number }[] }[] = [
    { side: 1, values: [] },
    { side: -1, values: [] },
  ];
  for (let y = y0; y <= y1; y++) {
    if (rowL[y] < 0) continue;
    const h = toUy(y);
    edges[0].values.push({ h, e: toUx(rowR[y]) });
    edges[1].values.push({ h, e: -toUx(rowL[y]) });
  }
  let best: ArmGuess | null = null;
  let bestScore = -Infinity;
  for (const { side, values } of edges) {
    const body = values.filter((v) => v.h > 0.1 && v.h < 0.9).map((v) => v.e);
    if (!body.length) continue;
    body.sort((a, b) => a - b);
    const typical = body[Math.floor(body.length * 0.4)];
    let hand = { h: 0.55, e: typical };
    for (const v of values) {
      if (v.h < 0.25 || v.h > 0.85) continue;
      if (v.e > hand.e) hand = v;
    }
    const protrude = hand.e - typical;
    // Rows that stick out at least 40% as far as the hand form the arm band.
    let lo = hand.h,
      hi = hand.h;
    for (const v of values) {
      if (v.e - typical > protrude * 0.4 && Math.abs(v.h - hand.h) < 0.3) {
        if (v.h < lo) lo = v.h;
        if (v.h > hi) hi = v.h;
      }
    }
    const score = protrude + (side === 1 ? 0.01 : 0);
    if (score > bestScore) {
      bestScore = score;
      const pivotE = Math.max(0.05, Math.min(typical, hand.e - 0.12));
      best = {
        side,
        pivotX: side * pivotE,
        pivotY: Math.min(0.85, Math.max(0.3, (lo + hi) / 2 + 0.04)),
        reach: Math.max(0.08, Math.min(0.3, (hand.e - pivotE) * 0.5)),
        halfHeight: Math.max(0.14, Math.min(0.3, (hi - lo) / 2 + 0.08)),
      };
    }
  }
  void unit;
  void anchorX;
  return (
    best ?? { side: 1, pivotX: 0.15, pivotY: 0.6, reach: 0.15, halfHeight: 0.2 }
  );
}

/** Grid mesh over the texture, keeping only cells that touch drawn pixels. */
export function buildMesh(mask: MaskLike, rig: RigInfo, targetCells = 32): Mesh {
  const { width: W, height: H, data } = mask;
  const cell = Math.max(4, Math.max(W, H) / targetCells);
  const cols = Math.max(1, Math.ceil(W / cell));
  const rows = Math.max(1, Math.ceil(H / cell));
  const occupied = new Uint8Array(cols * rows);
  for (let y = 0; y < H; y += 2) {
    const r = Math.min(rows - 1, Math.floor(y / cell));
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 4) occupied[r * cols + Math.min(cols - 1, Math.floor(x / cell))] = 1;
    }
  }
  // Grow by one cell so the feathered edge is never clipped.
  const keep = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let on = 0;
      for (let dr = -1; dr <= 1 && !on; dr++) {
        for (let dc = -1; dc <= 1 && !on; dc++) {
          const rr = r + dr,
            cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && occupied[rr * cols + cc]) on = 1;
        }
      }
      keep[r * cols + c] = on;
    }
  }
  const vcols = cols + 1;
  const vrows = rows + 1;
  const positions = new Float32Array(vcols * vrows * 2);
  const uvs = new Float32Array(vcols * vrows * 2);
  for (let r = 0; r < vrows; r++) {
    for (let c = 0; c < vcols; c++) {
      const tx = Math.min(W, c * cell);
      const ty = Math.min(H, r * cell);
      const k = (r * vcols + c) * 2;
      positions[k] = (tx - rig.anchorX) / rig.unit;
      positions[k + 1] = (rig.anchorY - ty) / rig.unit;
      uvs[k] = tx / W;
      uvs[k + 1] = ty / H;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!keep[r * cols + c]) continue;
      const a = r * vcols + c;
      const b = a + 1;
      const d = a + vcols;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  return { positions, uvs, indices: new Uint16Array(idx) };
}

/** Is texture point (tx, ty) on the drawing? Small tolerance for little fingers. */
export function hitMask(mask: MaskLike, tx: number, ty: number, radius = 6): boolean {
  const { width: W, height: H, data } = mask;
  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      const x = Math.round(tx + dx),
        y = Math.round(ty + dy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (data[(y * W + x) * 4 + 3] > ALPHA_ON) return true;
    }
  }
  return false;
}
