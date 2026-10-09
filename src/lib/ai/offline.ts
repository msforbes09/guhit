import { findVision, STT_DTYPES, type STTDevice } from "./models";

/** Set once every model is on the device; kid screens only auto-load when it is present. */
export const READY_FLAG = "guhit:ready";

export function markReady(ready: boolean) {
  try {
    if (ready) localStorage.setItem(READY_FLAG, "1");
    else localStorage.removeItem(READY_FLAG);
  } catch {
    // Private mode or blocked storage: the flag is a convenience only.
  }
}

export function isMarkedReady(): boolean {
  try {
    return localStorage.getItem(READY_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Asks the browser not to evict the ~1 GB of models when the disk gets full. */
export async function requestPersistence(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export interface PrecacheResult {
  ok: boolean;
  pages?: number;
  assets?: number;
  failed?: number;
  error?: string;
}

/**
 * Asks the service worker to store every page and static file now. Returns
 * null when no worker is running (development builds, or unsupported browsers).
 */
export async function precacheApp(timeoutMs = 120_000): Promise<PrecacheResult | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(resolve, 10_000, null)),
  ]);
  const worker = ready?.active;
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve({ ok: false, error: "timed out" }), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<PrecacheResult>) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    worker.postMessage({ type: "precache" }, [channel.port2]);
  });
}

export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

export async function isLLMCached(modelId: string, modelHost: string | null): Promise<boolean> {
  try {
    const [{ hasModelInCache }, { appConfigFor }] = await Promise.all([import("@mlc-ai/web-llm"), import("./llm")]);
    return await hasModelInCache(modelId, appConfigFor(modelId, modelHost));
  } catch {
    return false;
  }
}

/** Transformers.js keeps downloaded model files in this Cache Storage bucket. */
const TRANSFORMERS_CACHE = "transformers-cache";

const onnxFile = (part: string, dtype: string) => {
  const suffix: Record<string, string> = { fp32: "", fp16: "_fp16", q8: "_quantized", q4: "_q4", int8: "_int8" };
  return `onnx/${part}${suffix[dtype] ?? `_${dtype}`}.onnx`;
};

/** True when every ONNX file of the given precisions is already in Transformers.js's cache. */
export async function isTransformersModelCached(modelId: string, dtype: Record<string, string>): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE);
    const keys = (await cache.keys()).map((r) => r.url);
    return Object.entries(dtype).every(([part, precision]) =>
      keys.some((url) => url.includes(modelId) && url.endsWith(onnxFile(part, precision))),
    );
  } catch {
    return false;
  }
}

export const isSTTCached = (modelId: string, device: STTDevice) =>
  isTransformersModelCached(modelId, STT_DTYPES[device]);

export const isVisionCached = (modelId: string) =>
  isTransformersModelCached(modelId, findVision(modelId)?.dtype ?? {});
