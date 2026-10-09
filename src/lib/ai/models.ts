/**
 * Every model Guhit may run, with download sizes measured from the Hugging
 * Face repos (sum of all files) so the setup screen can show real numbers.
 * Only Apache-2.0 models are listed: the hackathon rules require permissive
 * licences, which rules out Gemma and Qwen2.5-3B.
 */
export interface LLMModel {
  id: string;
  label: string;
  downloadMB: number;
  /** Qwen3-family chat templates accept the no-think switch. */
  thinking: boolean;
}

export const LLM_MODELS: LLMModel[] = [
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "Qwen3 1.7B (laptop)", downloadMB: 984, thinking: true },
  { id: "Qwen3-1.7B-q4f32_1-MLC", label: "Qwen3 1.7B f32 (laptop, no f16 GPU)", downloadMB: 984, thinking: true },
  { id: "Qwen3.5-2B-q4f16_1-MLC", label: "Qwen3.5 2B (laptop, alt)", downloadMB: 1083, thinking: true },
  { id: "Qwen3-0.6B-q4f16_1-MLC", label: "Qwen3 0.6B (phone)", downloadMB: 352, thinking: true },
  { id: "Qwen3-0.6B-q4f32_1-MLC", label: "Qwen3 0.6B f32 (phone, no f16 GPU)", downloadMB: 352, thinking: true },
  { id: "Qwen3.5-0.8B-q4f16_1-MLC", label: "Qwen3.5 0.8B (phone, alt)", downloadMB: 447, thinking: true },
];

export type STTDevice = "webgpu" | "wasm";

export interface STTModel {
  id: string;
  label: string;
  /** Download size per device, because each device uses different precisions. */
  downloadMB: Record<STTDevice, number>;
}

export const STT_MODELS: STTModel[] = [
  { id: "onnx-community/whisper-base.en", label: "Whisper base.en", downloadMB: { webgpu: 207, wasm: 77 } },
  { id: "onnx-community/whisper-tiny.en", label: "Whisper tiny.en", downloadMB: { webgpu: 96, wasm: 41 } },
];

/**
 * WebGPU runs the encoder in full precision (Whisper loses accuracy at lower
 * precision there) with a 4-bit decoder; the CPU fallback uses 8-bit weights,
 * which wasm runs fastest.
 */
export const STT_DTYPES: Record<STTDevice, Record<string, string>> = {
  webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" },
  wasm: { encoder_model: "q8", decoder_model_merged: "q8" },
};

export const findLLM = (id: string) => LLM_MODELS.find((m) => m.id === id);
export const findSTT = (id: string) => STT_MODELS.find((m) => m.id === id);
