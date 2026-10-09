import {
  CreateWebWorkerMLCEngine,
  prebuiltAppConfig,
  type AppConfig,
  type CompletionUsage,
  type InitProgressReport,
  type WebWorkerMLCEngine,
} from "@mlc-ai/web-llm";
import { findLLM } from "./models";
import type { Message } from "./prompts";

/** Points WebLLM at a mirror with Hugging Face's layout; undefined keeps the defaults. */
export function appConfigFor(modelId: string, modelHost: string | null): AppConfig | undefined {
  if (!modelHost) return undefined;
  const record = prebuiltAppConfig.model_list.find((m) => m.model_id === modelId);
  if (!record) return undefined;
  const lib = record.model_lib.split("/").pop();
  return {
    ...prebuiltAppConfig,
    model_list: [{ ...record, model: `${modelHost}/mlc-ai/${modelId}`, model_lib: `${modelHost}/libs/${lib}` }],
  };
}

export interface GenStats {
  ms: number;
  firstTokenMs: number;
  promptTokens: number;
  completionTokens: number;
  decodeTps: number;
  prefillTps: number;
}

export interface GenOptions {
  maxTokens: number;
  temperature?: number;
  /** Called with each streamed piece of text; return false to stop generating. */
  onText?: (delta: string) => boolean | void;
}

export class LLMClient {
  private engine: WebWorkerMLCEngine | null = null;
  // WebLLM runs one request at a time; queue callers instead of failing them.
  private chain: Promise<unknown> = Promise.resolve();
  modelId = "";
  lastStats: GenStats | null = null;

  async load(
    modelId: string,
    modelHost: string | null,
    onProgress: (report: InitProgressReport) => void,
  ): Promise<void> {
    const worker = new Worker(new URL("../../workers/llm.worker.ts", import.meta.url), { type: "module" });
    this.engine = await CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: onProgress,
      appConfig: appConfigFor(modelId, modelHost),
    });
    this.modelId = modelId;
  }

  generate(messages: Message[], options: GenOptions): Promise<string> {
    const run = this.chain.then(() => this.run(messages, options));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async run(messages: Message[], options: GenOptions): Promise<string> {
    const engine = this.engine;
    if (!engine) throw new Error("The story helper is not loaded yet.");
    const thinking = findLLM(this.modelId)?.thinking ?? false;
    const started = performance.now();
    let firstToken = 0;
    let text = "";
    let stopped = false;
    let usage: CompletionUsage | undefined;

    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.7,
      top_p: 0.8,
      // Qwen3 "thinking" would spend seconds on hidden reasoning before every reply.
      ...(thinking ? { extra_body: { enable_thinking: false } } : {}),
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        if (!firstToken) firstToken = performance.now();
        text += delta;
        if (!stopped && options.onText?.(delta) === false) {
          stopped = true;
          engine.interruptGenerate();
        }
      }
      if (chunk.usage) usage = chunk.usage;
    }

    this.lastStats = {
      ms: performance.now() - started,
      firstTokenMs: firstToken ? firstToken - started : 0,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      decodeTps: usage?.extra?.decode_tokens_per_s ?? 0,
      prefillTps: usage?.extra?.prefill_tokens_per_s ?? 0,
    };
    return text;
  }
}
