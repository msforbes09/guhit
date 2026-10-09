/**
 * The one AudioContext for sound effects. Browsers refuse sound before the
 * first tap or key press, so the context is only made inside one; everything
 * then goes through a soft master volume and a limiter, so nothing clips.
 */

const MUTE_KEY = "guhit:sound-off";
/** Soft by default: a single effect peaks around -16 dBFS. */
const VOLUME = 0.32;
const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted: boolean | null = null;
const muteListeners = new Set<() => void>();

/** Inside a tap or key press right now (browsers without the API: assume so, we only run from input events). */
function inGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive : true;
}

function create(): AudioContext | null {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const c = new Ctor();
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master = c.createGain();
    master.gain.value = isMuted() ? 0 : VOLUME;
    master.connect(limiter).connect(c.destination);
    return c;
  } catch {
    return null;
  }
}

/** Makes (or wakes) the context; does nothing outside a tap or key press. */
export function unlock(): void {
  if (typeof window === "undefined") return;
  if (!ctx) {
    if (!inGesture()) return;
    ctx = create();
  }
  // iOS suspends the context again after a call or the lock screen.
  if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
}

let listening = false;

/** Wakes the sound on every tap or key press (cheap once it runs). */
export function listenForFirstTap(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true, passive: true });
}

/** Where to play right now, or null before the first tap and while muted. */
export function output(): { ctx: AudioContext; out: AudioNode } | null {
  if (!ctx || !master || isMuted()) return null;
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return { ctx, out: master };
}

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    if (next) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // Private mode: the switch still works until the page closes.
  }
  if (ctx && master) master.gain.setTargetAtTime(next ? 0 : VOLUME, ctx.currentTime, 0.015);
  for (const listener of muteListeners) listener();
}

export function subscribeMuted(listener: () => void): () => void {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}
