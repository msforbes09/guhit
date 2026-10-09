// Listens to every narration take with Whisper (on this computer, from the
// app's model mirror) and prints what it heard next to the approved line, so
// a clipped or garbled take is caught before it goes into the cut.
//   node scripts/check-voice.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const video = join(dirname(fileURLToPath(import.meta.url)), "..");
const ffmpeg = join(video, "node_modules", "ffmpeg-static", "ffmpeg");
const { lines } = JSON.parse(readFileSync(join(video, "public", "voice", "narration.json"), "utf8"));

const { env, pipeline } = await import("@huggingface/transformers");
const base = process.env.GUHIT_URL ?? "http://localhost:3191";
if (await fetch(`${base}/models/onnx-community/whisper-base.en/resolve/main/config.json`).then((r) => r.ok).catch(() => false)) {
  env.remoteHost = `${base}/models/`;
  env.remotePathTemplate = "{model}/resolve/{revision}/";
}
const asr = await pipeline("automatic-speech-recognition", "onnx-community/whisper-base.en", { dtype: "q8" }); // the 8-bit files are in the mirror

const norm = (s) => s.toLowerCase().replace(/\b(goo-?heet|guhit|gohit|goohit|guhi|go heat|goo heat)\b/g, "guhit").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
let bad = 0;
for (const [id, line] of Object.entries(lines)) {
  // 16 kHz mono float samples for Whisper.
  const raw = execFileSync(ffmpeg, ["-v", "error", "-i", join(video, "public", line.file), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 64 << 20 });
  const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const { text } = await asr(audio);
  const ok = norm(text) === norm(line.text);
  if (!ok) bad++;
  const wps = line.text.split(" ").length / line.seconds;
  console.log(`${ok ? "ok " : "?? "} ${id.padEnd(10)} ${line.seconds.toFixed(2)} s ${wps.toFixed(1)} w/s  heard: "${text.trim()}"`);
}
console.log(bad ? `${bad} take(s) differ from the script: listen to them` : "every take matches the script");
