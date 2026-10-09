# Disclosures: AI models, libraries and what runs where

Guhit's AI runs entirely in the browser, on the child's device. Nothing the
child draws, says or types is sent to any server. There is no backend and no
database: stories are stored in the browser (IndexedDB) on the device.

## What needs the internet

Only the **first setup** (the "Get Guhit ready" button on `/setup`) downloads
anything: the app itself and the model weights. After that, Guhit works with
the network switched off.

| Downloaded once from | What | Kept in |
| --- | --- | --- |
| The Guhit web app's own host | The app (pages, scripts, icons, ONNX Runtime wasm) | Service worker cache (`guhit-pages-v1`, `guhit-assets-v1`) |
| `huggingface.co` (mlc-ai repos) | Language model weights, tokenizer, config | WebLLM's Cache Storage (`webllm/model`, `webllm/config`) |
| `raw.githubusercontent.com` (mlc-ai/binary-mlc-llm-libs) | The compiled WebGPU kernels for the language model | WebLLM's Cache Storage (`webllm/wasm`) |
| `huggingface.co` (onnx-community repos) | Speech-recognition model (Whisper) and drawing-recognition model (Florence-2) | Transformers.js Cache Storage (`transformers-cache`) |

The service worker does not store model weights a second time; each library
caches its own files. The app asks the browser to keep this storage
(`navigator.storage.persist()`), so it is not cleaned up automatically.

## What runs locally (on the device)

| Task | How |
| --- | --- |
| The character's replies, interview questions, story pages, book titles | Language model through WebLLM on the device's GPU (WebGPU), inside a Web Worker |
| Guessing what the drawing shows (a short caption the child confirms or corrects) | Florence-2 through Transformers.js / ONNX Runtime Web, WebGPU (CPU wasm fallback), inside a Web Worker |
| Understanding the child's speech (push-to-talk) | Whisper through Transformers.js / ONNX Runtime Web, WebGPU (CPU wasm fallback), inside a Web Worker |
| Reading aloud (narrator and character voices) | The browser's Web Speech API with voices installed on the operating system |
| Safety filtering of model output | Plain code in the app (word filter, markdown and `<think>` stripping) |

## Models

| Model | Used for | Licence | Source |
| --- | --- | --- | --- |
| Qwen3-1.7B (`Qwen3-1.7B-q4f16_1-MLC`, 4-bit, ~984 MB) | Language model on laptops | Apache-2.0 (Qwen) | huggingface.co/Qwen/Qwen3-1.7B, MLC build huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC |
| Qwen3-0.6B (`Qwen3-0.6B-q4f16_1-MLC`, 4-bit, ~352 MB) | Language model on phones | Apache-2.0 (Qwen) | huggingface.co/Qwen/Qwen3-0.6B, MLC build huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC |
| Qwen3.5-2B / Qwen3.5-0.8B (MLC builds) | Alternatives, only when chosen in `/lab` | Apache-2.0 (Qwen) | huggingface.co/Qwen, huggingface.co/mlc-ai |
| Whisper base.en (ONNX, ~207 MB on WebGPU / ~77 MB on CPU) | Speech to text, English | Apache-2.0 (model card); OpenAI Whisper code is MIT | huggingface.co/openai/whisper-base.en, ONNX build huggingface.co/onnx-community/whisper-base.en |
| Whisper tiny.en (ONNX) | Alternative, only when chosen in `/lab` | Apache-2.0 (model card) | huggingface.co/onnx-community/whisper-tiny.en |
| Florence-2-base-ft (ONNX, 4-bit vision encoder, encoder and decoder, 8-bit embeddings, ~217 MB) | Guessing what the child drew ("Is that a purple dragon?"); the drawing itself is never changed | MIT (Microsoft) | huggingface.co/microsoft/Florence-2-base-ft, ONNX build huggingface.co/onnx-community/Florence-2-base-ft |

Models considered and **not** used because their licences are not permissive
open source: Gemma 3 (Gemma Terms of Use), Qwen2.5-3B-Instruct (Qwen Research
licence), Llama 3.2 (Llama Community Licence).

Voices: the app uses voices that ship with the operating system (for example
"Samantha" on macOS) through the browser; no voice model is downloaded.

## Libraries

| Library | Version | Licence | Role |
| --- | --- | --- | --- |
| @mlc-ai/web-llm | 0.2.85 | Apache-2.0 | Runs the language model on WebGPU |
| MLC-LLM prebuilt model libraries (binary-mlc-llm-libs) | v0_2_84 | Apache-2.0 | Compiled GPU kernels used by WebLLM |
| @huggingface/transformers (Transformers.js) | 4.3.1 | Apache-2.0 | Runs Whisper |
| onnxruntime-web | 1.31.0-dev | MIT | Inference runtime under Transformers.js |
| @huggingface/tokenizers, @huggingface/jinja | 0.2.0, 0.5.10 | Apache-2.0, MIT | Tokenizer and chat templates for Transformers.js |
| Next.js | 16.4.0 | MIT | App framework |
| React, React DOM | 19.3.0 | MIT | UI |
| Tailwind CSS | 4.3.3 | MIT | Styling |
| TypeScript | 5.9.3 | Apache-2.0 | Language (build time only) |
| Geist font (via next/font, self-hosted) | – | SIL Open Font License 1.1 | Typeface |
