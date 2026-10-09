/**
 * The parts of Guhit's AI set up on a device. The eyes are always there; the
 * others are the parent's choice (snap, cut-out and moves need no model at all).
 *
 * - eyes: guesses what was drawn (Florence-2, plus the AI cut-out model);
 * - voice: the storytelling voice (Kokoro; without it the character babbles);
 * - ears: hears the child (Whisper): moves on command and short written answers;
 * - story: the story helper (the language model): free conversation and new stories.
 */
import type { LoadProgress, Part } from "./types";

export type { Part };
type Stage = LoadProgress["stage"];

/** In order of importance, which is also the order setup gets them in. */
export const PARTS: Part[] = ["eyes", "voice", "ears", "story"];

export const PART_STAGES: Record<Part, Stage[]> = { eyes: ["vision"], voice: ["tts"], ears: ["stt"], story: ["llm"] };

/** "talk" was the ears and the story helper as one part: a device that had it has both. */
const LEGACY_TALK = "talk";
const fromLegacy = (names: string[]) => names.flatMap((n) => (n === LEGACY_TALK ? ["ears", "story"] : [n]));

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
    if (!Array.isArray(parsed)) return null;
    return inOrder(fromLegacy(parsed.map(String)).filter((p): p is Part => PARTS.includes(p as Part)));
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
  const talk = read(INSTALLED_PREFIX + LEGACY_TALK) === "1";
  const marked = PARTS.filter((part) => read(INSTALLED_PREFIX + part) === "1" || (talk && (part === "ears" || part === "story")));
  if (marked.length === 0 && read(LEGACY_READY) === "1" && chosenParts() === null) return [...PARTS];
  return marked;
}

export function markInstalled(part: Part, installed: boolean) {
  // The old one-part mark becomes two, so either half can be removed on its own.
  if (read(INSTALLED_PREFIX + LEGACY_TALK) === "1") {
    write(INSTALLED_PREFIX + LEGACY_TALK, null);
    write(INSTALLED_PREFIX + "ears", "1");
    write(INSTALLED_PREFIX + "story", "1");
  }
  write(INSTALLED_PREFIX + part, installed ? "1" : null);
}

export function isPartInstalled(part: Part): boolean {
  return installedParts().includes(part);
}

/**
 * What setup suggests for this device. "deviceMemory" is Chrome's rough RAM
 * figure (absent on iPhones, whose recent models handle all four); short
 * memory leaves out the story helper, the largest part.
 */
export function recommendParts(device: { webgpu: boolean; mobile: boolean; deviceMemory?: number }): Part[] {
  const memory = device.deviceMemory;
  if (memory !== undefined && memory < (device.webgpu ? 6 : 8)) return ["eyes", "voice", "ears"];
  return [...PARTS];
}
