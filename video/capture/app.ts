// App helpers for the capture shots: friends on the device, waiting for the
// on-device engine, and the snap → cut-out → meet → talk steps.
import type { Page } from "playwright";
import { APP, sleep, WORK } from "./lib.ts";

/**
 * Deletes the app's IndexedDB ("guhit") from a plain static file on the same
 * origin, where no app code holds it open. The app recreates it on next load.
 */
export async function resetDatabase(page: Page) {
  await page.goto(`${APP}/icons/favicon.svg`);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const del = indexedDB.deleteDatabase("guhit");
        del.onsuccess = () => resolve();
        del.onerror = () => reject(del.error);
        del.onblocked = () => reject(new Error("guhit database is open elsewhere"));
      }),
  );
}

/** Empties the friend shelf while the app is open (creates the stores as the app does if they are missing). */
export async function clearFriends(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("guhit", 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("friends")) db.createObjectStore("friends", { keyPath: "id" });
          if (!db.objectStoreNames.contains("stories")) db.createObjectStore("stories", { keyPath: "id" }).createIndex("characterId", "character.id");
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["friends", "stories"], "readwrite");
          tx.objectStore("friends").clear();
          tx.objectStore("stories").clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

/** Changes fields of a saved friend (used only to pick how a quick-cut friend moves). */
export async function patchFriend(page: Page, id: string, patch: Record<string, unknown>) {
  await page.evaluate(
    ({ id, patch }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("guhit");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("friends", "readwrite");
          const store = tx.objectStore("friends");
          const get = store.get(id);
          get.onsuccess = () => store.put({ ...get.result, ...patch, updatedAt: Date.now() });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { id, patch },
  );
}

/** The app plays its launch splash on every full page load; wait until it has gone. */
export async function waitSplashGone(page: Page) {
  await page.locator(".splash").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
}

export const friendIdFromUrl = (page: Page) => new URL(page.url()).searchParams.get("id") ?? "";

/** Snap screen with a photo from a file (the "Use a photo" path). */
export async function snapFromFile(page: Page, file: string) {
  await page.locator('input[type="file"]').setInputFiles(file);
}

/** Waits until the cut-out preview is up. */
export async function waitPreview(page: Page) {
  await page.getByRole("heading", { name: "Is this your friend?" }).waitFor({ timeout: 90_000 });
}

export async function acceptFriend(page: Page) {
  await page.getByRole("button", { name: /Yes, that's my friend!/ }).click();
  // A client-side route change: poll the address rather than wait for a page load.
  for (let i = 0; i < 300 && !page.url().includes("/friend?id="); i++) await sleep(100);
  if (!page.url().includes("/friend?id=")) throw new Error(`Still on ${page.url()} after accepting`);
}

/** Saves a screenshot of the page to .capture/debug-<label>.png (for failed runs). */
export async function debugShot(page: Page, label: string) {
  const file = `${WORK}/debug-${label}.png`;
  await page.screenshot({ path: file }).catch(() => {});
  console.log(`  debug screenshot → ${file}`);
}

/** On the meet screen: waits for the drawing's guess (real AI), or null if it asked instead. */
export async function waitGuess(page: Page, timeout = 30_000): Promise<string | null> {
  const guess = page.getByRole("heading", { name: /^Is that / });
  const ask = page.getByRole("heading", { name: "Tell me who this is!" });
  const which = await Promise.race([
    guess.waitFor({ timeout }).then(() => "guess" as const),
    ask.waitFor({ timeout }).then(() => "ask" as const),
  ]).catch(() => null);
  if (which !== "guess") return null;
  return ((await guess.textContent()) ?? "").replace(/^Is that /, "").replace(/\?$/, "");
}

/** Types into the meet screen's text box and sends it. */
export async function typeMeet(page: Page, words: string) {
  const box = page.locator("#meet-typed");
  await box.waitFor();
  await box.click();
  await box.pressSequentially(words, { delay: 70 });
  await page.getByRole("button", { name: "OK" }).click();
}

/** Finishes meeting: names the friend and saves (lands on the talk screen). */
export async function nameAndSave(page: Page, name: string) {
  await page.getByRole("heading", { name: "What's my name?" }).waitFor();
  await typeMeet(page, name);
  await page.getByRole("heading", { name: "Did I get it right?" }).waitFor();
  await sleep(900);
  await page.getByRole("button", { name: /Yes! Let's talk/ }).click();
}

/** The talk screen's mic button is enabled once the engine is awake. */
export async function waitTalkReady(page: Page, name: string, timeout = 180_000) {
  await page.getByRole("button", { name: `Talk to ${name}` }).and(page.locator(":not([disabled])")).waitFor({ timeout });
}

/** Waits for the character to be idle again after speaking (no "is thinking"/speaking bubble). */
export async function waitReplyShown(page: Page, timeout = 90_000) {
  await page.getByRole("button", { name: "Hear it again" }).waitFor({ timeout });
}

export const url = (path: string) => `${APP}${path}`;
