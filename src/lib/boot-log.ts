/**
 * A short record of the app's last starts, kept on the device so a parent can
 * show what happened when Guhit kept restarting (setup's "Details for a
 * grown-up helping"). Each start notes how the page was opened; the next
 * start marks a page that never closed normally as having died (the browser
 * killed it), as opposed to one that reloaded or navigated away.
 */
const KEY = "guhit:boot-log";
export const BOOT_LOG_SIZE = 12;

export interface BootEntry {
  at: number;
  url: string;
  /** "navigate", "reload" or "back_forward" (PerformanceNavigationTiming), or the Navigation API's type. */
  how: string;
  standalone: boolean;
  online: boolean;
  /** Next.js would restore another history entry's page on start (see layout's history guard). */
  missedTraversal: boolean;
  /** "left": the page closed normally; "died": it never did (a crash, or the tab was killed). */
  ended?: "left" | "died";
  endedAt?: number;
}

export function bootLog(): BootEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as BootEntry[]) : [];
  } catch {
    return [];
  }
}

function save(log: BootEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(log.slice(-BOOT_LOG_SIZE)));
  } catch {
    // Blocked storage: no log, the app works the same.
  }
}

export function recordStart(entry: Omit<BootEntry, "ended" | "endedAt">) {
  const log = bootLog().map((e) => (e.ended ? e : { ...e, ended: "died" as const }));
  save([...log, entry]);
}

const NOTES_KEY = "guhit:device-notes";

/** What went wrong on this device (a part that could not start), for the same grown-up details. */
export function deviceNotes(): { at: number; text: string }[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as { at: number; text: string }[]) : [];
  } catch {
    return [];
  }
}

/** What the guess running now is doing, for a screen that stops waiting for it. */
let guessStep = "";
export const setGuessStep = (step: string) => void (guessStep = step);
export const currentGuessStep = () => guessStep || "none running";

/** ", page memory N MB" where the browser tells it (Chrome); WebKit does not. */
export function heapNote(): string {
  const used = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
  return used ? `, page memory ${Math.round(used / 1e6)} MB` : "";
}

export function recordNote(text: string, at = Date.now()) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify([...deviceNotes(), { at, text }].slice(-BOOT_LOG_SIZE)));
  } catch {
    // Blocked storage: no note.
  }
}

export function recordLeave(at: number) {
  const log = bootLog();
  const last = log.at(-1);
  if (!last || last.ended) return;
  save([...log.slice(0, -1), { ...last, ended: "left", endedAt: at }]);
}
