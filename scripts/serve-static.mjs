// Serves the static build (out/) the way Cloudflare Pages does ("/snap" →
// snap.html), plus the local model mirror (mirror/models) at /models, so the
// whole app, models included, can run from this machine with no internet.
//
//   npm run serve            (port 3101)
//   PORT=4000 npm run serve
//   ISOLATE=1 npm run serve  (cross-origin isolated: ONNX Runtime may use several CPU threads)
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const root = process.cwd();
const out = join(root, "out");
const mirror = join(root, "mirror", "models");
const port = Number(process.env.PORT ?? 3101);
const isolation =
  process.env.ISOLATE === "1"
    ? { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" }
    : {};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
};

/** Resolves a URL path inside `base`, refusing anything that escapes it. */
function inside(base, urlPath) {
  const path = normalize(join(base, decodeURIComponent(urlPath)));
  return path === base || path.startsWith(base + sep) ? path : null;
}

function findFile(urlPath) {
  if (urlPath.startsWith("/models/")) {
    const path = inside(mirror, urlPath.slice("/models".length));
    return path && existsSync(path) && statSync(path).isFile() ? path : null;
  }
  const candidates = [urlPath, `${urlPath}.html`, join(urlPath, "index.html")];
  for (const candidate of candidates) {
    const path = inside(out, candidate);
    if (path && existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

createServer((request, response) => {
  const urlPath = new URL(request.url ?? "/", "http://localhost").pathname;
  const found = findFile(urlPath);
  const file = found ?? inside(out, "/404.html");
  if (!file || !existsSync(file)) {
    response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  const headers = {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Content-Length": statSync(file).size,
    "Cache-Control": urlPath === "/sw.js" || urlPath === "/precache-manifest.json" ? "no-cache" : "public, max-age=0",
    ...isolation,
  };
  response.writeHead(found ? 200 : 404, headers);
  // HEAD requests get the headers only.
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`Serving out/ and the model mirror on http://localhost:${port}`);
});
