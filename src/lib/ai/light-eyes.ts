/**
 * The light eyes (iPhone and iPad): the picture's MobileCLIP embedding is
 * compared with each kid-drawing subject's (light-eyes-labels.json, made by
 * scripts/light-eyes-labels.mjs) and the closest one is named, unless none
 * stands out. No imports, so Node's test runner loads it as is.
 */

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
