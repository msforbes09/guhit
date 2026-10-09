// Shot "hero" (phone, 430x932 @2x): the real flow with Tala the dragon.
// Camera viewfinder → Snap → cut-out → "Is this your friend?" → meadow →
// the drawing guesses what it is (Florence-2) → named Tala → says hello
// (Qwen3 + Kokoro) → hold to talk ("Tala, can you fly?", Whisper) → answer.
//
// A warm-up pass runs first, off camera, so every model is awake before the
// recorded pass (the app loads them when the snap screen opens).
//   node capture/hero.ts
import { acceptFriend, clearFriends, debugShot, resetDatabase, nameAndSave, url, waitGuess, waitPreview, waitReplyShown, waitTalkReady } from "./app.ts";
import { launch, PHONE, Recorder, sleep } from "./lib.ts";
import { cameraFile, makeMedia, MIC_FILE } from "./make-media.ts";

const NAME = "Tala";

makeMedia(["tala-dragon"]);
const { context, page } = await launch({ device: PHONE, camera: cameraFile("tala-dragon"), mic: MIC_FILE });
const rec = new Recorder(page, "hero");
await Recorder.tapAudio(page, (clip) => rec.addClip(clip));
// A phone's back camera: the app shows it unmirrored and snaps at once
// (a laptop webcam would get a mirrored preview and a 3-2-1 countdown).
await page.addInitScript(() => {
  const settings = MediaStreamTrack.prototype.getSettings;
  MediaStreamTrack.prototype.getSettings = function (this: MediaStreamTrack) {
    const s = settings.call(this);
    return this.kind === "video" ? { ...s, facingMode: "environment" } : s;
  };
});
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`  console.${m.type()}: ${m.text().slice(0, 160)}`);
});

const snapButton = page.getByRole("button", { name: "Snap the photo" });

async function snapAndMeet(record: boolean) {
  await snapButton.and(page.locator(":not([disabled])")).waitFor({ timeout: 60_000 });
  if (record) {
    await rec.start();
    await sleep(2600);
    rec.mark("snap");
  }
  await snapButton.click();
  await waitPreview(page);
  if (record) {
    rec.mark("preview");
    await sleep(3800);
    rec.mark("accept");
  }
  await acceptFriend(page);
  if (record) rec.mark("meet");
  const guess = await waitGuess(page, 45_000);
  if (record) rec.mark(guess ? "guess" : "no-guess");
  console.log(`  guess: ${guess ?? "(none: asked instead)"}`);
  return guess;
}

try {
  // ---- Warm-up (not recorded): wakes the models, proves the guess works.
  await resetDatabase(page);
  await page.goto(url("/snap"));
  let guess = await snapAndMeet(false);
  for (let tries = 0; !guess && tries < 2; tries++) {
    console.log("  warm-up: no guess yet, trying again");
    await page.goto(url("/snap"));
    await clearFriends(page);
    await sleep(20_000);
    guess = await snapAndMeet(false);
  }
  if (!guess) throw new Error("The drawing reader never answered; is /setup done in this profile?");

  // Back to the snap screen without reloading (the engine stays awake).
  await clearFriends(page);
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("link", { name: /Bring a drawing to life/ }).click();
  await page.waitForURL(/\/snap/);
  await sleep(1500);

  // ---- Recorded pass.
  guess = await snapAndMeet(true);
  await sleep(5200); // the drawing asks "Am I …?" out loud
  rec.mark("yes");
  await page.getByRole("button", { name: "Yes!" }).click();
  await nameAndSave(page, NAME);
  rec.mark("talk");
  await waitTalkReady(page, NAME);
  await waitReplyShown(page); // its own hello, out loud
  rec.mark("greeted");
  const greeting = await page.locator("p.font-display.leading-snug").last().textContent().catch(() => null);
  await sleep(1800);

  const mic = page.getByRole("button", { name: `Talk to ${NAME}` });
  const box = await mic.boundingBox();
  if (!box) throw new Error("No mic button");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  rec.mark("hold");
  await page.mouse.down();
  await sleep(3000);
  await page.mouse.up();
  rec.mark("release");
  // Heard (Whisper) → thinking (Qwen3) → speaking (Kokoro) → done.
  await page.getByText("You said:").waitFor({ timeout: 60_000 });
  rec.mark("heard");
  await page.getByRole("button", { name: "Hear it again" }).waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  await waitReplyShown(page);
  rec.mark("replied");
  const said = await page.getByText("You said:").locator("xpath=..").textContent().catch(() => null);
  const reply = await page.locator("p.font-display.leading-snug").last().textContent().catch(() => null);
  await sleep(2500);
  // The real words on screen, so the edit can show them large.
  const meta = await rec.stop({ texts: { guess, greeting, said: said?.replace(/^You said:\s*/, "") ?? null, reply } });
  console.log(JSON.stringify({ guess, said, reply, marks: meta.marks }, null, 2));
} catch (error) {
  await debugShot(page, "hero");
  await context.close();
  throw error;
}
await context.close();
