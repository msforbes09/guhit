import { loadImage } from "@/lib/story/image";

export interface Cutout {
  /** PNG data URL with a transparent background. */
  png: string;
  width: number;
  height: number;
  mask?: ImageData;
}

const MAX_SIDE = 720;
const CELL = 24;

/**
 * Stand-in for the alive engine's cutout(): lifts the drawing off the paper
 * with plain pixel maths so the screens work before that engine lands.
 *
 * 1. Estimate the paper's brightness per region, so shadows and uneven
 *    light still read as paper.
 * 2. The sheet is the largest connected patch of bright, colourless pixels.
 * 3. Anything outside the sheet that touches the photo's edge (a table) is
 *    background too; everything enclosed by the sheet is the drawing.
 * 4. Specks of paper grain are dropped, and the result is cropped.
 */
export async function placeholderCutout(image: Blob | string): Promise<Cutout> {
  const img = await loadImage(image);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot draw pictures.");
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  const d = pixels.data;
  const n = w * h;

  const lum = new Float32Array(n);
  const chroma = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }

  // Bright reference per cell: the 85th-percentile luminance is the paper even
  // where the cell is half covered in crayon.
  const cw = Math.ceil(w / CELL);
  const ch = Math.ceil(h / CELL);
  const cellBg = new Float32Array(cw * ch);
  const hist = new Uint32Array(256);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      hist.fill(0);
      let count = 0;
      for (let y = cy * CELL; y < Math.min(h, (cy + 1) * CELL); y++) {
        for (let x = cx * CELL; x < Math.min(w, (cx + 1) * CELL); x++) {
          hist[lum[y * w + x] | 0]++;
          count++;
        }
      }
      let seen = 0;
      let v = 255;
      for (; v > 0; v--) {
        seen += hist[v];
        if (seen >= count * 0.15) break;
      }
      cellBg[cy * cw + cx] = v;
    }
  }
  const bgAt = (x: number, y: number) => {
    const fx = Math.min(cw - 1, Math.max(0, x / CELL - 0.5));
    const fy = Math.min(ch - 1, Math.max(0, y / CELL - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(cw - 1, x0 + 1);
    const y1 = Math.min(ch - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = cellBg[y0 * cw + x0] * (1 - tx) + cellBg[y0 * cw + x1] * tx;
    const bottom = cellBg[y1 * cw + x0] * (1 - tx) + cellBg[y1 * cw + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };

  const paperLike = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      paperLike[i] = lum[i] > 110 && lum[i] >= bgAt(x, y) * 0.86 && chroma[i] < 42 ? 1 : 0;
    }
  }

  // Largest connected paper patch = the sheet.
  const label = new Int32Array(n);
  const queue = new Int32Array(n);
  let sheetLabel = 0;
  let sheetSize = 0;
  let next = 1;
  for (let start = 0; start < n; start++) {
    if (!paperLike[start] || label[start]) continue;
    const size = fill(start, next, (j) => paperLike[j] === 1 && label[j] === 0);
    if (size > sheetSize) {
      sheetSize = size;
      sheetLabel = next;
    }
    next++;
  }

  // Background: the sheet, plus whatever lies outside it and touches the photo edge.
  const background = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] === sheetLabel) background[i] = 1;
  const outsideLabel = -1;
  const isOutside = (j: number) => background[j] === 0 && label[j] !== outsideLabel;
  for (let x = 0; x < w; x++) {
    for (const i of [x, (h - 1) * w + x]) if (isOutside(i)) fill(i, outsideLabel, isOutside);
  }
  for (let y = 0; y < h; y++) {
    for (const i of [y * w, y * w + w - 1]) if (isOutside(i)) fill(i, outsideLabel, isOutside);
  }
  for (let i = 0; i < n; i++) if (label[i] === outsideLabel) background[i] = 1;

  // Keep drawing pieces that matter; drop grain specks.
  const piece = new Int32Array(n);
  const sizes: number[] = [0];
  for (let i = 0; i < n; i++) {
    if (background[i] || piece[i]) continue;
    const id = sizes.length;
    let size = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    piece[i] = id;
    while (head < tail) {
      const j = queue[head++];
      size++;
      const x = j % w;
      const y = (j / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (!background[k] && !piece[k]) {
            piece[k] = id;
            queue[tail++] = k;
          }
        }
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  const keep = sizes.map((s) => s >= Math.max(40, largest * 0.02));

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let kept = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (piece[i] && keep[piece[i]]) {
        kept++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        d[i * 4 + 3] = 0;
      }
    }
  }

  // Nothing recognisable: show the whole photo rather than an empty stage.
  if (kept < n * 0.01) {
    ctx.drawImage(img, 0, 0, w, h);
    return { png: canvas.toDataURL("image/png"), width: w, height: h };
  }

  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  ctx.putImageData(pixels, 0, 0);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("This browser cannot draw pictures.");
  octx.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return {
    png: out.toDataURL("image/png"),
    width: out.width,
    height: out.height,
    mask: octx.getImageData(0, 0, out.width, out.height),
  };

  function fill(start: number, id: number, open: (j: number) => boolean) {
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const j = queue[head++];
      const x = j % w;
      for (const k of [j - w, j - 1, j + 1, j + w]) {
        if (k < 0 || k >= n) continue;
        const kx = k % w;
        if (Math.abs(kx - x) > 1) continue;
        if (!open(k)) continue;
        label[k] = id;
        queue[tail++] = k;
      }
    }
    return tail;
  }
}
