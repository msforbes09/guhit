// Shot "setup": the real /setup screen loading every on-device model from the
// local mirror, recorded as a timelapse (one screenshot every half second),
// then squeezed into footage/setup.mp4 (TIMELAPSE_SECONDS long, 30 fps).
//
// It also leaves the models cached in the capture profile, which every other
// shot needs. Run it on a fresh profile to film the full download:
//   node capture/setup.ts            (keeps the profile if it exists)
//   node capture/setup.ts --fresh    (deletes the profile first)
//   node capture/setup.ts --assemble (only rebuilds footage/setup.mp4 from the last run's screenshots)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP, ffmpeg, FOOTAGE, LAPTOP, launch, PROFILE, sleep, WORK } from "./lib.ts";

const TIMELAPSE_SECONDS = 7;
const SHOT_EVERY_MS = 500;
const GIVE_UP_MS = 30 * 60 * 1000;

const dir = join(WORK, "frames", "setup");

async function capture() {
  const { context, page } = await launch({ device: LAPTOP });
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`  console: ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${APP}/setup?models=local`);
  await page.getByRole("heading", { name: "Get Guhit ready" }).waitFor();
  // The app's launch splash covers the page for a few seconds on every load.
  await page.locator(".splash").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const start = page.getByRole("button", { name: /Get Guhit ready|Start Guhit/ });
  await start.waitFor({ timeout: 60_000 });
  console.log(`setup: ${await page.locator("p.text-sm").first().textContent()}`);

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const shots: { t: number; file: string }[] = [];
  const snap = async () => {
    const file = join(dir, `${String(shots.length).padStart(5, "0")}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 92 });
    shots.push({ t: Date.now(), file });
  };

  await snap();
  await sleep(600);
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
// Hold on the finished screen.
for (let i = 0; i < 4; i++) {
  await snap();
  await sleep(SHOT_EVERY_MS);
}
const seconds = (Date.now() - began) / 1000;
console.log(failed ? `setup FAILED after ${seconds.toFixed(0)} s: ${failed}` : `setup ready in ${seconds.toFixed(0)} s`);
const setupText = await page.locator("main").innerText().catch(() => "");
await context.close();
writeFileSync(join(dir, "shots.json"), JSON.stringify({ shots, seconds, failed, setupText }));
}


if (!process.argv.includes("--assemble")) {
  if (process.argv.includes("--fresh")) rmSync(PROFILE, { recursive: true, force: true });
  await capture();
}

const { shots, seconds, failed, setupText } = JSON.parse(readFileSync(join(dir, "shots.json"), "utf8")) as {
  shots: { t: number; file: string }[];
  seconds: number;
  failed: string | null;
  setupText: string;
};
// Even sampling of the screenshots into TIMELAPSE_SECONDS at 30 fps.
const frames = TIMELAPSE_SECONDS * 30;
const list = [];
for (let i = 0; i < frames; i++) {
  const shot = shots[Math.min(shots.length - 1, Math.round((i / (frames - 1)) * (shots.length - 1)))];
  list.push(`file '${shot.file}'`, "duration 0.0333333");
}
list.push(`file '${shots[shots.length - 1].file}'`);
writeFileSync(join(dir, "list.txt"), list.join("\n"));
mkdirSync(FOOTAGE, { recursive: true });
ffmpeg([
  "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
  "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
  "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-movflags", "+faststart",
  join(FOOTAGE, "setup.mp4"),
]);
writeFileSync(
  join(FOOTAGE, "setup.json"),
  JSON.stringify({ name: "setup", realSeconds: +seconds.toFixed(1), ok: !failed, failed, timelapseSeconds: TIMELAPSE_SECONDS, shots: shots.length, screenText: setupText }, null, 2),
);
console.log(`→ ${join(FOOTAGE, "setup.mp4")}`);
if (failed) process.exit(1);
