/**
 * A guess loads the eyes' model, the largest memory moment of a phone's page.
 * If the browser kills the tab during one (iPhone Safari: "A problem
 * repeatedly occurred"), the next page life finds the guess still marked as
 * running, with the step it had reached. A crash on the full eyes (Florence-2)
 * moves this device to the light eyes (light-eyes.ts) for good. A crash on the
 * light eyes only counts: the next guess tries again, and after two in a row
 * guessing rests until the app is opened again (guess-crash.ts). Getting the
 * parts again on /setup also turns it back on. A hidden or closed page clears
 * the mark (as in part-guard.ts), so only a crash in view counts, not a child
 * switching apps during a slow guess.
 */
import { recordNote } from "@/lib/boot-log";
import { judgeLeftover, runningMark } from "./guess-crash";
import { LIGHT_VISION } from "./models";

/** "<page> <model> <step>" while a guess runs (0.2.2 and older left out the step). */
const RUNNING_KEY = "guhit:guess-running";
/** Set by 0.2.0-beta.8 and beta.9 after a crash on the full eyes: now means "use the light eyes". */
const FULL_OFF_KEY = "guhit:guess-off-2";
const OLD_OFF_KEY = "guhit:guess-off";
const LIGHT_KEY = "guhit:light-eyes";
/** Set by 0.2.2 and older after one light-eyes crash: guessing off for good. Cleared once by 0.2.3. */
const OFF_KEY = "guhit:guess-off-3";
/** Light-eyes guesses cut short in a row. */
const CRASHES_KEY = "guhit:light-eyes-crashes";
/** This page life, so a guess still running here is not mistaken for a crash. */
const PAGE = Math.random().toString(36).slice(2);
/** The guess running in this page right now, or null. */
let guessing: { model: string; stage: string } | null = null;
/** Two light-eyes guesses in a row were cut short: none in this page life. */
let resting = false;

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
  if (read(OFF_KEY) !== null) {
    write(OFF_KEY, null);
    recordNote("Guessing had been turned off on this device after one guess with the light eyes was cut short; trying again.");
  }
  const crashes = Number(read(CRASHES_KEY)) || 0;
  const leftover = judgeLeftover(read(RUNNING_KEY), PAGE, LIGHT_VISION, crashes);
  if (leftover.kind !== "none") write(RUNNING_KEY, null);
  const step = leftover.kind === "none" ? "" : leftover.stage || "an unknown step";
  if (leftover.kind === "full-eyes") {
    write(LIGHT_KEY, "1");
    recordNote(`A guess was running (${step}) when the page stopped without closing: this device now guesses with the light eyes.`);
  } else if (leftover.kind === "retry") {
    write(CRASHES_KEY, String(leftover.crashes));
    recordNote(`A guess with the light eyes was running (${step}) when the page stopped without closing: the next guess tries again.`);
  } else if (leftover.kind === "rest") {
    write(CRASHES_KEY, null);
    resting = true;
    recordNote(`Two guesses in a row with the light eyes were cut short (the last at: ${step}): no guesses until the app is opened again.`);
  }
  return !resting;
}

export function guessStarted(model: string) {
  guessing = { model, stage: "starting" };
  write(RUNNING_KEY, runningMark(PAGE, model, guessing.stage));
}

/** Kept with the mark, so a crash's note says which step was running. */
export function guessStage(stage: string) {
  if (!guessing) return;
  guessing.stage = stage;
  write(RUNNING_KEY, runningMark(PAGE, guessing.model, stage));
}

/** The guess ended without the page stopping, so light-eyes crashes are no longer in a row. */
export function guessFinished() {
  guessing = null;
  write(RUNNING_KEY, null);
  write(CRASHES_KEY, null);
}

/** Setup: guessing comes back on, still with the light eyes if the full ones were cut short. */
export function allowGuessesAgain() {
  resting = false;
  write(OFF_KEY, null);
  write(CRASHES_KEY, null);
  write(RUNNING_KEY, null);
}

if (typeof window !== "undefined") {
  const hidden = () => write(RUNNING_KEY, null);
  window.addEventListener("pagehide", hidden);
  document.addEventListener("visibilitychange", () =>
    document.visibilityState === "hidden" ? hidden() : guessing && write(RUNNING_KEY, runningMark(PAGE, guessing.model, guessing.stage)),
  );
}
