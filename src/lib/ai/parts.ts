/**
 * The parts of Guhit's AI set up on a device. The eyes are always there; the
 * voice and talking are the parent's choice (snap, cut-out and moves need no
 * model at all).
 *
 * - eyes: guesses what was drawn (Florence-2, plus the AI cut-out model);
 * - voice: the storytelling voice (Kokoro; without it the device's own voice speaks);
 * - talk: listening ears and story helper together (Whisper + the language model).
 */
import type { LoadProgress, Part } from "./types";

export type { Part };
type Stage = LoadProgress["stage"];

/** In order of importance, which is also the order setup gets them in. */
export const PARTS: Part[] = ["eyes", "voice", "talk"];

export const PART_STAGES: Record<Part, Stage[]> = { eyes: ["vision"], voice: ["tts"], talk: ["stt", "llm"] };

export const partOf = (stage: Stage): Part => PARTS.find((part) => PART_STAGES[part].includes(stage))!;

const CHOSEN_KEY = "guhit:parts";
const INSTALLED_PREFIX = "guhit:installed:";
/** Set by setups from before parts existed, which always got everything. */
const LEGACY_READY = "guhit:ready";

const inOrder = (parts: Iterable<Part>) => {
  const set = new Set(parts);
  return PARTS.filter((part) => set.has(part));
};

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
    // Blocked storage: the choice lasts for this page only.
  }
}

/** The parts the parent chose, or null before they ever chose. */
export function chosenParts(): Part[] | null {
  const saved = read(CHOSEN_KEY);
  if (saved === null) return null;
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? inOrder(parsed.filter((p): p is Part => PARTS.includes(p))) : null;
  } catch {
    return null;
  }
}

/** The eyes are always part of it: Guhit needs them to see the drawing. */
export const REQUIRED_PARTS: Part[] = ["eyes"];

export function setChosenParts(parts: Part[]) {
  write(CHOSEN_KEY, JSON.stringify(inOrder([...REQUIRED_PARTS, ...parts])));
}

/** Parts whose models are downloaded and have started on this device at least once. */
export function installedParts(): Part[] {
  const marked = PARTS.filter((part) => read(INSTALLED_PREFIX + part) === "1");
  if (marked.length === 0 && read(LEGACY_READY) === "1" && chosenParts() === null) return [...PARTS];
  return marked;
}

export function markInstalled(part: Part, installed: boolean) {
  write(INSTALLED_PREFIX + part, installed ? "1" : null);
}

export function isPartInstalled(part: Part): boolean {
  return installedParts().includes(part);
}

/**
 * What setup ticks to begin with. "deviceMemory" is Chrome's rough RAM figure
 * (absent on iPhones, whose recent models handle all three).
 */
export function recommendParts(device: { webgpu: boolean; mobile: boolean; deviceMemory?: number }): Part[] {
  const memory = device.deviceMemory;
  if (memory !== undefined && memory < (device.webgpu ? 6 : 8)) return ["eyes", "voice"];
  return [...PARTS];
}
