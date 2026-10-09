import type { CpuLLMRequest, CpuLLMResponse } from "@/workers/llm-cpu.worker";
import type { GenOptions, GenStats, TextGenerator } from "./llm";
import type { ModelSource } from "./model-fetch";
import { ModelWorker } from "./model-worker";
import type { Message } from "./prompts";

type Result = Extract<CpuLLMResponse, { type: "result" }>;

/**
 * The story helper on the CPU (Transformers.js + ONNX Runtime wasm), for
 * computers whose browser has no usable WebGPU. Same interface as the WebLLM
 * client, so the engine does not care which one it talks to.
 */
export class CpuLLMClient implements TextGenerator {
  modelId = "";
  lastStats: GenStats | null = null;
  private worker: ModelWorker<Result> | null = null;
  /** One generation at a time, like WebLLM; callers queue. */
  private chain: Promise<unknown> = Promise.resolve();
  /** The running generation's text callback (only one runs at a time). */
  private onText: GenOptions["onText"] | null = null;
  private stopped = false;

  async load(
    modelId: string,
    dtype: string,
    modelHost: string | null,
    source: ModelSource,
    onProgress: (loaded: number, total: number) => void,
  ): Promise<{ warmupMs: number }> {
    const worker = new ModelWorker<Result>(
      new Worker(new URL("../../workers/llm-cpu.worker.ts", import.meta.url), { type: "module" }),
    );
    worker.onOther = (reply) => {
      if (reply.type !== "token" || this.stopped) return;
      if (this.onText?.((reply as Extract<CpuLLMResponse, { type: "token" }>).text) === false) {
        this.stopped = true;
        worker.post({ type: "stop" } satisfies CpuLLMRequest);
      }
    };
    const result = await worker.load({ type: "load", model: modelId, dtype, modelHost, source } satisfies CpuLLMRequest, onProgress);
    this.worker = worker;
    this.modelId = modelId;
    return result;
  }

  generate(messages: Message[], options: GenOptions): Promise<string> {
    const run = this.chain.then(() => this.run(messages, options));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async run(messages: Message[], options: GenOptions): Promise<string> {
    const worker = this.worker;
    if (!worker) throw new Error("The story helper is not loaded yet.");
    this.onText = options.onText ?? null;
    this.stopped = false;
    try {
      const result = await worker.call({
        type: "generate",
        messages,
        maxTokens: options.maxTokens,
        temperature: options.temperature ?? 0.7,
      } satisfies Omit<Extract<CpuLLMRequest, { type: "generate" }>, "id">);
      const decodeMs = result.ms - result.firstTokenMs;
      this.lastStats = {
        ms: result.ms,
        firstTokenMs: result.firstTokenMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        decodeTps: decodeMs > 0 ? result.completionTokens / (decodeMs / 1000) : 0,
        prefillTps: result.firstTokenMs > 0 ? result.promptTokens / (result.firstTokenMs / 1000) : 0,
      };
      return result.text;
    } finally {
      this.onText = null;
    }
  }
}
