// Two-pass EBU R128 normalisation (constant gain, no pumping at the start of a
// clip): measure, then apply. Used for the narration lines and the friend's
// voice in the footage, so every voice in the mix sits at the same level.
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FFMPEG = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "ffmpeg-static", "ffmpeg");
const TARGET = "I=-16:TP=-1.5:LRA=11";

/** The loudnorm filter for `input`, with its own measurements (linear mode). */
export function loudnormFilter(input) {
  const pass1 = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", input, "-vn", "-af", `loudnorm=${TARGET}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(pass1.slice(pass1.lastIndexOf("{"), pass1.lastIndexOf("}") + 1));
  return `loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

/** Normalises an audio file in place (wav stays wav, mp3 stays mp3). */
export function normalizeFile(file) {
  const tmp = file.replace(/(\.\w+)$/, ".tmp$1");
  const codec = file.endsWith(".mp3") ? ["-c:a", "libmp3lame", "-b:a", "192k"] : ["-c:a", "pcm_s16le"];
  execFileSync(FFMPEG, ["-v", "error", "-y", "-i", file, "-af", loudnormFilter(file), "-ar", "48000", ...codec, tmp]);
  execFileSync("mv", [tmp, file]);
}
