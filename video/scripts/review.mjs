// Review a render: prints its duration/size/codecs, writes the edit (scene
// and narration times), pulls frames every 0.5 s plus one either side of
// every cut, and makes a contact sheet of ~24 frames.
//
//   node scripts/review.mjs [16x9|9x16]
//   → out/edit.json, out/frames-<ratio>/*.jpg, out/contact-<ratio>.png
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const video = join(dirname(fileURLToPath(import.meta.url)), "..");
const ratio = process.argv[2] ?? "16x9";
const mp4 = join(video, "out", `guhit-60s-${ratio}.mp4`);
const ffmpeg = join(video, "node_modules", "ffmpeg-static", "ffmpeg");
const ffprobe = join(video, "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe");

// The edit, straight from src/timeline.ts.
const tmp = join(video, "out", ".timeline.mjs");
await build({ entryPoints: [join(video, "src", "timeline.ts")], bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "error" });
const { EDIT, TOTAL_FRAMES } = await import(`${tmp}?${Date.now()}`);
rmSync(tmp);
writeFileSync(join(video, "out", "edit.json"), JSON.stringify({ totalFrames: TOTAL_FRAMES, ...EDIT }, null, 2));
console.log("Scenes:");
for (const s of EDIT.scenes) console.log(`  ${s.from.toFixed(2).padStart(6)}–${(s.from + s.dur).toFixed(2).padEnd(6)} ${s.id}`);
console.log("Narration:");
for (const c of EDIT.cues) console.log(`  ${c.at.toFixed(2).padStart(6)}–${(c.at + c.seconds).toFixed(2).padEnd(6)} ${c.text}`);

const probe = execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels", "-of", "default=nw=1", mp4]).toString();
console.log(`\n${mp4}\n${probe}`);
const duration = Number(/duration=([\d.]+)/.exec(probe)[1]);

// Frames: every 0.5 s, and 2 frames before / 2 after every cut.
const dir = join(video, "out", `frames-${ratio}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const times = new Set();
for (let t = 0; t < duration - 0.02; t += 0.5) times.add(+t.toFixed(3));
for (const s of EDIT.scenes.slice(1)) {
  times.add(+Math.max(0, s.from - 2 / 30).toFixed(3));
  times.add(+(s.from + 2 / 30).toFixed(3));
}
const sorted = [...times].sort((a, b) => a - b);
for (const t of sorted) {
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-q:v", "3", join(dir, `t${t.toFixed(3).padStart(7, "0")}.jpg`)]);
}
console.log(`${sorted.length} frames → ${dir}`);

// Review grids: every extracted frame, 20 per sheet, labelled with its time.
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
const tw = ratio === "16x9" ? 384 : 216;
const th = ratio === "16x9" ? 216 : 384;
const gcols = ratio === "16x9" ? 5 : 10;
const per = 20;
for (const f of readdirSync(join(video, "out")).filter((f) => f.startsWith(`review-${ratio}-`))) rmSync(join(video, "out", f));
for (let g = 0; g * per < sorted.length; g++) {
  const chunk = sorted.slice(g * per, (g + 1) * per);
  const args = [];
  let graph = "";
  chunk.forEach((t, i) => {
    args.push("-i", join(dir, `t${t.toFixed(3).padStart(7, "0")}.jpg`));
    graph += `[${i}:v]scale=${tw}:${th},drawtext=fontfile=${FONT}:text='${t.toFixed(2)}':x=w-tw-6:y=h-th-6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6[s${i}];`;
  });
  const lay = chunk.map((_, i) => `${(i % gcols) * tw}_${Math.floor(i / gcols) * th}`).join("|");
  graph += chunk.map((_, i) => `[s${i}]`).join("") + (chunk.length > 1 ? `xstack=inputs=${chunk.length}:layout=${lay}:fill=black` : "null");
  execFileSync(ffmpeg, ["-v", "error", "-y", ...args, "-filter_complex", graph, "-frames:v", "1", join(video, "out", `review-${ratio}-${String(g).padStart(2, "0")}.png`)]);
}
console.log(`review grids → out/review-${ratio}-*.png`);

// Audio: peak and loudness (clipping check).
const audio = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-i", mp4, "-af", "volumedetect,ebur128=peak=true", "-vn", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const pick = (re) => [...audio.matchAll(new RegExp(re.source, "g"))].pop()?.[1];
console.log(`audio: max ${pick(/max_volume: ([-\d.]+ dB)/)}, mean ${pick(/mean_volume: ([-\d.]+ dB)/)}, integrated ${pick(/I:\s+([-\d.]+ LUFS)/)}, true peak ${pick(/Peak:\s+([-\d.]+ dBFS)/)}`);

// Contact sheet: 24 frames, evenly through the cut.
const n = 24;
const cols = ratio === "16x9" ? 4 : 6;
const thumbW = ratio === "16x9" ? 480 : 270;
const picks = Array.from({ length: n }, (_, i) => +(((i + 0.5) / n) * duration).toFixed(3));
const inputs = [];
for (const [i, t] of picks.entries()) {
  const file = join(dir, `sheet-${String(i).padStart(2, "0")}.jpg`);
  execFileSync(ffmpeg, [
    "-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1",
    "-vf", `scale=${thumbW}:-2,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='${t.toFixed(1)}s':x=w-tw-8:y=h-th-8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=4`,
    file,
  ]);
  inputs.push(file);
}
const rows = n / cols;
const layout = Array.from({ length: n }, (_, i) => `${(i % cols) === 0 ? "0" : Array.from({ length: i % cols }, (_, k) => `w${k}`).join("+")}_${Math.floor(i / cols) === 0 ? "0" : Array.from({ length: Math.floor(i / cols) }, (_, k) => `h${k * cols}`).join("+")}`).join("|");
const sheet = join(video, "out", `contact-${ratio}.png`);
execFileSync(ffmpeg, ["-v", "error", "-y", ...inputs.flatMap((f) => ["-i", f]), "-filter_complex", `xstack=inputs=${n}:layout=${layout}`, sheet]);
for (const f of readdirSync(dir).filter((f) => f.startsWith("sheet-"))) rmSync(join(dir, f));
console.log(`contact sheet (${cols}x${rows}) → ${sheet}`);
