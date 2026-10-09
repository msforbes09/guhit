// Downloads the models into public/models so this machine's own server can
// hand them to the browser (open the app once with "?models=local"). Used when
// the browser cannot reach Hugging Face quickly, e.g. on venue Wi-Fi, and for
// first setup with no internet at all once the mirror exists.
//
//   node scripts/mirror-models.mjs [llm-model-id ...]
//
// The layout copies Hugging Face's ("<repo>/resolve/main/<file>"), so the
// libraries only need a different host. The files are large and gitignored.
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";

const root = join(process.cwd(), "public", "models");
const llmIds = process.argv.slice(2).length ? process.argv.slice(2) : ["Qwen3-1.7B-q4f16_1-MLC"];
const whisper = "onnx-community/whisper-base.en";
// The precisions src/lib/ai/models.ts loads on WebGPU and on the CPU fallback.
const whisperOnnx = [
  "onnx/encoder_model.onnx",
  "onnx/decoder_model_merged_q4.onnx",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

async function download(url, target, expectedSize) {
  if (existsSync(target) && (!expectedSize || statSync(target).size === expectedSize)) return "kept";
  mkdirSync(dirname(target), { recursive: true });
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  return "downloaded";
}

async function repoFiles(repo) {
  const response = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`);
  if (!response.ok) throw new Error(`${repo}: HTTP ${response.status}`);
  return (await response.json()).siblings.map((s) => ({ name: s.rfilename, size: s.size }));
}

async function mirrorRepo(repo, keep) {
  const files = (await repoFiles(repo)).filter((f) => keep(f.name));
  let done = 0;
  for (const file of files) {
    const target = join(root, repo, "resolve", "main", file.name);
    const result = await download(`https://huggingface.co/${repo}/resolve/main/${file.name}`, target, file.size);
    done++;
    console.log(`[${repo}] ${done}/${files.length} ${result} ${file.name}`);
  }
}

for (const id of llmIds) {
  const record = prebuiltAppConfig.model_list.find((m) => m.model_id === id);
  if (!record) throw new Error(`Unknown WebLLM model ${id}`);
  const lib = record.model_lib.split("/").pop();
  console.log(`[lib] ${await download(record.model_lib, join(root, "libs", lib))} ${lib}`);
  await mirrorRepo(`mlc-ai/${id}`, (name) => !name.startsWith(".") && name !== "README.md");
}
await mirrorRepo(whisper, (name) => (name.startsWith("onnx/") ? whisperOnnx.includes(name) : !name.startsWith(".") && name !== "README.md"));
console.log(`Models mirrored into ${root}`);
