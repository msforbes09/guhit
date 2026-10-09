import { cutoutFromMask } from "./cutout-core";
import { alphaToMaskRgba, decodeToPixels, encodeRgba, round1, type RunResult } from "./cutout-run";

/**
 * On-device AI cut-out, used only inside the worker and only when asked
 * ("Try AI cut-out"), because the model is a 44 MB download on first use.
 * Model and runtime files land in the browser's Cache Storage
 * ("transformers-cache"), so after one online run it works with the network off.
 */
export const AI_MODEL = {
  id: "xrds/isnet-general-onnx-int8",
  // Pinned: a community repack, so a later push cannot change what we ship.
  revision: "71eff2372ec9c8edbc6ca637ded591423d23b65a",
  licence: "MIT (ONNX repack of imgly/isnet-general-onnx, MIT); IS-Net code by xuebinqin/DIS, Apache-2.0",
};

type Transformers = typeof import("@huggingface/transformers");
type Pipe = (image: unknown) => Promise<unknown>;

interface Segmenter {
  tf: Transformers;
  pipe: Pipe;
  device: "webgpu" | "wasm";
}

let loading: Promise<Segmenter> | null = null;

interface ProgressInfo {
  status?: string;
  file?: string;
  progress?: number;
}

export function loadSegmenter(onProgress?: (text: string) => void): Promise<Segmenter> {
  if (!loading) {
    loading = (async () => {
      const tf = await import("@huggingface/transformers");
      tf.env.allowLocalModels = false;
      // Same ONNX Runtime copy as speech recognition (/public/ort, cached by the
      // service worker), so the device stores it once and never asks a CDN.
      const ortBase = new URL("/ort/", self.location.origin).href;
      tf.env.backends.onnx.wasm!.wasmPaths = {
        wasm: `${ortBase}ort-wasm-simd-threaded.asyncify.wasm`,
        mjs: `${ortBase}ort-wasm-simd-threaded.asyncify.mjs`,
      };
      const progress_callback = (p: ProgressInfo) => {
        if (p.status === "progress" && p.file?.endsWith(".onnx")) {
          onProgress?.(`Downloading the AI model… ${Math.round(p.progress ?? 0)}%`);
        } else if (p.status === "ready") {
          onProgress?.("AI model ready");
        }
      };
      const base = { revision: AI_MODEL.revision, dtype: "q8" as const, progress_callback };
      const nav = (globalThis as { navigator?: Navigator & { gpu?: { requestAdapter(): Promise<unknown> } } }).navigator;
      // Some browsers never settle requestAdapter(); give up after 3 s and use wasm.
      const adapter = nav?.gpu
        ? await Promise.race([
            nav.gpu.requestAdapter().catch(() => null),
            new Promise<null>((r) => setTimeout(() => r(null), 3000)),
          ])
        : null;
      if (adapter) {
        try {
          const pipe = await tf.pipeline("background-removal", AI_MODEL.id, { ...base, device: "webgpu" });
          return { tf, pipe: pipe as unknown as Pipe, device: "webgpu" as const };
        } catch (err) {
          console.warn("[alive] WebGPU model failed, using wasm", err);
        }
      }
      const pipe = await tf.pipeline("background-removal", AI_MODEL.id, { ...base, device: "wasm" });
      return { tf, pipe: pipe as unknown as Pipe, device: "wasm" as const };
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

interface RawImageLike {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

export async function runAi(
  blob: Blob,
  maxSide: number,
  debug: boolean,
  onProgress?: (text: string) => void,
  editable = false,
): Promise<RunResult> {
  const t0 = performance.now();
  const seg = await loadSegmenter(onProgress);
  const t1 = performance.now();
  const px = await decodeToPixels(blob, maxSide);
  const t2 = performance.now();
  onProgress?.("Cutting out with AI…");
  const image = new seg.tf.RawImage(new Uint8ClampedArray(px.data), px.width, px.height, 4);
  const out = (await seg.pipe(image)) as RawImageLike;
  const t3 = performance.now();

  // The pipeline returns the image with the model's mask as alpha.
  const alpha = new Uint8Array(px.width * px.height);
  const sx = out.width / px.width;
  const sy = out.height / px.height;
  for (let y = 0; y < px.height; y++) {
    const oy = Math.min(out.height - 1, Math.floor(y * sy));
    for (let x = 0; x < px.width; x++) {
      const ox = Math.min(out.width - 1, Math.floor(x * sx));
      alpha[y * px.width + x] = out.data[(oy * out.width + ox) * out.channels + (out.channels - 1)];
    }
  }
  const core = cutoutFromMask(px.data, px.width, px.height, alpha, { debug, editable });
  const t4 = performance.now();
  const png = await encodeRgba(core.rgba, core.width, core.height);
  const t5 = performance.now();
  const timings: Record<string, number> = {
    modelLoad: round1(t1 - t0),
    decode: round1(t2 - t1),
    inference: round1(t3 - t2),
    ...core.timings,
    finish: round1(t4 - t3),
    encode: round1(t5 - t4),
  };
  delete timings.total;
  return {
    png,
    width: core.width,
    height: core.height,
    mask: alphaToMaskRgba(core.alpha),
    meta: {
      method: "ai",
      quality: core.quality,
      reasons: core.reasons,
      timings,
      source: { width: px.sourceWidth, height: px.sourceHeight },
      processed: { width: px.width, height: px.height },
      crop: core.crop,
      stats: { ...core.stats, webgpu: seg.device === "webgpu" ? 1 : 0 },
    },
    fullAlpha: debug ? core.fullAlpha : undefined,
    processedWidth: px.width,
    processedHeight: px.height,
    edit: core.edit,
  };
}
