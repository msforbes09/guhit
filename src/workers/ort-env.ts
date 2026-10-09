import { env } from "@huggingface/transformers";

/**
 * ONNX Runtime's wasm is served from our own origin (copied into /public/ort at
 * build time) so on-device models never reach a CDN once the app is cached.
 * A model mirror with Hugging Face's layout can replace the hub.
 */
export function configureTransformers(modelHost: string | null) {
  const ortBase = new URL("/ort/", self.location.origin).href;
  env.allowLocalModels = false;
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.wasmPaths = {
      mjs: `${ortBase}ort-wasm-simd-threaded.asyncify.mjs`,
      wasm: `${ortBase}ort-wasm-simd-threaded.asyncify.wasm`,
    };
  }
  if (modelHost) env.remoteHost = `${modelHost}/`;
}

export interface FileProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}
