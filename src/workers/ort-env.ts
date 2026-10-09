import { env } from "@huggingface/transformers";

let ortBinary: Promise<ArrayBuffer> | null = null;

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
export async function configureTransformers(modelHost: string | null) {
  const ortBase = new URL("/ort/", self.location.origin).href;
  env.allowLocalModels = false;
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
