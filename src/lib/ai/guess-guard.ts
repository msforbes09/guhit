/**
 * A guess loads the eyes' model, the largest memory moment of a phone's page.
 * If the browser kills the tab during one (iPhone Safari: "A problem
 * repeatedly occurred"), the next page life finds the guess still marked as
 * running. A crash on the full eyes (Florence-2) moves this device to the
 * light eyes (light-eyes.ts) for good; only a crash on the light eyes turns
 * guessing off, since a missing guess is better than a crash. Getting the
 * parts again on /setup turns it back on. A hidden or closed page clears the
 * mark (as in part-guard.ts), so only a crash in view counts, not a child
 * switching apps during a slow guess.
 */
import { recordNote } from "@/lib/boot-log";
import { LIGHT_VISION } from "./models";

/** "<page> <model>" while a guess runs; beta.9 and older wrote the page alone (always the full eyes). */
const RUNNING_KEY = "guhit:guess-running";
/** Set by 0.2.0-beta.8 and beta.9 after a crash on the full eyes: now means "use the light eyes". */
const FULL_OFF_KEY = "guhit:guess-off-2";
const OLD_OFF_KEY = "guhit:guess-off";
const LIGHT_KEY = "guhit:light-eyes";
const OFF_KEY = "guhit:guess-off-3";
/** This page life, so a guess still running here is not mistaken for a crash. */
const PAGE = Math.random().toString(36).slice(2);
/** The model of the guess running in this page right now, or null. */
let guessing: string | null = null;

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

/** A guess on the full eyes was cut short here once: this device guesses with the light eyes. */
export function lightEyesChosen(): boolean {
  return read(LIGHT_KEY) === "1";
}

export function guessAllowed(): boolean {
  // Versions before 0.2.0-beta.8 also counted a page hidden during a guess as a
  // crash, so the guessing they turned off gets one more try, said in the log.
  if (read(OLD_OFF_KEY) !== null) {
    write(OLD_OFF_KEY, null);
    recordNote("Guessing had been turned off by an earlier version (a guess cut short); trying again.");
  }
  if (read(FULL_OFF_KEY) !== null) {
    write(FULL_OFF_KEY, null);
    write(LIGHT_KEY, "1");
    recordNote("Guessing had been turned off after a guess was cut short; trying again with the light eyes.");
  }
  const running = read(RUNNING_KEY);
  if (running !== null && running.split(" ")[0] !== PAGE) {
    write(RUNNING_KEY, null);
    if (running.split(" ")[1] === LIGHT_VISION) {
      write(OFF_KEY, "1");
      recordNote("A guess with the light eyes was running when the page stopped without closing: guessing is now off on this device.");
    } else {
      write(LIGHT_KEY, "1");
      recordNote("A guess was running when the page stopped without closing: this device now guesses with the light eyes.");
    }
  }
  return read(OFF_KEY) !== "1";
}

export function guessStarted(model: string) {
  guessing = model;
  write(RUNNING_KEY, `${PAGE} ${model}`);
}

export function guessFinished() {
  guessing = null;
  write(RUNNING_KEY, null);
}

/** Setup: guessing comes back on, still with the light eyes if the full ones were cut short. */
export function allowGuessesAgain() {
  write(OFF_KEY, null);
  write(RUNNING_KEY, null);
}

if (typeof window !== "undefined") {
  const hidden = () => write(RUNNING_KEY, null);
  window.addEventListener("pagehide", hidden);
  document.addEventListener("visibilitychange", () =>
    document.visibilityState === "hidden" ? hidden() : guessing && write(RUNNING_KEY, `${PAGE} ${guessing}`),
  );
}
