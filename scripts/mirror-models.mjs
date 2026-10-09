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
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";

const run = promisify(execFile);
const PARALLEL = 8;

const root = join(process.cwd(), "mirror", "models");
// Every story model src/lib/ai/device.ts may pick: laptop and phone, each in
// the 16-bit build and the 32-bit one for GPUs without 16-bit float support.
const TIER_LLMS = ["Qwen3-1.7B-q4f16_1-MLC", "Qwen3-1.7B-q4f32_1-MLC", "Qwen3-0.6B-q4f16_1-MLC", "Qwen3-0.6B-q4f32_1-MLC"];
const llmIds = process.argv.slice(2).length ? process.argv.slice(2) : TIER_LLMS;
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
    // The story helper on devices without WebGPU (8-bit runs best on the CPU).
    // Its single 618 MB file is over R2's 300 MB upload limit: it is fetched
    // into mirror/sources and split into files under 300 MB (see below).
    repo: "onnx-community/Qwen3-0.6B-ONNX",
    onnx: [],
    split: { file: "onnx/model_quantized.onnx", into: "onnx/model_chunked_quantized.onnx" },
  },
  {
    // Drawing recognition on every device (large's vision encoder is a single 316 MB file).
    repo: "onnx-community/Florence-2-base-ft",
    onnx: [
      "onnx/vision_encoder_q4.onnx",
      "onnx/embed_tokens_quantized.onnx",
      "onnx/encoder_model_q4.onnx",
      "onnx/decoder_model_merged_q4.onnx",
    ],
  },
  {
    // The AI cut-out (src/lib/alive/ai-segment.ts), at the revision it pins.
    repo: "xrds/isnet-general-onnx-int8",
    revision: "71eff2372ec9c8edbc6ca637ded591423d23b65a",
    onnx: ["onnx/model_quantized.onnx"],
  },
  // Kokoro voice (src/lib/ai/voice/voices.ts): the 8-bit file on every device,
  // and only the voices the app offers (PRELOADED_VOICES).
  {
    repo: "onnx-community/Kokoro-82M-v1.0-ONNX",
    onnx: ["onnx/model_quantized.onnx"],
    voices: ["af_heart", "af_bella", "af_nicole", "af_aoede", "af_kore", "af_sarah", "af_nova", "af_sky", "bf_emma"],
  },
];

const complete = (target, expectedSize) =>
  existsSync(target) && (!expectedSize || statSync(target).size === expectedSize);

// The Hugging Face CDN sometimes leaves a connection crawling at a few KB/s
// while a fresh one runs at MB/s, so a transfer that drops below 100 KB/s for
// 15 s is abandoned and resumed ("-C -") on a new connection. Unfinished files
// end in ".part", so an upload of mirror/ running meanwhile never copies a
// truncated model under its real name.
async function download(url, target, expectedSize) {
  if (complete(target, expectedSize)) return "kept";
  mkdirSync(dirname(target), { recursive: true });
  const part = `${target}.part`;
  // A partial file left under the real name by an older version of this script.
  if (existsSync(target)) renameSync(target, part);
  for (let attempt = 1; attempt <= 40; attempt++) {
    const args = ["-sSfL", "--speed-limit", "100000", "--speed-time", "15", "-o", part, url];
    if (existsSync(part)) args.unshift("-C", "-");
    try {
      await run("curl", args, { maxBuffer: 1024 * 1024 });
      if (complete(part, expectedSize)) {
        renameSync(part, target);
        return attempt === 1 ? "downloaded" : `downloaded (${attempt} tries)`;
      }
    } catch {
      // Slow or dropped: try again from where the partial file ends.
    }
  }
  throw new Error(`Gave up on ${url}`);
}

async function repoFiles(repo, revision) {
  const at = revision === "main" ? "" : `/revision/${revision}`;
  const response = await fetch(`https://huggingface.co/api/models/${repo}${at}?blobs=true`);
  if (!response.ok) throw new Error(`${repo}: HTTP ${response.status}`);
  return (await response.json()).siblings.map((s) => ({ name: s.rfilename, size: s.size }));
}

// "onnxruntime/" holds builds for ONNX Runtime GenAI, which the browser never loads.
const wanted = (name) => !name.startsWith(".") && name !== "README.md" && !name.startsWith("onnxruntime/");
const filesOf = async (repo, keep, revision = "main") =>
  (await repoFiles(repo, revision))
    .filter((f) => keep(f.name))
    .map((f) => ({
      url: `https://huggingface.co/${repo}/resolve/${revision}/${f.name}`,
      target: join(root, repo, "resolve", revision, f.name),
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
// Files only split from, never served: kept outside mirror/models, which is what R2 gets.
const sources = join(process.cwd(), "mirror", "sources");
const splits = [];
for (const { repo, split } of onnxRepos) {
  if (!split) continue;
  const [file] = await filesOf(repo, (name) => name === split.file);
  const source = join(sources, repo, split.file);
  queue.push({ ...file, target: source });
  splits.push({ source, into: join(root, repo, "resolve", "main", split.into) });
}
for (const { repo, revision, onnx, voices } of onnxRepos) {
  const keep = (name) =>
    name.startsWith("onnx/")
      ? onnx.includes(name)
      : name.startsWith("voices/") && voices
        ? voices.includes(name.slice("voices/".length, -".bin".length))
        : wanted(name);
  queue.push(...(await filesOf(repo, keep, revision)));
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

// Splits each big file into the files the app loads (scripts/split-onnx.py,
// needs Python with the "onnx" package; PYTHON=… picks the interpreter).
for (const { source, into } of splits) {
  if (existsSync(`${into}_data`) && statSync(`${into}_data`).mtimeMs > statSync(source).mtimeMs) continue;
  mkdirSync(dirname(into), { recursive: true });
  try {
    const { stdout } = await run(process.env.PYTHON ?? "python3", [join("scripts", "split-onnx.py"), source, into]);
    console.log(`split ${into.slice(root.length + 1)} into ${stdout.trim()} data files`);
  } catch (error) {
    console.error(`Could not split ${source} (pip install onnx, then run again): ${error.message}`);
    process.exitCode = 1;
  }
}
console.log(`Models mirrored into ${root}`);
