import { MockAI } from "./mock";
import type { LocalAI } from "./types";

export type { AIStatus, ChatTurn, LoadProgress, LocalAI } from "./types";

let instance: LocalAI | null = null;

/** Single switch point for the AI engine used by every screen. */
export function getAI(): LocalAI {
  if (!instance) instance = new MockAI();
  return instance;
}
