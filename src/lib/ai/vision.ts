import type { VisionRequest, VisionResponse } from "@/workers/vision.worker";
import type { ModelSource } from "./model-fetch";
import { ModelWorker } from "./model-worker";
import type { STTDevice } from "./models";
import type { PixelRect } from "./types";

export interface Caption {
  caption: string;
  ms: number;
}

export class VisionClient {
  private worker: ModelWorker<VisionResponse & { type: "result" }> | null = null;

  load(
    model: string,
    device: STTDevice,
    dtype: Record<string, string>,
    modelHost: string | null,
    source: ModelSource,
    onProgress: (loaded: number, total: number) => void,
  ): Promise<{ warmupMs: number }> {
    this.worker = new ModelWorker(
      new Worker(new URL("../../workers/vision.worker.ts", import.meta.url), { type: "module" }),
    );
    return this.worker.load(
      { type: "load", model, device, dtype, modelHost, source } satisfies VisionRequest,
      onProgress,
    );
  }

  /**
   * `image` is a data URL: either the cut-out (put on white before captioning)
   * or, with `crop`, the original photo (only the cropped region is captioned).
   */
  /** Frees the model's GPU memory for the talk loop; load() again to use it. */
  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }

  async describe(image: string, crop?: PixelRect, task?: string): Promise<Caption> {
    if (!this.worker) throw new Error("Drawing recognition is not loaded yet.");
    const blob = await (await fetch(image)).blob();
    const result = await this.worker.call({ type: "describe", image: blob, crop, task });
    return { caption: result.caption, ms: result.ms };
  }
}
