/**
 * The AI cut-out's model and where its files live on the device. Apart from
 * ai-segment.ts so a screen can ask whether the model is here without loading
 * the model code.
 */
export const AI_MODEL = {
  id: "xrds/isnet-general-onnx-int8",
  // Pinned: a community repack, so a later push cannot change what we ship.
  revision: "71eff2372ec9c8edbc6ca637ded591423d23b65a",
  licence: "MIT (ONNX repack of imgly/isnet-general-onnx, MIT); IS-Net code by xuebinqin/DIS, Apache-2.0",
};

/**
 * Every file URL, and so every cache key, at the pinned revision. Transformers.js
 * lists a pipeline's files at "main" whatever `revision` says, so without this a
 * device holding only the pinned files failed offline on main's config.json.
 */
export const AI_PATH_TEMPLATE = `{model}/resolve/${AI_MODEL.revision}/`;

/** What the background-removal pipeline reads; storeCutoutModel (src/lib/ai/model-files.ts) saves the same files. */
const AI_FILES = ["config.json", "preprocessor_config.json", "onnx/model_quantized.onnx"];

/** The AI cut-out's files missing from Transformers.js's cache (none: it runs with no network). */
export async function aiCutoutMissing(): Promise<string[]> {
  if (typeof caches === "undefined") return ["Cache Storage (not available)"];
  try {
    const cache = await caches.open("transformers-cache");
    const base = `https://huggingface.co/${AI_MODEL.id}/resolve/${AI_MODEL.revision}/`;
    const missing: string[] = [];
    for (const file of AI_FILES) if (!(await cache.match(base + file))) missing.push(file);
    return missing;
  } catch {
    // Storage blocked (private mode): treated as not on the device.
    return ["Cache Storage (blocked)"];
  }
}

/** True when all of the AI cut-out's files are in Transformers.js's cache, so it runs with no network. */
export async function isAiCutoutCached(): Promise<boolean> {
  return (await aiCutoutMissing()).length === 0;
}
