// Puts ONNX Runtime's wasm build into public/ort so speech and drawing
// recognition load it from our own origin (and the service worker can cache
// it) instead of a CDN. The wasm is 25.6 MiB, over Cloudflare Pages' 25 MiB
// per-file limit, so it ships gzipped (6.6 MB) and the workers inflate it in
// the browser (src/workers/ort-env.ts). Generated at build time, not committed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { constants, gzipSync } from "node:zlib";

const root = process.cwd();
// Prefer the copy Transformers.js itself resolves, in case npm nests a different version.
const candidates = [
  join(root, "node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist"),
  join(root, "node_modules/onnxruntime-web/dist"),
];
const ortDist = candidates.find((dir) => existsSync(dir));
if (!ortDist) throw new Error("onnxruntime-web is not installed; run npm install first.");

const target = join(root, "public", "ort");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
copyFileSync(join(ortDist, "ort-wasm-simd-threaded.asyncify.mjs"), join(target, "ort-wasm-simd-threaded.asyncify.mjs"));
const wasm = readFileSync(join(ortDist, "ort-wasm-simd-threaded.asyncify.wasm"));
const gz = gzipSync(wasm, { level: constants.Z_BEST_COMPRESSION });
writeFileSync(join(target, "ort-wasm-simd-threaded.asyncify.wasm.gz"), gz);
console.log(`ONNX Runtime copied from ${ortDist} (wasm ${(wasm.length / 1e6).toFixed(1)} MB → ${(gz.length / 1e6).toFixed(1)} MB gzipped)`);
