/**
 * A guess loads the eyes' model, the largest memory moment of a phone's page.
 * If the browser kills the tab during one (iPhone Safari: "A problem
 * repeatedly occurred"), the next page life finds the guess still marked as
 * running and turns guessing off on this device: a missing guess is better
 * than a crash. Getting the parts again on /setup turns it back on. A hidden
 * or closed page clears the mark (as in part-guard.ts), so only a crash in
 * view counts, not a child switching apps during a slow guess.
 */
import { recordNote } from "@/lib/boot-log";

const RUNNING_KEY = "guhit:guess-running";
const OFF_KEY = "guhit:guess-off-2";
const OLD_OFF_KEY = "guhit:guess-off";
/** This page life, so a guess still running here is not mistaken for a crash. */
const PAGE = Math.random().toString(36).slice(2);
/** A guess is running in this page right now. */
let guessing = false;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Blocked storage: no guard, guesses still run.
  }
}

export function guessAllowed(): boolean {
  // Versions before 0.2.0-beta.8 also counted a page hidden during a guess as a
  // crash, so the guessing they turned off gets one more try, said in the log.
  if (read(OLD_OFF_KEY) !== null) {
    write(OLD_OFF_KEY, null);
    recordNote("Guessing had been turned off by an earlier version (a guess cut short); trying again.");
  }
  const running = read(RUNNING_KEY);
  if (running !== null && running !== PAGE) {
    write(OFF_KEY, "1");
    write(RUNNING_KEY, null);
    recordNote("A guess was running when the page stopped without closing: guessing is now off on this device.");
  }
  return read(OFF_KEY) !== "1";
}

export function guessStarted() {
  guessing = true;
  write(RUNNING_KEY, PAGE);
}

export function guessFinished() {
  guessing = false;
  write(RUNNING_KEY, null);
}

export function allowGuessesAgain() {
  write(OFF_KEY, null);
  write(RUNNING_KEY, null);
}

if (typeof window !== "undefined") {
  const hidden = () => write(RUNNING_KEY, null);
  window.addEventListener("pagehide", hidden);
  document.addEventListener("visibilitychange", () =>
    document.visibilityState === "hidden" ? hidden() : guessing && write(RUNNING_KEY, PAGE),
  );
}
