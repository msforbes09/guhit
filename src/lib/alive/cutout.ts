import { alphaToMaskRgba, context2d, decodeToPixels, round1, runClassical, type RunResult } from "./cutout-run";
import type { WorkerRequest, WorkerResponse } from "./segment.worker";
import type { Cutout, CutoutOptions, CutoutWithDebug } from "./types";

/**
 * Cut the character out of a photo of a drawing (or an on-screen drawing).
 * Runs entirely on the device: a classical pipeline in a Web Worker, with
 * a main-thread fallback for browsers that lack OffscreenCanvas in workers.
 */
export async function cutout(image: Blob | string, options: CutoutOptions = {}): Promise<CutoutWithDebug> {
  const t0 = performance.now();
  const blob = typeof image === "string" ? await (await fetch(image)).blob() : image;
  const maxSide = options.maxSide ?? 1024;
  const debug = options.debug ?? false;
  const method = options.method ?? "classical";

  let run: RunResult;
  const worker = getWorker();
  if (worker) {
    run = await callWorker(worker, { type: "cutout", blob, maxSide, method, debug }, options.onProgress);
  } else {
    run = await runClassical(blob, maxSide, debug);
  }
  run.meta.timings.total = round1(performance.now() - t0);
  return toCutout(run);
}

/** On-screen drawing: same pipeline, the canvas is read as a PNG. */
export async function cutoutFromCanvas(canvas: HTMLCanvasElement, options?: CutoutOptions): Promise<CutoutWithDebug> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas export failed"))), "image/png"),
  );
  return cutout(blob, options);
}

/**
 * Rebuild a Cutout from a stored transparent PNG (e.g. Character.cutout),
 * so a saved character can come alive without running the pipeline again.
 */
export async function loadCutout(png: string): Promise<Cutout> {
  const blob = await (await fetch(png)).blob();
  const px = await decodeToPixels(blob, 4096);
  const alpha = new Uint8ClampedArray(px.width * px.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px.data[i * 4 + 3];
  return {
    png,
    width: px.width,
    height: px.height,
    mask: new ImageData(alphaToMaskRgba(alpha), px.width, px.height),
  };
}

function toCutout(run: RunResult): CutoutWithDebug {
  const out: CutoutWithDebug = {
    png: run.png,
    width: run.width,
    height: run.height,
    mask: new ImageData(new Uint8ClampedArray(run.mask), run.width, run.height),
    meta: run.meta,
  };
  if (run.fullAlpha) {
    out.debug = { fullAlpha: run.fullAlpha, width: run.processedWidth, height: run.processedHeight };
  }
  return out;
}

/* ------------------------------------------------------------------ */

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (r: RunResult) => void; reject: (e: Error) => void; onProgress?: (t: string) => void }
>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    worker = null;
    return worker;
  }
  try {
    worker = new Worker(new URL("./segment.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") {
        p.onProgress?.(msg.text);
        return;
      }
      pending.delete(msg.id);
      if (msg.type === "result") p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    };
    worker.onerror = (e) => {
      // A worker that fails to boot (old browser, blocked module workers)
      // must not strand callers: fail them and fall back to the main thread.
      for (const [, p] of pending) p.reject(new Error(e.message || "cut-out worker failed"));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function callWorker(
  w: Worker,
  req: Omit<WorkerRequest, "id">,
  onProgress?: (t: string) => void,
): Promise<RunResult> {
  const id = nextId++;
  return new Promise<RunResult>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ ...req, id } satisfies WorkerRequest);
  }).catch(async (err) => {
    if (req.method === "classical") return runClassical(req.blob, req.maxSide, req.debug);
    throw err;
  });
}

/** Draw a mask (ImageData) as white-on-black for previews. */
export function maskToCanvas(alpha: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = context2d(out);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < alpha.length; i++) {
    img.data[i * 4] = alpha[i];
    img.data[i * 4 + 1] = alpha[i];
    img.data[i * 4 + 2] = alpha[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
