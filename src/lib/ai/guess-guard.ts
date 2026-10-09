/**
 * A guess loads the eyes' model, the largest memory moment of a phone's page.
 * If the browser kills the tab during one (iPhone Safari: "A problem
 * repeatedly occurred"), the next page life finds the guess still marked as
 * running and turns guessing off on this device: a missing guess is better
 * than a crash. Getting the parts again on /setup turns it back on.
 */
const RUNNING_KEY = "guhit:guess-running";
const OFF_KEY = "guhit:guess-off";
/** This page life, so a guess still running here is not mistaken for a crash. */
const PAGE = Math.random().toString(36).slice(2);

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
  const running = read(RUNNING_KEY);
  if (running !== null && running !== PAGE) {
    write(OFF_KEY, "1");
    write(RUNNING_KEY, null);
  }
  return read(OFF_KEY) !== "1";
}

export function guessStarted() {
  write(RUNNING_KEY, PAGE);
}

export function guessFinished() {
  write(RUNNING_KEY, null);
}

export function allowGuessesAgain() {
  write(OFF_KEY, null);
  write(RUNNING_KEY, null);
}
