import type { PixelRect } from "./types";

/** The parts of the alive cut-out's metadata needed to find the cut-out in the original photo. */
export interface CutoutPlacement {
  source: { width: number; height: number };
  processed: { width: number; height: number };
  crop: PixelRect;
}

/**
 * The cut-out's bounding box in the original photo's pixels. The cut-out
 * pipeline works on a scaled-down copy, so its crop is scaled back up.
 */
export function photoCropFromCutout(meta: CutoutPlacement): PixelRect {
  const sx = meta.source.width / meta.processed.width;
  const sy = meta.source.height / meta.processed.height;
  return {
    x: Math.round(meta.crop.x * sx),
    y: Math.round(meta.crop.y * sy),
    w: Math.round(meta.crop.w * sx),
    h: Math.round(meta.crop.h * sy),
  };
}
