/**
 * Background Fetch (Chrome on Android and desktop): the browser itself
 * downloads the model files, carrying on with the screen off, the tab closed
 * or the device asleep, and shows its own progress notification. The service
 * worker (public/sw.js) then stores each file in the cache and under the key
 * its library reads, so loading afterwards finds everything on the device.
 * Elsewhere (iPhone and iPad) setup downloads in the page as before.
 */
import { fetchUrlFor, type ModelFile } from "./model-files";
import type { ModelSource } from "./model-fetch";

export const BACKGROUND_ID = "guhit-models";
/** Where the page leaves the plan for the service worker; sw.js reads the same names. */
const DOWNLOADS_CACHE = "guhit-downloads";
const PLAN_KEY = "/__guhit-background-download";
export const DOWNLOAD_MESSAGE = "guhit-background-download";

export interface PlannedFile extends ModelFile {
  /** Where this file is downloaded from (R2 or Hugging Face); `key` stays the library's cache key. */
  url: string;
}

export interface DownloadPlan {
  files: PlannedFile[];
  /** Only when every size is known: Background Fetch aborts a download that passes its total. */
  totalBytes?: number;
}

type Head = (url: string) => Promise<{ ok: boolean; size: number }>;

const headRequest: Head = async (url) => {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return { ok: response.ok, size: Number(response.headers.get("Content-Length")) || 0 };
  } catch {
    return { ok: false, size: 0 };
  }
};

async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** Picks each file's download URL: R2 when it holds the file, else Hugging Face. */
export async function planDownload(files: ModelFile[], source: ModelSource, head: Head = headRequest): Promise<DownloadPlan> {
  const sized = await mapLimited(files, 8, async (file) => {
    const mirror = fetchUrlFor(file.key, source);
    if (mirror !== file.key) {
      const r2 = await head(mirror);
      if (r2.ok) return { file: { ...file, url: mirror }, size: r2.size || file.bytes || 0 };
    }
    const direct = await head(file.key);
    return { file: { ...file, url: file.key }, size: (direct.ok && direct.size) || file.bytes || 0 };
  });
  const known = sized.every((s) => s.size > 0);
  return {
    files: sized.map((s) => ({ ...s.file, ...(s.size ? { bytes: s.size } : {}) })),
    totalBytes: known ? sized.reduce((sum, s) => sum + s.size, 0) : undefined,
  };
}

interface BackgroundFetchRegistrationLike extends EventTarget {
  downloaded: number;
  downloadTotal: number;
  result: "" | "success" | "failure";
  failureReason: string;
}

interface BackgroundFetchManagerLike {
  fetch(id: string, requests: Request[], options: object): Promise<BackgroundFetchRegistrationLike>;
  get(id: string): Promise<BackgroundFetchRegistrationLike | undefined>;
}

export type BackgroundDownload = BackgroundFetchRegistrationLike;

export const canDownloadInBackground = () =>
  typeof window !== "undefined" && "BackgroundFetchManager" in window && "serviceWorker" in navigator;

async function manager(): Promise<BackgroundFetchManagerLike | null> {
  if (!canDownloadInBackground()) return null;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(resolve, 5000, null)),
  ]);
  return (registration as (ServiceWorkerRegistration & { backgroundFetch?: BackgroundFetchManagerLike }) | null)
    ?.backgroundFetch ?? null;
}

/** A background download still running from an earlier visit, if any. */
export async function runningBackgroundDownload(): Promise<BackgroundDownload | null> {
  try {
    const existing = await (await manager())?.get(BACKGROUND_ID);
    return existing && existing.result === "" ? existing : null;
  } catch {
    return null;
  }
}

/**
 * Hands the files to the browser to download in the background. Null when the
 * browser cannot (no Background Fetch, no service worker, or it refused).
 */
export async function startBackgroundDownload(files: ModelFile[], source: ModelSource): Promise<BackgroundDownload | null> {
  try {
    const bg = await manager();
    if (!bg) return null;
    const running = await runningBackgroundDownload();
    if (running) return running;
    const plan = await planDownload(files, source);
    await (await caches.open(DOWNLOADS_CACHE)).put(PLAN_KEY, new Response(JSON.stringify(plan.files)));
    const started = bg.fetch(
      BACKGROUND_ID,
      plan.files.map((f) => new Request(f.url, { mode: "cors", credentials: "omit" })),
      {
        title: "Guhit is downloading its helpers",
        icons: [{ src: "/icons/guhit-icon-192.png", sizes: "192x192", type: "image/png" }],
        ...(plan.totalBytes ? { downloadTotal: plan.totalBytes } : {}),
      },
    );
    // Chrome holds the call while it waits on its download permission; setup
    // must not wait with it. A download that starts too late is cancelled, so
    // it never runs beside the page's own.
    const answer = await Promise.race([started, new Promise<"late">((resolve) => setTimeout(resolve, START_TIMEOUT_MS, "late"))]);
    if (answer === "late") {
      void started.then((late) => (late as BackgroundDownload & { abort?: () => Promise<boolean> }).abort?.(), () => undefined);
      return null;
    }
    return answer;
  } catch {
    return null;
  }
}

const START_TIMEOUT_MS = 10_000;

/**
 * Resolves once the service worker has stored what arrived ("stored"), or the
 * download failed or was cancelled; setup then loads, downloading whatever is
 * still missing itself.
 */
export function waitForBackgroundDownload(
  download: BackgroundDownload,
  onProgress: (downloaded: number, total: number) => void,
): Promise<"stored" | "failed" | "aborted" | "gone"> {
  return new Promise((resolve) => {
    const progress = () => onProgress(download.downloaded, download.downloadTotal);
    const finish = (state: "stored" | "failed" | "aborted" | "gone") => {
      download.removeEventListener("progress", progress);
      navigator.serviceWorker.removeEventListener("message", message);
      clearInterval(timer);
      resolve(state);
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === DOWNLOAD_MESSAGE) finish(event.data.state);
    };
    download.addEventListener("progress", progress);
    navigator.serviceWorker.addEventListener("message", message);
    // The worker's message is missed if it finished while this page was away.
    const timer = setInterval(async () => {
      if (!(await runningBackgroundDownload())) finish("gone");
    }, 5000);
    progress();
  });
}
