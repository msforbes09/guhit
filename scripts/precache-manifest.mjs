// Lists every file Next.js emitted into .next/static so the service worker can
// store all of them, including chunks that load lazily (the AI engine and its
// workers), which never appear in a page's HTML.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const staticDir = join(root, ".next", "static");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Bundling also emits a second ONNX Runtime wasm (27 MB) and raw worker sources
// as media; the app loads ORT's wasm from /ort and runs the compiled worker
// chunks, so those copies are left out rather than stored twice on the device.
const unused = (path) => path.endsWith(".map") || /[\\/]media[\\/].*\.(?:wasm|ts)$/.test(path);

const assets = walk(staticDir)
  .filter((path) => !unused(path))
  .map((path) => `/_next/static/${relative(staticDir, path).split(sep).join("/")}`)
  .sort();

const buildId = readFileSync(join(root, ".next", "BUILD_ID"), "utf8").trim();
writeFileSync(join(root, "public", "precache-manifest.json"), JSON.stringify({ buildId, assets }, null, 1));
console.log(`Precache manifest: ${assets.length} static files for build ${buildId}`);
