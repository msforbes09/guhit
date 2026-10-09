/// <reference lib="webworker" />
import { runClassical, type RunResult } from "./cutout-run";

/**
 * Cut-out work runs here so a 300 ms pipeline (or a model download) never
 * blocks the animation or the child's taps on the main thread.
 */

export type WorkerRequest =
  | {
      id: number;
      type: "cutout";
      blob: Blob;
      maxSide: number;
      method: "classical" | "ai";
      debug: boolean;
    }
  | { id: number; type: "preload" };

export type WorkerResponse =
  | { id: number; type: "result"; result: RunResult | null }
  | { id: number; type: "progress"; text: string }
  | { id: number; type: "error"; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const progress = (text: string) => ctx.postMessage({ id: req.id, type: "progress", text } satisfies WorkerResponse);
  try {
    if (req.type === "preload") {
      // The AI module is loaded on demand so the classical path never pays for it.
      const { loadSegmenter } = await import("./ai-segment");
      await loadSegmenter(progress);
      ctx.postMessage({ id: req.id, type: "result", result: null } satisfies WorkerResponse);
      return;
    }
    let result: RunResult;
    if (req.method === "ai") {
      const { runAi } = await import("./ai-segment");
      result = await runAi(req.blob, req.maxSide, req.debug, progress);
    } else {
      result = await runClassical(req.blob, req.maxSide, req.debug);
    }
    const transfer: Transferable[] = [result.mask.buffer];
    if (result.fullAlpha) transfer.push(result.fullAlpha.buffer);
    ctx.postMessage({ id: req.id, type: "result", result } satisfies WorkerResponse, transfer);
  } catch (err) {
    ctx.postMessage({
      id: req.id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
