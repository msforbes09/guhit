// Copies ONNX Runtime's wasm build into public/ort so speech recognition loads
// it from our own origin (and the service worker can cache it) instead of a CDN.
// The files are ~27 MB, so they are generated at build time, not committed.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
// Prefer the copy Transformers.js itself resolves, in case npm nests a different version.
const candidates = [
  join(root, "node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist"),
  join(root, "node_modules/onnxruntime-web/dist"),
];
const ortDist = candidates.find((dir) => existsSync(dir));
if (!ortDist) throw new Error("onnxruntime-web is not installed; run npm install first.");

const target = join(root, "public", "ort");
mkdirSync(target, { recursive: true });
for (const file of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
  copyFileSync(join(ortDist, file), join(target, file));
}
console.log(`ONNX Runtime wasm copied from ${ortDist}`);
