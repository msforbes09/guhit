import { cutoutCore } from "./cutout-core";
import type { CutoutMeta } from "./types";

/**
 * Decode → classical cut-out → PNG encode. Shared by the worker and the
 * main-thread fallback (browsers without OffscreenCanvas in workers).
 */

export interface RunResult {
  png: string;
  width: number;
  height: number;
  /** RGBA mask, every channel = alpha (ImageData layout). */
  mask: Uint8ClampedArray;
  meta: CutoutMeta;
  fullAlpha?: Uint8ClampedArray;
  processedWidth: number;
  processedHeight: number;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function context2d(c: AnyCanvas): AnyContext {
  const ctx = c.getContext("2d", { willReadFrequently: true }) as AnyContext | null;
  if (!ctx) throw new Error("2D canvas is not available");
  return ctx;
}

export async function canvasToPng(c: AnyCanvas): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) =>
    (c as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

/** Decode with EXIF orientation applied and downscale so the long side ≤ maxSide. */
export async function decodeToPixels(blob: Blob, maxSide: number): Promise<Pixels> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = makeCanvas(w, h);
  const ctx = context2d(c);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  const sourceWidth = bmp.width;
  const sourceHeight = bmp.height;
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  return { data: img.data, width: w, height: h, sourceWidth, sourceHeight };
}

/** Straight RGBA → PNG data URL. */
export async function encodeRgba(rgba: Uint8ClampedArray, w: number, h: number): Promise<string> {
  const c = makeCanvas(w, h);
  const ctx = context2d(c);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return blobToDataUrl(await canvasToPng(c));
}

export function alphaToMaskRgba(alpha: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(alpha.length * 4);
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    const a = alpha[i];
    out[j] = a;
    out[j + 1] = a;
    out[j + 2] = a;
    out[j + 3] = a;
  }
  return out;
}

const now = () => performance.now();

export async function runClassical(blob: Blob, maxSide: number, debug: boolean): Promise<RunResult> {
  const t0 = now();
  const px = await decodeToPixels(blob, maxSide);
  const t1 = now();
  const core = cutoutCore(px.data, px.width, px.height, { debug });
  const t2 = now();
  const png = await encodeRgba(core.rgba, core.width, core.height);
  const t3 = now();
  const timings: Record<string, number> = {
    decode: round1(t1 - t0),
    ...core.timings,
    pipeline: round1(t2 - t1),
    encode: round1(t3 - t2),
  };
  delete timings.total;
  return {
    png,
    width: core.width,
    height: core.height,
    mask: alphaToMaskRgba(core.alpha),
    meta: {
      method: "classical",
      quality: core.quality,
      reasons: core.reasons,
      timings,
      source: { width: px.sourceWidth, height: px.sourceHeight },
      processed: { width: px.width, height: px.height },
      crop: core.crop,
      stats: core.stats,
    },
    fullAlpha: debug ? core.fullAlpha : undefined,
    processedWidth: px.width,
    processedHeight: px.height,
  };
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
