import { getAI, RealAI } from "@/lib/ai";
import { CHARACTER_BABBLES, Speaker } from "@/lib/ai/tts";
import type { Kind } from "@/lib/story/kind";
import { babble, stopBabble } from "./babble";

/**
 * Without the neural voice, the character babbles in 8-bit blips instead of
 * the device's built-in voice: never both at once. The switch lives with the
 * voice (src/lib/ai/tts.ts), which babbles for the character too; false lets
 * the built-in voice speak for the character again (test mode, whose pretend
 * voice is silent, still babbles).
 */
export const BABBLE_INSTEAD_OF_SYSTEM_VOICE = CHARACTER_BABBLES;

/**
 * Whether the neural voice (Kokoro) is installed and is what speaks: the voice
 * part was chosen at setup, has started, and has not fallen back to the
 * built-in voice (too slow on this device, failed to load, or stopped working
 * since).
 */
export function isVoiceReady(): boolean {
  const ai = getAI();
  return (
    ai instanceof RealAI &&
    ai.partStatus("voice") === "ready" &&
    ai.voices?.engine === "kokoro" &&
    Speaker.latest?.engine === "kokoro"
  );
}

/** True when the character's lines are babbled rather than spoken by the engine. */
export function babbleSpeaks(): boolean {
  if (isVoiceReady()) return false;
  return BABBLE_INSTEAD_OF_SYSTEM_VOICE || !(getAI() instanceof RealAI);
}

/** The character says a line: in its real voice when that is ready, otherwise in babble. */
export function sayAsCharacter(text: string, kind: Kind): Promise<void> {
  return babbleSpeaks() ? babble(text, kind) : getAI().speak(text, "character");
}

/** Stops whatever is talking: the engine's voice and the babble. */
export function hush(): void {
  getAI().stopSpeaking();
  stopBabble();
}

/**
 * The engine starts speaking a reply while still writing it; when babble
 * speaks for the character instead, that voice must stay quiet. Call before
 * asking for a reply.
 */
export function prepareReplyVoice(): void {
  const ai = getAI();
  if (ai instanceof RealAI) ai.autoSpeakReplies = !babbleSpeaks();
}
