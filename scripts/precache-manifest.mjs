// Runs after `next build` (static export into out/):
// 1. drops the second ONNX Runtime wasm (25.6 MiB) that bundling emits as
//    media; the workers load ORT from /ort instead (see scripts/copy-ort.mjs);
// 2. lists every file in /_next/static so the service worker can store all of
//    them, including chunks that load lazily (the AI engine and its workers),
//    which never appear in a page's HTML;
// 3. fails the build if any file is over Cloudflare Pages' 25 MiB limit.
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const out = join(process.cwd(), "out");
const staticDir = join(out, "_next", "static");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const path of walk(join(staticDir, "media"))) {
  // Raw worker sources are emitted next to their compiled chunks and never loaded.
  if (/ort-wasm-simd-threaded.*\.wasm$/.test(path) || path.endsWith(".ts")) rmSync(path);
}

const assets = walk(staticDir)
  .filter((path) => !path.endsWith(".map"))
  .map((path) => `/_next/static/${relative(staticDir, path).split(sep).join("/")}`)
  .sort();

const buildId = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
writeFileSync(join(out, "precache-manifest.json"), JSON.stringify({ buildId, assets }, null, 1));
console.log(`Precache manifest: ${assets.length} static files for build ${buildId}`);

const largest = walk(out)
  .map((path) => ({ path: relative(out, path), bytes: statSync(path).size }))
  .sort((a, b) => b.bytes - a.bytes);
console.log("Largest files in out/:");
for (const f of largest.slice(0, 5)) console.log(`  ${(f.bytes / 1024 / 1024).toFixed(2)} MiB  ${f.path}`);
const tooBig = largest.filter((f) => f.bytes > MAX_FILE_BYTES);
if (tooBig.length) {
  console.error(`Files over 25 MiB (Cloudflare Pages rejects them): ${tooBig.map((f) => f.path).join(", ")}`);
  process.exit(1);
}
