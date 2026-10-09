// Narration, one audio file per line (src/narration.json) into
// public/voice/narration/<id>.mp3|.wav, plus public/voice/narration.json
// (engine, file, seconds) that the video reads for timing.
//
// With an ElevenLabs key (the narrator voice):
//   node --env-file=.env scripts/voice.mjs
//   (.env holds ELEVENLABS_API_KEY and ELEVENLABS_VOICE_NARRATOR; it is never committed)
// Without one, Kokoro-82M (af_heart, the app's narrator voice) makes
// placeholder lines on this computer:
//   node scripts/voice.mjs
// Options: --only=hook,talk   (just these ids)   --kokoro   (placeholders even with a key)
//          --speed=0.85         (ElevenLabs pace, 0.7–1.2)
// Then: node scripts/check-voice.mjs   (Whisper listens to every take)
// Kokoro's model comes from the app's local mirror served by capture/serve-app.mjs
// (GUHIT_URL, default http://localhost:3191) and falls back to Hugging Face.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeFile } from "./loudnorm.mjs";

const video = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(video, "public", "voice", "narration");
const manifestPath = join(video, "public", "voice", "narration.json");
const { lines } = JSON.parse(readFileSync(join(video, "src", "narration.json"), "utf8"));

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const forceKokoro = args.includes("--kokoro");
const key = process.env.ELEVENLABS_API_KEY;
const voiceId = args.find((a) => a.startsWith("--voice="))?.slice(8) || process.env.ELEVENLABS_VOICE_NARRATOR || "0AqGYCQmBK5Md93Th9nF";
const modelId = args.find((a) => a.startsWith("--model="))?.slice(8) || "eleven_multilingual_v2";
const engine = key && !forceKokoro ? "elevenlabs" : "kokoro";
// ElevenLabs reading pace (0.7–1.2): the brief asks for warm and unhurried.
const speed = Number(args.find((a) => a.startsWith("--speed="))?.slice(8) ?? 0.85);

const ffprobe = join(video, "node_modules", "@remotion", `compositor-${process.platform}-${process.arch}`, "ffprobe");

const seconds = (file) =>
  Number(execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { cwd: dirname(ffprobe) }).toString().trim());

mkdirSync(outDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { lines: {} };

async function elevenlabs(line, i) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: line.say ?? line.text,
      model_id: modelId,
      // Neighbouring lines keep the read flowing like one take.
      // eleven_v3 takes no neighbouring-text context.
      previous_text: modelId === "eleven_v3" ? undefined : lines[i - 1]?.say ?? lines[i - 1]?.text,
      next_text: modelId === "eleven_v3" ? undefined : lines[i + 1]?.say ?? lines[i + 1]?.text,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} for "${line.id}": ${(await res.text()).slice(0, 200)}`);
  const file = join(outDir, `${line.id}.mp3`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

let kokoro = null;
async function kokoroLine(line) {
  if (!kokoro) {
    const { env } = await import("@huggingface/transformers");
    const base = process.env.GUHIT_URL ?? "http://localhost:3191";
    const mirrorUp = await fetch(`${base}/models/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/config.json`)
      .then((r) => r.ok)
      .catch(() => false);
    if (mirrorUp) {
      env.remoteHost = `${base}/models/`;
      env.remotePathTemplate = "{model}/resolve/{revision}/";
    }
    const { KokoroTTS } = await import("kokoro-js");
    kokoro = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
  }
  // The app's narrator: af_heart at a slightly unhurried 0.95.
  const audio = await kokoro.generate(line.say ?? line.text, { voice: "af_heart", speed: 0.95 });
  const file = join(outDir, `${line.id}.wav`);
  await audio.save(file);
  return file;
}

for (const [i, line] of lines.entries()) {
  if (only && !only.includes(line.id)) continue;
  for (const ext of ["mp3", "wav"]) rmSync(join(outDir, `${line.id}.${ext}`), { force: true });
  const file = engine === "elevenlabs" ? await elevenlabs(line, i) : await kokoroLine(line);
  // Every line at the same loudness (-16 LUFS), so the mix stays even.
  normalizeFile(file);
  const s = seconds(file);
  manifest.lines[line.id] = { text: line.text, engine, file: `voice/narration/${file.split("/").pop()}`, seconds: +s.toFixed(3) };
  console.log(`${line.id.padEnd(10)} ${engine.padEnd(10)} ${s.toFixed(2)} s  ${line.text}`);
}
manifest.generatedAt = new Date().toISOString();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`→ ${manifestPath}`);
