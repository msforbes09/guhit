import { finishFromEdit } from "./cutout-core";
import { settleWithin } from "./cutout-note";
import { alphaToMaskRgba, context2d, decodeToPixels, encodeRgba, round1, runClassical, type RunResult } from "./cutout-run";
import type { WorkerRequest, WorkerResponse } from "./segment.worker";
import type { Cutout, CutoutEdit, CutoutMeta, CutoutOptions, CutoutWithDebug } from "./types";

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
  const editable = options.editable ?? false;

  let run: RunResult;
  const worker = getWorker();
  if (worker) {
    run = (await callWorker(worker, { type: "cutout", blob, maxSide, method, debug, editable }, options.onProgress))!;
  } else if (method === "ai") {
    throw new Error("AI cut-out needs Web Worker and OffscreenCanvas support");
  } else {
    run = await runClassical(blob, maxSide, debug, editable);
  }
  run.meta.timings.total = round1(performance.now() - t0);
  return toCutout(run);
}

/**
 * Download and warm up the AI cut-out model while online (e.g. on the setup
 * screen) so "Try AI cut-out" also works later with the network off.
 */
export async function preloadAiCutout(onProgress?: (text: string) => void): Promise<void> {
  const worker = getWorker();
  if (!worker) throw new Error("AI cut-out needs Web Worker and OffscreenCanvas support");
  await callWorker(worker, { type: "preload" }, onProgress);
}

/** Turn a touched-up mask back into a cut-out (same soft edge and crop). */
export async function applyTouchUp(edit: CutoutEdit, mask: Uint8Array, base?: CutoutMeta): Promise<Cutout> {
  const core = finishFromEdit({ ...edit, mask });
  const png = await encodeRgba(core.rgba, core.width, core.height);
  return {
    png,
    width: core.width,
    height: core.height,
    mask: new ImageData(alphaToMaskRgba(core.alpha), core.width, core.height),
    meta: base ? { ...base, crop: core.crop, reasons: core.reasons, quality: core.quality } : undefined,
    edit: { ...edit, mask },
  };
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
    edit: run.edit,
  };
  if (run.fullAlpha) {
    out.debug = { fullAlpha: run.fullAlpha, width: run.processedWidth, height: run.processedHeight };
  }
  return out;
}

/* ------------------------------------------------------------------ */

let worker: Worker | null | undefined;
let nextId = 1;
type WorkerJob = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

const pending = new Map<
  number,
  { resolve: (r: RunResult | null) => void; reject: (e: Error) => void; onProgress?: (t: string) => void }
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
      console.warn("[alive] cut-out worker failed:", e.message || e);
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

/** iPhone: frees the cut-out worker's memory before a guess; the next cut-out starts a new one. */
export function releaseCutoutWorker() {
  if (!worker) return;
  for (const [, p] of pending) p.reject(new Error("cut-out worker released"));
  pending.clear();
  worker.terminate();
  worker = undefined;
}

/** A worker that never answers (busy, or a script it could not load) must not keep the child waiting. */
const CLASSICAL_PATIENCE_MS = 8000;

async function callWorker(w: Worker, req: WorkerJob, onProgress?: (t: string) => void): Promise<RunResult | null> {
  const id = nextId++;
  const answer = new Promise<RunResult | null>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ ...req, id } as WorkerRequest);
  }).catch(async (err) => {
    // The classical pipeline can always run on the main thread instead.
    if (req.type === "cutout" && req.method === "classical") {
      return runClassical(req.blob, req.maxSide, req.debug, req.editable);
    }
    throw err;
  });
  if (req.type !== "cutout" || req.method !== "classical") return answer;
  if ((await settleWithin(answer, CLASSICAL_PATIENCE_MS)).state !== "late") return answer;
  // The same classical cut-out on the main thread instead; a late reply is dropped.
  pending.delete(id);
  console.warn(`[alive] cut-out worker gave no answer in ${CLASSICAL_PATIENCE_MS / 1000} s; cutting out on the main thread`);
  return runClassical(req.blob, req.maxSide, req.debug, req.editable);
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
