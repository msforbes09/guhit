// Shot "setup": the real /setup screen loading every on-device model from the
// local mirror. Filmed at phone width (rows big and readable) as a timelapse
// of the parts list itself (element screenshots, so the crop follows the list
// whatever its wording or position), then squeezed into footage/setup-list.mp4.
// It also saves each part's row in its finished "Ready" state
// (footage/setup-row-<n>.png) and what the screen said (footage/setup.json).
//
// It leaves the models cached in the capture profile, which every other shot
// needs. Run it on a fresh profile to film the full download:
//   node capture/setup.ts --fresh    (deletes the profile first; the normal way)
//   node capture/setup.ts            (keeps the profile: only "starting up" is filmed)
//   node capture/setup.ts --assemble (only rebuilds the clip from the last run's screenshots)
// Models come from the app's default source (Guhit's R2 copy, as users get them)
// unless `--models=local` (the dev mirror served at /models) or `--models=hf`.
// `--url=https://guhit.iam4bs.dev` films the live site instead of the local build.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP, FFPROBE, ffmpeg, flag, FOOTAGE, launch, PROFILE, sleep, WORK } from "./lib.ts";

const DEVICE = { width: 430, height: 932, scale: 3, mobile: false } as const;
const TIMELAPSE_SECONDS = 7;
const SHOT_EVERY_MS = 350;
const GIVE_UP_MS = 30 * 60 * 1000;

const dir = join(WORK, "frames", "setup");

interface Shot {
  t: number;
  file: string;
  /** Sum of the progress bars (0..400) when the shot was taken. */
  progress: number;
  /** How many parts said "Ready". */
  ready: number;
}

async function capture() {
  const { context, page } = await launch({ device: DEVICE });
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`  console: ${m.text().slice(0, 200)}`);
  });
  // "r2" resets any remembered choice to the app's default source.
  const models = flag("models") ?? "r2";
  await page.goto(`${APP}/setup?models=${encodeURIComponent(models)}`);
  console.log(`setup: filming ${APP}/setup, models from ${models}`);
  await page.locator("main ul").first().waitFor();
  // The app's launch splash covers the page for a few seconds on every load.
  await page.locator(".splash").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const start = page.locator("main button").filter({ hasText: /ready|start/i }).first();
  await start.waitFor({ timeout: 60_000 });
  const list = page.locator("main ul").first();
  const rows = list.locator(":scope > li");
  console.log(`setup: ${await rows.count()} parts`);

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const shots: Shot[] = [];
  const snap = async () => {
    const file = join(dir, `${String(shots.length).padStart(5, "0")}.jpg`);
    await list.screenshot({ path: file, type: "jpeg", quality: 92 });
    const progress = await list.locator('[role="progressbar"]').evaluateAll((els) => els.reduce((a, e) => a + Number(e.getAttribute("aria-valuenow") ?? 0), 0));
    const ready = await rows.evaluateAll((els) => els.filter((e) => /\bready\b/i.test(e.querySelector("span:last-child")?.textContent ?? "")).length);
    shots.push({ t: Date.now(), file, progress, ready });
  };

  await snap();
  await sleep(500);
  await snap();
  await start.click();
  const began = Date.now();
  let done = false;
  let failed: string | null = null;
  while (!done && Date.now() - began < GIVE_UP_MS) {
    await snap();
    // The ready card's second line only exists once every model is in and awake.
    if (await page.getByText(/Downloaded and started in|Already on this device and awake/).first().isVisible()) done = true;
    // The setup error card (Next.js also keeps an empty role=alert route announcer on the page).
    const alert = page.locator('[role="alert"].bg-red-50');
    if ((await alert.count()) && (await alert.first().isVisible())) {
      failed = (await alert.first().textContent()) || "error";
      break;
    }
    if (shots.length % 20 === 0) console.log(`  ${((Date.now() - began) / 1000).toFixed(0)} s, ${shots.length} shots`);
    await sleep(SHOT_EVERY_MS);
  }
  for (let i = 0; i < 4; i++) {
    await snap();
    await sleep(SHOT_EVERY_MS);
  }
  const seconds = (Date.now() - began) / 1000;
  console.log(failed ? `setup FAILED after ${seconds.toFixed(0)} s: ${failed}` : `setup ready in ${seconds.toFixed(0)} s`);

  // Each part, finished, as its own picture (the edit pairs them with what they do).
  mkdirSync(FOOTAGE, { recursive: true });
  const parts = [];
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const image = `setup-row-${i}.png`;
    await row.screenshot({ path: join(FOOTAGE, image) });
    parts.push({
      name: ((await row.locator("span").first().textContent()) ?? "").trim(),
      detail: ((await row.locator("p").first().textContent()) ?? "").trim(),
      image,
    });
  }
  const screenText = await page.locator("main").innerText().catch(() => "");
  await context.close();
  writeFileSync(join(dir, "shots.json"), JSON.stringify({ shots, seconds, failed, screenText, parts }));
}

