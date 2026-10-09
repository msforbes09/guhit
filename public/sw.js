/*
 * Guhit service worker: keeps the app itself usable with no network.
 *
 * It stores the pages, the Next.js build output, the ONNX Runtime wasm and the
 * icons. Model weights are deliberately NOT stored here: WebLLM and
 * Transformers.js already keep them in their own Cache Storage buckets, and a
 * second copy would cost another ~1.2 GB of the device's storage.
 */

const PAGES = "guhit-pages-v1";
const ASSETS = "guhit-assets-v1";

// Kid routes keep ids in the query string, so one cached page serves every id.
const ROUTES = ["/", "/snap", "/draw", "/friend", "/friends", "/story", "/book", "/setup", "/lab"];
const FILES = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/ort/ort-wasm-simd-threaded.asyncify.mjs",
  "/ort/ort-wasm-simd-threaded.asyncify.wasm",
];
// Written by scripts/precache-manifest.mjs after each build: every file in
// /_next/static, including chunks that are only loaded lazily (the AI engine).
const BUILD_MANIFEST = "/precache-manifest.json";
const STATIC_REF = /\/_next\/static\/[^"'\s\\)]+/g;
const PAGE_TIMEOUT_MS = 3000;

async function fetchOk(url) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok || response.redirected) throw new Error(`${url}: ${response.status}`);
  return response;
}

async function cacheAsset(cache, url) {
  if (await cache.match(url)) return false;
  await cache.put(url, await fetchOk(url));
  return true;
}

async function precache() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  const wanted = new Set(FILES);

  try {
    const manifest = await (await fetchOk(BUILD_MANIFEST)).json();
    for (const url of manifest.assets ?? []) wanted.add(url);
  } catch {
    // Without the build list, the static files referenced by each page still get cached below.
  }

  let pageCount = 0;
  await Promise.allSettled(
    ROUTES.map(async (route) => {
      const response = await fetchOk(route);
      const html = await response.clone().text();
      await pages.put(route, response);
      pageCount++;
      for (const url of html.match(STATIC_REF) ?? []) wanted.add(url);
    }),
  );

  // Files in /_next/static are content-hashed, so a cached copy never goes stale.
  const results = await Promise.allSettled([...wanted].map((url) => cacheAsset(assets, url)));
  const failed = results.filter((r) => r.status === "rejected").length;
  return { pages: pageCount, assets: wanted.size - failed, failed };
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precache()
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, ASSETS]);
      for (const key of await caches.keys()) {
        if (key.startsWith("guhit-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// /setup asks for a fresh precache once the models are in, so everything the
// app needs is on the device before the network goes away.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache") return;
  const port = event.ports[0];
  event.waitUntil(
    precache().then(
      (result) => port?.postMessage({ ok: true, ...result }),
      (error) => port?.postMessage({ ok: false, error: String(error) }),
    ),
  );
});

function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guhit</title>' +
      '<body style="font-family:system-ui;text-align:center;padding:3rem;background:#fff8ec;color:#3b2a1a">' +
      '<h1>This page is not saved yet</h1><p>Connect to the internet once to open it, or go back home.</p><p><a href="/">Go home</a></p>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function handlePage(request) {
  const url = new URL(request.url);
  const key = url.origin + url.pathname;
  const pages = await caches.open(PAGES);
  const network = fetch(request).then(async (response) => {
    if (response.ok && !response.redirected) await pages.put(key, response.clone());
    return response;
  });
  network.catch(() => undefined);
  // Network first so a new deploy shows up, but never keep a child waiting on bad Wi-Fi.
  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS, "timeout"));
  try {
    const winner = await Promise.race([network, timeout]);
    if (winner !== "timeout") return winner;
    const cached = await pages.match(key);
    if (cached) return cached;
    return await network;
  } catch {
    return (await pages.match(key)) ?? offlinePage();
  }
}

async function handleAsset(request) {
  const assets = await caches.open(ASSETS);
  const cached = await assets.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await assets.put(request, response.clone());
  return response;
}

async function handleOther(request) {
  const assets = await caches.open(ASSETS);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await assets.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await assets.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Cross-origin requests are model downloads; their libraries cache them.
  if (url.origin !== self.location.origin) return;
  // React Server Component fetches vary per navigation; when they fail offline,
  // Next.js falls back to a full page load, which the page cache answers.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr") || url.pathname === BUILD_MANIFEST) return;

  if (request.mode === "navigate") {
    event.respondWith(handlePage(request));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/ort/")) {
    event.respondWith(handleAsset(request));
  } else {
    event.respondWith(handleOther(request));
  }
});
