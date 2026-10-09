import { RealAI } from "./engine";
import { MockAI } from "./mock";
import type { LocalAI } from "./types";

export type {
  AIStatus,
  ChatTurn,
  DrawingDescription,
  DrawingPhoto,
  SafetyCategory,
  LoadProgress,
  LocalAI,
  PixelRect,
} from "./types";
export { detectSupport } from "./device";
export { photoCropFromCutout } from "./photo";
export { isMarkedReady, READY_FLAG } from "./offline";
export { RealAI };

const MOCK_KEY = "guhit:mock";

let instance: LocalAI | null = null;

/**
 * Test mode: "?mock=1" switches to canned answers and stays on (every page,
 * every visit) until "?mock=0" switches it back. Testers bookmark /?mock=1
 * and never download the models.
 */
export function isTestMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("mock");
    if (param === "1") localStorage.setItem(MOCK_KEY, "1");
    if (param === "0") localStorage.removeItem(MOCK_KEY);
    return localStorage.getItem(MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Single switch point for the AI engine used by every screen. */
export function getAI(): LocalAI {
  // Server rendering never runs AI; screens call the engine from effects and handlers.
  if (typeof window === "undefined") return new MockAI();
  if (!instance) instance = isTestMode() ? new MockAI() : new RealAI();
  return instance;
}
