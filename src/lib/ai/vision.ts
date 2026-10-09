import type { VisionRequest, VisionResponse } from "@/workers/vision.worker";
import { ModelWorker } from "./model-worker";
import type { STTDevice } from "./models";

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
    onProgress: (loaded: number, total: number) => void,
  ): Promise<{ warmupMs: number }> {
    this.worker = new ModelWorker(
      new Worker(new URL("../../workers/vision.worker.ts", import.meta.url), { type: "module" }),
    );
    return this.worker.load({ type: "load", model, device, dtype, modelHost } satisfies VisionRequest, onProgress);
  }

  /** `png` is the cut-out as a data URL; the worker puts it on white before captioning. */
  async describe(png: string): Promise<Caption> {
    if (!this.worker) throw new Error("Drawing recognition is not loaded yet.");
    const image = await (await fetch(png)).blob();
    const result = await this.worker.call({ type: "describe", image });
    return { caption: result.caption, ms: result.ms };
  }
}
