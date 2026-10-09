// Hook-line samples in several ElevenLabs voices, to choose the narrator.
//   node --env-file=<key file> scripts/voice-samples.mjs --list
//   node --env-file=<key file> scripts/voice-samples.mjs <name>=<voiceId> ...
// → out/voice-samples/<name>.mp3 (never prints the key)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const video = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("No ELEVENLABS_API_KEY in the environment");
const api = (path, init = {}) => fetch(`https://api.elevenlabs.io${path}`, { ...init, headers: { "xi-api-key": key, ...(init.headers ?? {}) } });
const args = process.argv.slice(2);
const model = args.find((a) => a.startsWith("--model="))?.slice(8) ?? "eleven_v3";

if (args.includes("--list")) {
  const models = await (await api("/v1/models")).json();
  console.log("models:", Array.isArray(models) ? models.map((m) => m.model_id).join(", ") : `unavailable (${JSON.stringify(models).slice(0, 120)})`);
  const { voices } = await (await api("/v1/voices")).json();
  for (const v of voices) console.log(`${v.voice_id}  ${v.name}  ${JSON.stringify(v.labels ?? {})}`);
  process.exit(0);
}

const out = join(video, "out", "voice-samples");
mkdirSync(out, { recursive: true });
const text = args.find((a) => a.startsWith("--text="))?.slice(7) ?? "What if every drawing had a friend inside?";
for (const pair of args.filter((a) => a.includes("=") && !a.startsWith("--"))) {
  const [name, id] = pair.split("=");
  const res = await api(`/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
  });
  if (!res.ok) {
    console.log(`${name}: ElevenLabs ${res.status} ${(await res.text()).slice(0, 160)}`);
    continue;
  }
  const file = join(out, `${name}.mp3`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${name} (${id}, ${model}) → ${file}`);
}
