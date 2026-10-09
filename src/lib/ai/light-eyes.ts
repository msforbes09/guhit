/**
 * The light eyes (iPhone and iPad): the picture's MobileCLIP embedding is
 * compared with each kid-drawing subject's (light-eyes-labels.json, made by
 * scripts/light-eyes-labels.mjs) and the closest one is named, unless none
 * stands out. No imports, so Node's test runner loads it as is.
 */

/** MobileCLIP S0 sees 256×256. */
export const LIGHT_INPUT = 256;
/** As in vision.worker.ts: paper kept around a photo's crop, white margin around a cut-out. */
const PHOTO_MARGIN = 0.3;
const MARGIN = 0.12;

export interface Frame {
  /** The part of the picture the eyes see. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Where it goes on the white LIGHT_INPUT square. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * The same framing the vision worker gives the light eyes, straight at their
 * size: a photo's crop with some paper around it, or a whole cut-out with a
 * margin, centred on a white square.
 */
export function lightEyesFrame(size: { width: number; height: number }, crop?: { x: number; y: number; w: number; h: number }): Frame {
  let [sx, sy, sw, sh] = [0, 0, size.width, size.height];
  let longest = LIGHT_INPUT / (1 + 2 * MARGIN);
  if (crop) {
    const pad = Math.round(Math.max(crop.w, crop.h) * PHOTO_MARGIN);
    sx = Math.max(0, crop.x - pad);
    sy = Math.max(0, crop.y - pad);
    sw = Math.min(size.width, crop.x + crop.w + pad) - sx;
    sh = Math.min(size.height, crop.y + crop.h + pad) - sy;
    longest = LIGHT_INPUT;
  }
  const scale = longest / Math.max(sw, sh);
  const [dw, dh] = [Math.round(sw * scale), Math.round(sh * scale)];
  return { sx, sy, sw, sh, dx: Math.round((LIGHT_INPUT - dw) / 2), dy: Math.round((LIGHT_INPUT - dh) / 2), dw, dh };
}

/**
 * iPhone and iPad: the picture the light eyes will see, made on the page
 * before their worker starts (a PNG data URL, LIGHT_INPUT square), so the
 * worker never decodes the whole photo while the model is loading. Steps down
 * by halves, so thin crayon lines survive the way down. Every canvas is
 * emptied afterwards, since Safari holds a canvas's memory until then.
 */
export async function lightEyesPicture(image: string, crop?: { x: number; y: number; w: number; h: number }): Promise<string> {
  const img = new Image();
  img.src = image;
  await img.decode();
  const f = lightEyesFrame({ width: img.naturalWidth, height: img.naturalHeight }, crop);
  const canvases: HTMLCanvasElement[] = [];
  const canvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    canvases.push(c);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw pictures.");
    ctx.imageSmoothingQuality = "high";
    return { c, ctx };
  };
  try {
    let source: CanvasImageSource = img;
    let [sx, sy, sw, sh] = [f.sx, f.sy, f.sw, f.sh];
    while (sw / 2 >= f.dw && sh / 2 >= f.dh && f.dw > 0 && f.dh > 0) {
      const half = canvas(Math.round(sw / 2), Math.round(sh / 2));
      half.ctx.drawImage(source, sx, sy, sw, sh, 0, 0, half.c.width, half.c.height);
      [source, sx, sy, sw, sh] = [half.c, 0, 0, half.c.width, half.c.height];
    }
    const out = canvas(LIGHT_INPUT, LIGHT_INPUT);
    out.ctx.fillStyle = "#ffffff";
    out.ctx.fillRect(0, 0, LIGHT_INPUT, LIGHT_INPUT);
    out.ctx.drawImage(source, sx, sy, sw, sh, f.dx, f.dy, f.dw, f.dh);
    return out.c.toDataURL("image/png");
  } finally {
    for (const c of canvases) c.width = c.height = 0;
    img.src = "";
  }
}

export interface StoredLabel {
  label: string;
  /** One 8-bit step's value. */
  scale: number;
  /** The normalised text embedding as base64 Int8Array. */
  vector: string;
}

export interface Label {
  label: string;
  vector: Float32Array;
}

export interface Pick {
  /** Empty when no subject stands out (the screen then asks the child). */
  label: string;
  /** The three likeliest subjects with their share, for the grown-up log. */
  top: [string, number][];
}

/** CLIP's own sharpening of similarities before the softmax. */
const LOGIT_SCALE = 100;
/** Below this share the top subject is a coin toss among several: no guess. */
const MIN_SHARE = 0.2;
/** Nor when the runner-up is about as likely. */
const MIN_LEAD = 1.2;

function base64Bytes(text: string): Int8Array {
  const binary = atob(text);
  const bytes = new Int8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = (binary.charCodeAt(i) << 24) >> 24;
  return bytes;
}

export function decodeLabels(data: { labels: StoredLabel[] }): Label[] {
  return data.labels.map(({ label, scale, vector }) => ({
    label,
    vector: Float32Array.from(base64Bytes(vector), (x) => x * scale),
  }));
}

export function pickLabel(embedding: ArrayLike<number>, labels: Label[]): Pick {
  let length = 0;
  for (let i = 0; i < embedding.length; i++) length += embedding[i] ** 2;
  length = Math.sqrt(length) || 1;
  const logits = labels.map(({ vector }) => {
    let dot = 0;
    for (let i = 0; i < vector.length; i++) dot += vector[i] * embedding[i];
    return (LOGIT_SCALE * dot) / length;
  });
  const max = Math.max(...logits);
  const weights = logits.map((x) => Math.exp(x - max));
  const sum = weights.reduce((a, b) => a + b, 0);
  const ranked = labels
    .map(({ label }, i): [string, number] => [label, weights[i] / sum])
    .sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 3);
  const [first, second] = top;
  const standsOut = first && first[1] >= MIN_SHARE && first[1] >= (second?.[1] ?? 0) * MIN_LEAD;
  return { label: standsOut ? first[0] : "", top };
}
