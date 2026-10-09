import { env } from "@huggingface/transformers";
import { createModelFetch, type ModelSource } from "@/lib/ai/model-fetch";

let ortBinary: Promise<ArrayBuffer> | null = null;

/**
 * Downloads go through the resilient model fetch (R2 then Hugging Face,
 * retries, resume). Transformers.js reads cached files first, but it also
 * probes the network for optional files a model never had (for example a
 * processor config) and only treats a 404 as "absent"; with no network the
 * probe throws and the load fails. Answering a failure that survived the
 * retries with a 404 lets cached models start with Wi-Fi off; a required file
 * that is really missing still fails clearly.
 */
function offlineTolerantFetch(source: ModelSource) {
  const modelFetch = createModelFetch({ source });
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    try {
      return await modelFetch(input, init);
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      return new Response(null, { status: 404, statusText: "No network" });
    }
  };
}

/**
 * ONNX Runtime's wasm (25.6 MiB) ships gzipped from our own origin, because
 * Cloudflare Pages rejects files over 25 MiB; it is inflated here with the
 * browser's built-in DecompressionStream. Nothing comes from a CDN, and the
 * service worker keeps the .gz for offline use.
 */
function loadOrtBinary(ortBase: string): Promise<ArrayBuffer> {
  if (!ortBinary) {
    ortBinary = (async () => {
      const response = await fetch(`${ortBase}ort-wasm-simd-threaded.asyncify.wasm.gz`);
      if (!response.ok || !response.body) throw new Error(`ONNX Runtime download failed (${response.status}).`);
      return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    })();
    ortBinary.catch(() => (ortBinary = null));
  }
  return ortBinary;
}

/**
 * Points Transformers.js at our own copy of ONNX Runtime, and at a model
 * mirror with Hugging Face's layout when one is given.
 */
export async function configureTransformers(modelHost: string | null, source: ModelSource) {
  const ortBase = new URL("/ort/", self.location.origin).href;
  env.allowLocalModels = false;
  env.fetch = offlineTolerantFetch(source);
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.wasmBinary = await loadOrtBinary(ortBase);
    // Only the JS glue is fetched by URL; the binary above is used as is.
    env.backends.onnx.wasm.wasmPaths = { mjs: `${ortBase}ort-wasm-simd-threaded.asyncify.mjs` };
  }
  if (modelHost) env.remoteHost = `${modelHost}/`;
}

export interface FileProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}
