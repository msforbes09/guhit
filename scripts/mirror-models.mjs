// Downloads the models into mirror/models so this machine can hand them to the
// browser itself: `npm run serve` serves the built app plus the mirror at
// /models; open the app once with "?models=local". Used when the browser
// cannot reach Hugging Face quickly, e.g. on venue Wi-Fi, and for first setup
// with no internet at all once the mirror exists.
//
//   node scripts/mirror-models.mjs [llm-model-id ...]
//
// The layout copies Hugging Face's ("<repo>/resolve/main/<file>"), so the
// libraries only need a different host. The files are large and gitignored;
// they live outside public/ because the static export copies all of public/.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";

const run = promisify(execFile);
const PARALLEL = 8;

const root = join(process.cwd(), "mirror", "models");
const llmIds = process.argv.slice(2).length ? process.argv.slice(2) : ["Qwen3-1.7B-q4f16_1-MLC"];
// Transformers.js models and the ONNX files of the precisions src/lib/ai/models.ts loads.
const onnxRepos = [
  {
    repo: "onnx-community/whisper-base.en",
    onnx: [
      "onnx/encoder_model.onnx",
      "onnx/decoder_model_merged_q4.onnx",
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
    ],
  },
  {
    repo: "onnx-community/Florence-2-base-ft",
    onnx: [
      "onnx/vision_encoder_q4.onnx",
      "onnx/embed_tokens_quantized.onnx",
      "onnx/encoder_model_q4.onnx",
      "onnx/decoder_model_merged_q4.onnx",
    ],
  },
  // Kokoro voice (src/lib/ai/voice/voices.ts): fp32 for WebGPU, 8-bit for
  // phones, and only the voices the app offers (PRELOADED_VOICES).
  {
    repo: "onnx-community/Kokoro-82M-v1.0-ONNX",
    onnx: ["onnx/model.onnx", "onnx/model_quantized.onnx"],
    voices: ["af_heart", "af_bella", "af_nicole", "af_aoede", "af_kore", "af_sarah", "af_nova", "af_sky", "bf_emma"],
  },
];

const complete = (target, expectedSize) =>
  existsSync(target) && (!expectedSize || statSync(target).size === expectedSize);

// The Hugging Face CDN sometimes leaves a connection crawling at a few KB/s
// while a fresh one runs at MB/s, so a transfer that drops below 100 KB/s for
// 15 s is abandoned and resumed ("-C -") on a new connection.
async function download(url, target, expectedSize) {
  if (complete(target, expectedSize)) return "kept";
  mkdirSync(dirname(target), { recursive: true });
  for (let attempt = 1; attempt <= 40; attempt++) {
    const args = ["-sSfL", "--speed-limit", "100000", "--speed-time", "15", "-o", target, url];
    if (existsSync(target)) args.unshift("-C", "-");
    try {
      await run("curl", args, { maxBuffer: 1024 * 1024 });
      if (complete(target, expectedSize)) return attempt === 1 ? "downloaded" : `downloaded (${attempt} tries)`;
    } catch {
      // Slow or dropped: try again from where the partial file ends.
    }
  }
  throw new Error(`Gave up on ${url}`);
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
for (const { repo, onnx, voices } of onnxRepos) {
  const keep = (name) =>
    name.startsWith("onnx/")
      ? onnx.includes(name)
      : name.startsWith("voices/") && voices
        ? voices.includes(name.slice("voices/".length, -".bin".length))
        : wanted(name);
  queue.push(...(await filesOf(repo, keep)));
}

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
