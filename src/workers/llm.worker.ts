import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
import { createModelFetch, LLM_DOWNLOAD_CHANNEL, type ModelSource } from "@/lib/ai/model-fetch";

/** Sent by the page before the engine loads; WebLLM's own messages follow. */
export interface LLMWorkerSetup {
  type: "guhit-setup";
  source: ModelSource;
  /** At most this many files downloading at once (phones); null keeps WebLLM's four. */
  maxDownloads: number | null;
}

// The model runs here so token generation never blocks drawing or the UI.
const handler = new WebWorkerMLCEngineHandler();
const nativeFetch = self.fetch.bind(self);

function limiter(max: number | null) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    async acquire() {
      if (max === null) return;
      if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
      active++;
    },
    release() {
      if (max === null) return;
      active--;
      waiting.shift()?.();
    },
  };
}

/**
 * WebLLM downloads with fetch() and fills its cache with Cache.add(), which
 * gives up on the first network error. In this worker only, both go through
 * the resilient model fetch (R2 then Hugging Face, retries, resume), and the
 * files are still stored under the URLs WebLLM asked for.
 */
function setUp({ source, maxDownloads }: LLMWorkerSetup) {
  const progress = new BroadcastChannel(LLM_DOWNLOAD_CHANNEL);
  const modelFetch = createModelFetch({
    source,
    baseFetch: nativeFetch,
    onBytes: (bytes) => progress.postMessage(bytes),
  });
  self.fetch = modelFetch as typeof fetch;
  const slots = limiter(maxDownloads);
  Cache.prototype.add = async function add(this: Cache, request: RequestInfo | URL) {
    const target = request instanceof Request ? request : new Request(request);
    await slots.acquire();
    try {
      const response = await modelFetch(target.url);
      if (!response.ok) throw new TypeError(`Download failed (${response.status}): ${target.url}`);
      await this.put(target, response);
    } finally {
      slots.release();
    }
  };
}

self.onmessage = (event: MessageEvent) => {
  if (event.data?.type === "guhit-setup") {
    setUp(event.data as LLMWorkerSetup);
    return;
  }
  handler.onmessage(event);
};
