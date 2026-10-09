/**
 * A phone's browser can kill the page while a part starts (iPhone Safari: "A
 * problem repeatedly occurred"), and setup, carrying on by itself, would start
 * the same part again and be killed again. The parts being started are marked;
 * a later page that finds the mark left behind knows they stopped the page,
 * leaves them out of the parent's choice (the eyes always stay) and setup says
 * they did not fit. A hidden or closed page clears the mark, so only a crash
 * in view counts. Ticking the part again on /setup tries it again.
 */
import { chosenParts, installedParts, markInstalled, partsFrom, REQUIRED_PARTS, setChosenParts, type Part } from "./parts";

const STARTING_KEY = "guhit:part-starting";
const CRASHED_KEY = "guhit:parts-crashed";
/** This page life, so parts still starting here are not mistaken for a crash. */
const PAGE = Math.random().toString(36).slice(2);

/** The parts starting in this page right now. */
const starting = new Set<Part>();

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
    // Blocked storage: no guard, parts still start.
  }
}

/** Older notes may name "talk", which became the ears and the story helper. */
const parseParts = partsFrom;

function saveMark() {
  write(STARTING_KEY, starting.size ? JSON.stringify({ page: PAGE, parts: [...starting] }) : null);
}

export function partStarting(part: Part) {
  starting.add(part);
  saveMark();
}

export function partSettled(part: Part) {
  starting.delete(part);
  saveMark();
}

/** The page is hidden or being left: nothing that happens now is a crash in view. */
export function pageHidden() {
  write(STARTING_KEY, null);
}

/** Back in view: parts still starting count again. */
export function pageShown() {
  saveMark();
}

/** Parts that stopped the page while starting, left out of the choice until the parent ticks them again. */
export function crashedParts(): Part[] {
  let crashed: Part[] = [];
  try {
    crashed = parseParts(JSON.parse(read(CRASHED_KEY) ?? "[]"));
  } catch {
    // An unreadable note counts as none.
  }
  let mark: { page?: string; parts?: unknown } | null = null;
  try {
    mark = JSON.parse(read(STARTING_KEY) ?? "null");
  } catch {
    write(STARTING_KEY, null);
  }
  if (mark && mark.page !== PAGE) {
    write(STARTING_KEY, null);
    const lost = parseParts(mark.parts).filter((part) => !REQUIRED_PARTS.includes(part));
    if (lost.length) {
      const chosen = chosenParts() ?? installedParts();
      setChosenParts(chosen.filter((part) => !lost.includes(part)));
      for (const part of lost) markInstalled(part, false);
      crashed = [...new Set([...crashed, ...lost])];
      write(CRASHED_KEY, JSON.stringify(crashed));
    }
  }
  return crashed;
}

export function tryPartsAgain(parts: Part[]) {
  const left = crashedParts().filter((part) => !parts.includes(part));
  write(CRASHED_KEY, left.length ? JSON.stringify(left) : null);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", pageHidden);
  document.addEventListener("visibilitychange", () => (document.visibilityState === "hidden" ? pageHidden() : pageShown()));
}
