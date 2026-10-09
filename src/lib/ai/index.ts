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
/** True while a started setup has not finished (it carries on when /setup is opened again). */
export { isSetupInProgress } from "./setup-resume";
export { RealAI };

const MOCK_KEY = "guhit:mock";

let instance: LocalAI | null = null;

/** "?mock=1" switches to canned answers for the rest of the tab session; "?mock=0" switches back. */
function wantsMock(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("mock");
    if (param === "1") sessionStorage.setItem(MOCK_KEY, "1");
    if (param === "0") sessionStorage.removeItem(MOCK_KEY);
    return sessionStorage.getItem(MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Single switch point for the AI engine used by every screen. */
export function getAI(): LocalAI {
  // Server rendering never runs AI; screens call the engine from effects and handlers.
  if (typeof window === "undefined") return new MockAI();
  if (!instance) instance = wantsMock() ? new MockAI() : new RealAI();
  return instance;
}
