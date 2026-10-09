// Fake camera and microphone media for the capture browser:
// - <drawing>.y4m: the sample drawing on paper on a wooden table, as a
//   hand-held phone camera sees it from above (rendered by the Remotion
//   composition "CameraFeed"; 3 s loop with a gentle drift back to its start);
// - ask.wav: the child's push-to-talk question, spoken by macOS `say`
//   (only Whisper hears it; it is not in the video's sound).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ffmpeg, MEDIA, VIDEO } from "./lib.ts";

export const QUESTION = "Tala, can you fly?";

export function cameraFile(drawing: string) {
  return join(MEDIA, `${drawing}.y4m`);
}
export const MIC_FILE = join(MEDIA, "ask.wav");

export function makeMedia(drawings: string[]) {
  mkdirSync(MEDIA, { recursive: true });
  for (const drawing of drawings) {
    const out = cameraFile(drawing);
    if (existsSync(out)) continue;
    const src = join(MEDIA, `${drawing}-camera.png`);
    if (!existsSync(src)) {
      execFileSync(join(VIDEO, "node_modules", ".bin", "remotion"), ["still", "src/index.ts", "CameraFeed", src, "--image-format=png", `--props=${JSON.stringify({ drawing })}`], {
        cwd: VIDEO,
        stdio: "inherit",
      });
    }
    const loop = 90;
    ffmpeg([
      "-loop", "1", "-i", src,
      "-vf",
      [
        "scale=1080:1440",
        `zoompan=z=1.04:d=1:s=960x1280:fps=30:x='(iw-iw/zoom)/2+10*sin(2*PI*on/${loop})':y='(ih-ih/zoom)/2+8*sin(2*PI*on/${loop}+1.1)'`,
        "format=yuv420p",
      ].join(","),
      "-frames:v", String(loop), "-f", "yuv4mpegpipe", out,
    ]);
    console.log(`camera → ${out}`);
  }
  if (!existsSync(MIC_FILE)) {
    const raw = join(MEDIA, "ask-raw.aiff");
    execFileSync("say", ["-v", "Samantha", "-r", "165", "-o", raw, QUESTION]);
    // Half a second of quiet first: the mic takes a moment to open.
    ffmpeg(["-i", raw, "-af", "adelay=500,apad=pad_dur=1", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", MIC_FILE]);
    console.log(`mic → ${MIC_FILE}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) makeMedia(["tala-dragon"]);
