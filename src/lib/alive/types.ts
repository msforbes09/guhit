export type AliveMotion = "idle" | "bounce" | "walk" | "jump" | "dance" | "sleep" | "wave";

export const ALIVE_MOTIONS: AliveMotion[] = ["idle", "bounce", "walk", "jump", "dance", "sleep", "wave"];

export type CutoutMethod = "classical" | "ai" | "png";

export interface CutoutMeta {
  method: CutoutMethod;
  /** "poor" means the app should offer the AI cut-out or a retake. */
  quality: "good" | "poor";
  reasons: string[];
  /** Measured milliseconds per stage, plus `total` (wall clock for the whole call). */
  timings: Record<string, number>;
  /** Size of the image as given. */
  source: { width: number; height: number };
  /** Size the pipeline worked at (long side capped). */
  processed: { width: number; height: number };
  /** Where the cut-out sits in the processed image. */
  crop: { x: number; y: number; w: number; h: number };
  stats?: Record<string, number>;
}

/** Full processed frame kept for the touch-up brush. */
export interface CutoutEdit {
  /** Paper-corrected frame, opaque RGBA. */
  image: Uint8ClampedArray;
  /** Hard mask, 1 = part of the character. */
  mask: Uint8Array;
  width: number;
  height: number;
}

export interface Cutout {
  /** PNG data URL: transparent background, cropped to the character with small padding. */
  png: string;
  width: number;
  height: number;
  /** Alpha of the cut-out as ImageData: every channel of a pixel holds that pixel's alpha. */
  mask: ImageData;
  meta?: CutoutMeta;
  /** Present when cut out with `{ editable: true }`; feed it to <CutoutTouchUp>. */
  edit?: CutoutEdit;
}

export interface CutoutOptions {
  /** Long side the pipeline works at; larger is sharper and slower. Default 1024. */
  maxSide?: number;
  /** "ai" uses the on-device segmentation model (downloads it on first use). */
  method?: "classical" | "ai";
  /** Also return the full-frame mask, for the lab page. */
  debug?: boolean;
  /** Keep the full frame so the result can be touched up with a brush. */
  editable?: boolean;
  onProgress?: (text: string) => void;
}

export interface CutoutDebug {
  /** Full processed-frame alpha (one byte per pixel). */
  fullAlpha: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CutoutWithDebug extends Cutout {
  debug?: CutoutDebug;
}
