// Downloads the models into public/models so this machine's own server can
// hand them to the browser (open the app once with "?models=local"). Used when
// the browser cannot reach Hugging Face quickly, e.g. on venue Wi-Fi, and for
// first setup with no internet at all once the mirror exists.
//
//   node scripts/mirror-models.mjs [llm-model-id ...]
//
// The layout copies Hugging Face's ("<repo>/resolve/main/<file>"), so the
// libraries only need a different host. The files are large and gitignored.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";

const run = promisify(execFile);
const PARALLEL = 8;

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

// curl resumes partial files and retries dropped connections, which slow or
// flaky Wi-Fi to the Hugging Face CDN needs for 1 GB of weights.
async function download(url, target, expectedSize) {
  if (existsSync(target) && (!expectedSize || statSync(target).size === expectedSize)) return "kept";
  mkdirSync(dirname(target), { recursive: true });
  const args = ["-sSfL", "--retry", "20", "--retry-all-errors", "--retry-delay", "2", "-o", target, url];
  // "-C -" resumes from the partial file left by an earlier, interrupted run.
  if (existsSync(target)) args.unshift("-C", "-");
  await run("curl", args, { maxBuffer: 1024 * 1024 });
  return "downloaded";
}

async function repoFiles(repo) {
  const response = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`);
  if (!response.ok) throw new Error(`${repo}: HTTP ${response.status}`);
  return (await response.json()).siblings.map((s) => ({ name: s.rfilename, size: s.size }));
}

const wanted = (name) => !name.startsWith(".") && name !== "README.md";
const filesOf = async (repo, keep) =>
  (await repoFiles(repo))
    .filter((f) => keep(f.name))
    .map((f) => ({
      url: `https://huggingface.co/${repo}/resolve/main/${f.name}`,
      target: join(root, repo, "resolve", "main", f.name),
      size: f.size,
    }));

// One shared queue: the Hugging Face CDN caps each connection, so several
// downloads side by side finish far sooner than one after another.
const queue = [];
for (const id of llmIds) {
  const record = prebuiltAppConfig.model_list.find((m) => m.model_id === id);
  if (!record) throw new Error(`Unknown WebLLM model ${id}`);
  queue.push({ url: record.model_lib, target: join(root, "libs", record.model_lib.split("/").pop()) });
  queue.push(...(await filesOf(`mlc-ai/${id}`, wanted)));
}
queue.push(...(await filesOf(whisper, (name) => (name.startsWith("onnx/") ? whisperOnnx.includes(name) : wanted(name)))));

const total = queue.length;
let done = 0;
const worker = async () => {
  for (let file = queue.shift(); file; file = queue.shift()) {
    const result = await download(file.url, file.target, file.size);
    console.log(`${++done}/${total} ${result} ${file.target.slice(root.length + 1)}`);
  }
};
await Promise.all(Array.from({ length: PARALLEL }, worker));
console.log(`Models mirrored into ${root}`);