if (!process.argv.includes("--assemble")) {
  if (process.argv.includes("--fresh")) rmSync(PROFILE, { recursive: true, force: true });
  await capture();
}

const { shots, seconds, failed, screenText, parts } = JSON.parse(readFileSync(join(dir, "shots.json"), "utf8")) as {
  shots: Shot[];
  seconds: number;
  failed: string | null;
  screenText: string;
  parts: { name: string; detail: string; image: string }[];
};

// Even sampling in time of the screenshots into TIMELAPSE_SECONDS at 30 fps.
const frames = TIMELAPSE_SECONDS * 30;
const t0 = shots[0].t;
const t1 = shots[shots.length - 1].t;
const picked: Shot[] = [];
for (let i = 0; i < frames; i++) {
  const want = t0 + ((t1 - t0) * i) / (frames - 1);
  let best = shots[0];
  for (const s of shots) if (Math.abs(s.t - want) < Math.abs(best.t - want)) best = s;
  picked.push(best);
}
const lines = picked.flatMap((s) => [`file '${s.file}'`, "duration 0.0333333"]);
lines.push(`file '${picked[picked.length - 1].file}'`);
writeFileSync(join(dir, "list.txt"), lines.join("\n"));
// Rows can change height as their wording changes: every frame is padded
// (top-left anchored) to the largest screenshot, on the page's paper colour.
let W = 0;
let H = 0;
for (const file of new Set(shots.map((s) => s.file))) {
  const [w, h] = execFileSync(FFPROBE, ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString().trim().split(",").map(Number);
  W = Math.max(W, w);
  H = Math.max(H, h);
}
W += W % 2;
H += H % 2;
ffmpeg([
  "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
  "-vf", `fps=30,pad=${W}:${H}:0:0:color=0xFFF8EC,format=yuv420p`,
  "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-movflags", "+faststart",
  join(FOOTAGE, "setup-list.mp4"),
]);
// Where the action is, in timelapse seconds: first bar moving, every part ready.
const at = (s: Shot) => +(((s.t - t0) / (t1 - t0)) * TIMELAPSE_SECONDS).toFixed(2);
const firstProgress = shots.find((s) => s.progress > 0) ?? shots[0];
const allReady = shots.find((s) => s.ready >= parts.length) ?? shots[shots.length - 1];
writeFileSync(
  join(FOOTAGE, "setup.json"),
  JSON.stringify(
    {
      name: "setup",
      clip: "setup-list.mp4",
      width: W,
      height: H,
      app: APP,
      models: flag("models") ?? "r2",
      realSeconds: +seconds.toFixed(1),
      ok: !failed,
      failed,
      timelapseSeconds: TIMELAPSE_SECONDS,
      marks: { firstProgress: at(firstProgress), allReady: at(allReady) },
      parts,
      screenText,
    },
    null,
    2,
  ),
);
console.log(`→ ${join(FOOTAGE, "setup-list.mp4")} (${W}x${H}), parts: ${parts.map((p) => p.name).join(", ")}`);
if (failed) process.exit(1);
