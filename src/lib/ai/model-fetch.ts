/**
 * Every model download goes through here (inside the model workers):
 *
 * - Guhit's own copy on Cloudflare R2 first, Hugging Face as the per-file
 *   fallback when R2 lacks a file (404) or cannot be reached;
 * - each file retried with backoff, and a download that breaks part-way is
 *   resumed with a Range request instead of starting over (phones on slow or
 *   flaky connections otherwise fail a 30 MB file near its end);
 * - callers keep using the Hugging Face URLs, which stay the cache keys, so
 *   a device that already has the models never downloads them again.
 */

/** Where model files come from: R2 with Hugging Face fallback, Hugging Face only, or this site's /models mirror. */
export type ModelSource = "r2" | "hf" | "local";

/**
 * Guhit's model copies: the iam4bs-assets R2 bucket, keys "guhit/models/<same
 * path as mirror/models>", on the bucket's public domain. The one place to
 * change it; null leaves R2 out and downloads straight from Hugging Face.
 */
export const R2_BASE: string | null = "https://assets.iam4bs.dev/guhit/models";

/** The LLM worker reports downloaded bytes here (WebLLM itself reports only whole files). */
export const LLM_DOWNLOAD_CHANNEL = "guhit-llm-download";

const TRIES = 3;
/** After this many files R2 could not serve at all (network errors), the session stops asking it. */
const R2_GIVE_UP_AFTER = 3;
let r2Unreachable = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The R2 copy of a Hugging Face or WebLLM library URL, or null when there is none. */
export function r2Url(url: string): string | null {
  if (!R2_BASE) return null;
  const hub = url.match(/^https:\/\/huggingface\.co\/(.+?\/resolve\/[^/]+\/.+)$/);
  if (hub) return `${R2_BASE}/${hub[1]}`;
  const lib = url.match(/^https:\/\/raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\/.+\/([^/]+\.wasm)$/);
  if (lib) return `${R2_BASE}/libs/${lib[1]}`;
  return null;
}

const urlOf = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** Retry-worthy: the server had a hiccup. 404/403 mean "not here" and go to the next source. */
const transient = (status: number) => status === 408 || status === 429 || status >= 500;

export interface ModelFetchOptions {
  source: ModelSource;
  /** Bytes as they arrive, for download progress finer than one file. */
  onBytes?: (bytes: number) => void;
  /** The fetch to use underneath (a worker that replaces its own fetch passes the original). */
  baseFetch?: typeof fetch;
}

export function createModelFetch({ source, onBytes, baseFetch = fetch }: ModelFetchOptions) {
  return async function modelFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlOf(input);
    const mirror = source === "r2" && r2Unreachable < R2_GIVE_UP_AFTER ? r2Url(url) : null;
    const candidates = mirror ? [mirror, url] : [url];
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    // Transformers.js probes a file's size with "Range: bytes=0-0"; those need no resuming.
    const probe = headers.has("Range") || init?.method === "HEAD";
    let lastResponse: Response | null = null;
    let lastError: unknown = null;

    for (const candidate of candidates) {
      let networkErrors = 0;
      for (let attempt = 0; attempt < TRIES; attempt++) {
        if (attempt > 0) await sleep(600 * 2 ** (attempt - 1));
        try {
          const response = await baseFetch(candidate, { ...init, headers });
          if (response.ok) {
            return probe || !response.body ? response : resumable(response, candidate, init, baseFetch, onBytes);
          }
          lastResponse = response;
          if (!transient(response.status)) break;
          await response.body?.cancel();
        } catch (error) {
          if (init?.signal?.aborted) throw error;
          lastError = error;
          networkErrors++;
          // With no network at all, retrying only delays the cached-files path.
          if (!online()) break;
        }
      }
      if (candidate === mirror && networkErrors >= TRIES) r2Unreachable++;
    }
    if (lastResponse) return lastResponse;
    throw lastError instanceof Error ? lastError : new TypeError("Download failed");
  };
}

/**
 * The response's body, but a read that fails part-way asks the server for the
 * rest (Range: bytes=<received>-) and carries on, up to TRIES times.
 */
function resumable(
  first: Response,
  url: string,
  init: RequestInit | undefined,
  baseFetch: typeof fetch,
  onBytes?: (bytes: number) => void,
): Response {
  let reader = first.body!.getReader();
  let received = 0;
  /** Bytes to drop when a server ignored the Range header and started over. */
  let skip = 0;
  let resumes = 0;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        try {
          const { done, value } = await reader.read();
          if (done) return controller.close();
          let chunk = value;
          if (skip > 0) {
            const drop = Math.min(skip, chunk.byteLength);
            skip -= drop;
            chunk = chunk.subarray(drop);
            if (chunk.byteLength === 0) continue;
          }
          received += chunk.byteLength;
          onBytes?.(chunk.byteLength);
          return controller.enqueue(chunk);
        } catch (error) {
          if (init?.signal?.aborted || resumes >= TRIES) return controller.error(error);
          resumes++;
          await sleep(800 * resumes);
          try {
            const headers = new Headers(init?.headers);
            headers.set("Range", `bytes=${received}-`);
            const next = await baseFetch(url, { ...init, headers });
            if (!next.body || (next.status !== 206 && next.status !== 200)) throw new TypeError(`Resume failed (${next.status})`);
            if (next.status === 200) skip = received;
            reader = next.body.getReader();
          } catch {
            // Loop again: the read fails on the old reader and counts as the next try.
          }
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, { status: first.status, statusText: first.statusText, headers: first.headers });
}
