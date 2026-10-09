import { output } from "./engine";
import { SOUNDS, type SoundName } from "./sounds";

export { isMuted, listenForFirstTap, setMuted, subscribeMuted } from "./engine";
export type { SoundName } from "./sounds";

/**
 * Plays one of the 8-bit effects. Silent before the first tap (browsers
 * allow no sound before one) and while sounds are off.
 */
export function sfx(name: SoundName): void {
  const audio = output();
  if (!audio) return;
  try {
    SOUNDS[name](audio.ctx, audio.out, audio.ctx.currentTime + 0.01);
    performance.mark(`sfx:${name}`);
  } catch (error) {
    // A sound effect is never worth breaking a tap over.
    console.error(`[sfx] ${name}`, error);
  }
}
