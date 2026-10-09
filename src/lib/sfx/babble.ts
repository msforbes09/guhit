import type { Kind } from "@/lib/story/kind";
import { output } from "./engine";
import { setWave, type Wave } from "./synth";

/**
 * The character's 8-bit voice when there is no neural voice: one pitched
 * blip per syllable, Animal Crossing style. Each kind sounds like itself, and
 * the same line always babbles the same way.
 */

interface Voice {
  wave: Wave;
  /** Hz of the lowest blip. */
  base: number;
  /** Semitones above `base` the blips pick from. */
  steps: number[];
  /** Pitch at the end of a blip relative to its start (above 1 slides up). */
  slide: number;
  /** Seconds per blip. */
  blip: number;
  gain: number;
}

const VOICES: Record<Kind, Voice> = {
  creature: { wave: "pulse25", base: 520, steps: [0, 2, 4, 7, 9], slide: 1.06, blip: 0.065, gain: 0.22 },
  // Low and gruff, each blip sagging like an engine note.
  vehicle: { wave: "square", base: 196, steps: [0, 3, 5, 7], slide: 0.9, blip: 0.07, gain: 0.2 },
  // Soft and slow.
  plant: { wave: "triangle", base: 392, steps: [0, 2, 4, 7, 9], slide: 1, blip: 0.085, gain: 0.42 },
  // High and chirpy.
  flyer: { wave: "pulse12", base: 740, steps: [0, 2, 4, 7, 9, 12], slide: 1.18, blip: 0.05, gain: 0.2 },
  // Bloops that bubble upward.
  swimmer: { wave: "triangle", base: 330, steps: [0, 3, 5, 7, 10], slide: 1.5, blip: 0.065, gain: 0.45 },
  // A little robot: few pitches, no slide.
  thing: { wave: "square", base: 294, steps: [0, 0, 7, 12], slide: 1, blip: 0.06, gain: 0.18 },
};

/** Longest a line babbles; longer lines talk a bit faster, then trail off. */
const MAX_SECONDS = 3;
const SYLLABLE_GAP = 0.014;
const WORD_GAP = 0.045;
const COMMA_GAP = 0.14;
const SENTENCE_GAP = 0.24;

export interface Blip {
  at: number;
  dur: number;
  f0: number;
  f1: number;
}

const syllables = (word: string) => Math.min(4, Math.max(1, word.match(/[aeiouy]+/gi)?.length ?? 1));

function hash(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** When each blip plays and at what pitch; the length roughly follows the text, capped at 3 s. */
export function planBabble(text: string, kind: Kind): { blips: Blip[]; length: number } {
  const voice = VOICES[kind];
  const blips: Blip[] = [];
  let t = 0;
  for (const sentence of text.match(/[^.!?]+[.!?]*/g) ?? []) {
    const words = sentence.match(/[\p{L}\p{N}']+|[,;:]/gu) ?? [];
    const ending = sentence.trim().slice(-1);
    // Excited lines sit higher; questions rise at the end.
    const lift = ending === "!" ? 3 : 0;
    let lastWord = words.length - 1;
    while (lastWord > 0 && /^[,;:]$/.test(words[lastWord])) lastWord--;
    words.forEach((word, w) => {
      if (/^[,;:]$/.test(word)) {
        t += COMMA_GAP;
        return;
      }
      const count = syllables(word);
      for (let s = 0; s < count; s++) {
        const step = voice.steps[hash(`${word.toLowerCase()}${s}`) % voice.steps.length];
        const rise = ending === "?" && w === lastWord ? 2 + s * 2 : 0;
        const f0 = voice.base * 2 ** ((step + lift + rise) / 12);
        blips.push({ at: t, dur: voice.blip, f0, f1: f0 * voice.slide });
        t += voice.blip + SYLLABLE_GAP;
      }
      t += WORD_GAP;
    });
    t += SENTENCE_GAP;
  }
  // A long line talks up to a third faster, then whatever still runs past 3 s is left unsaid.
  const natural = blips.length ? blips[blips.length - 1].at + voice.blip : 0;
  const speed = Math.min(1.35, Math.max(1, natural / MAX_SECONDS));
  const fitted = blips
    .map((b) => ({ ...b, at: b.at / speed, dur: b.dur / speed }))
    .filter((b) => b.at + b.dur <= MAX_SECONDS);
  const length = fitted.length ? fitted[fitted.length - 1].at + fitted[fitted.length - 1].dur : 0;
  return { blips: fitted, length };
}

interface Babbling {
  blips: Blip[];
  startedAt: number;
  stop: () => void;
}

let current: Babbling | null = null;
const startListeners = new Set<() => void>();

/** Schedules every blip on one oscillator; null before the first tap and while sounds are off. */
function sound(plan: { blips: Blip[]; length: number }, kind: Kind): { osc: OscillatorNode; env: GainNode } | null {
  const audio = output();
  if (!audio || !plan.blips.length) return null;
  const { ctx, out } = audio;
  const voice = VOICES[kind];
  try {
    const t0 = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    setWave(ctx, osc, voice.wave);
    env.gain.setValueAtTime(0, t0);
    for (const b of plan.blips) {
      const at = t0 + b.at;
      osc.frequency.setValueAtTime(b.f0, at);
      osc.frequency.exponentialRampToValueAtTime(b.f1, at + b.dur);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(voice.gain, at + 0.006);
      env.gain.linearRampToValueAtTime(voice.gain * 0.7, at + b.dur - 0.015);
      env.gain.linearRampToValueAtTime(0, at + b.dur);
    }
    osc.connect(env).connect(out);
    osc.start(t0);
    osc.stop(t0 + plan.length + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
    performance.mark(`sfx:babble:${kind}`);
    return { osc, env };
  } catch (error) {
    // The words are in the bubble; the babble is a bonus.
    console.error("[sfx] babble", error);
    return null;
  }
}

/**
 * Babbles a line in the character's voice; resolves when it is done or
 * stopped. Silent (but still timed, so the mouth moves) before the first tap
 * and while sounds are off.
 */
export function babble(text: string, kind: Kind): Promise<void> {
  stopBabble();
  const plan = planBabble(text, kind);
  const playing = sound(plan, kind);

  return new Promise((resolve) => {
    const me: Babbling = {
      blips: plan.blips,
      startedAt: performance.now(),
      stop: () => {
        clearTimeout(timer);
        if (playing) {
          const { osc, env } = playing;
          const now = osc.context.currentTime;
          env.gain.cancelScheduledValues(now);
          env.gain.setTargetAtTime(0, now, 0.01);
          try {
            osc.stop(now + 0.05);
          } catch {
            // Already stopped (older WebKit refuses a second stop).
          }
        }
        if (current === me) current = null;
        resolve();
      },
    };
    const timer = setTimeout(() => me.stop(), plan.length * 1000 + 60);
    current = me;
    for (const listener of startListeners) listener();
  });
}

export function stopBabble(): void {
  current?.stop();
}

/** Loudness 0..1 of the babble right now, for the character's mouth. */
export function babbleLevel(): number {
  if (!current) return 0;
  const t = (performance.now() - current.startedAt) / 1000;
  const blip = current.blips.find((b) => t >= b.at && t < b.at + b.dur);
  return blip ? 0.55 + 0.4 * Math.sin((Math.PI * (t - blip.at)) / blip.dur) : 0.05;
}

/** Called whenever a babble starts. Returns the unsubscribe function. */
export function onBabbleStart(listener: () => void): () => void {
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}
