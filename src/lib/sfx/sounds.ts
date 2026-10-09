import { hz, noise, seq, tone } from "./synth";

type Recipe = (ctx: BaseAudioContext, out: AudioNode, t: number) => void;

// MIDI note numbers: C4 is middle C.
const G3 = 55, C4 = 60, G4 = 67, B4 = 71, C5 = 72, D5 = 74, E5 = 76, G5 = 79, A5 = 81;
const C6 = 84, D6 = 86, E6 = 88, G6 = 91, A6 = 93, C7 = 96;

/**
 * One short, cheerful chiptune per kid action, none longer than 0.6 s. The
 * "oops" is a soft triangle falling a major third: a shrug, never an alarm.
 */
export const SOUNDS = {
  /** Any button. */
  tap: (c, o, t) => tone(c, o, { wave: "pulse25", at: t, dur: 0.045, f: [hz(C6), hz(G6)], gain: 0.2 }),

  /** The classic platformer jump. */
  jump: (c, o, t) => tone(c, o, { wave: "square", at: t, dur: 0.26, f: [280, 900, 980], gain: 0.28, shape: "pluck" }),

  /** A swimmer's jump out of the water, then the splash. */
  leap: (c, o, t) => {
    tone(c, o, { wave: "square", at: t, dur: 0.3, f: [240, 760, 1040], gain: 0.26, shape: "pluck" });
    noise(c, o, { at: t + 0.27, dur: 0.24, rate: 0.35, gain: 0.22, filter: { type: "lowpass", freq: 2400 } });
  },

  /** Three wing beats, each a little higher. */
  flap: (c, o, t) => {
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.13;
      noise(c, o, { at, dur: 0.08, rate: 0.6, gain: 0.18, filter: { type: "bandpass", freq: 1800 } });
      tone(c, o, { wave: "triangle", at, dur: 0.07, f: [500 + i * 120, 900 + i * 150], gain: 0.32 });
    }
  },

  /** Two springy boings. */
  hop: (c, o, t) => {
    tone(c, o, { wave: "triangle", at: t, dur: 0.2, f: [190, 560, 300], gain: 0.5 });
    tone(c, o, { wave: "triangle", at: t + 0.24, dur: 0.2, f: [220, 640, 340], gain: 0.42 });
  },

  /** A bouncy arpeggio with a hi-hat on the beat. */
  dance: (c, o, t) => {
    seq(c, o, t, [C5, E5, G5, C6, G5, C6, E6], 0.062, { wave: "pulse25", gain: 0.24 });
    for (let i = 0; i < 4; i++) noise(c, o, { at: t + i * 0.124, dur: 0.03, gain: 0.08, filter: { type: "highpass", freq: 6000 } });
  },

  /** Four little footsteps, left-right. */
  walk: (c, o, t) => {
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.13;
      tone(c, o, { wave: "triangle", at, dur: 0.08, f: hz(i % 2 ? G3 : C4), gain: 0.5, shape: "pluck" });
      noise(c, o, { at, dur: 0.02, rate: 0.25, gain: 0.1 });
    }
  },

  /** Vroom: a revving engine and its rumble. */
  drive: (c, o, t) => {
    tone(c, o, { wave: "square", at: t, dur: 0.5, f: [70, 120, 95, 150], gain: 0.2, vibrato: { rate: 22, cents: 60 } });
    noise(c, o, { at: t, dur: 0.5, rate: 0.15, gain: 0.1, filter: { type: "lowpass", freq: 900 }, shape: "hold" });
  },

  /** Beep beep: a toy horn's two-note chord, twice. */
  honk: (c, o, t) => {
    for (const at of [t, t + 0.17]) {
      tone(c, o, { wave: "square", at, dur: 0.12, f: hz(G4), gain: 0.17 });
      tone(c, o, { wave: "square", at, dur: 0.12, f: hz(B4), gain: 0.15 });
    }
  },

  /** A rising, fluttering whistle with a sparkle on top. */
  fly: (c, o, t) => {
    tone(c, o, { wave: "triangle", at: t, dur: 0.48, f: [520, 1250], gain: 0.38, vibrato: { rate: 11, cents: 45 } });
    seq(c, o, t + 0.3, [C6, E6, G6], 0.05, { wave: "pulse12", gain: 0.1 });
  },

  /** Bubbles popping up. */
  swim: (c, o, t) => {
    const bubbles: [number, number][] = [[0, 330], [0.07, 420], [0.15, 370], [0.21, 520], [0.3, 460], [0.38, 600]];
    for (const [dt, f] of bubbles) tone(c, o, { wave: "triangle", at: t + dt, dur: 0.055, f: [f, f * 2.4], gain: 0.4, shape: "pluck" });
  },

  /** A sprouting pentatonic climb with a shimmer an octave up. */
  grow: (c, o, t) => {
    seq(c, o, t, [C5, D5, E5, G5, A5, C6], 0.075, { wave: "triangle", gain: 0.45 });
    seq(c, o, t, [C6, D6, E6, G6, A6, C7], 0.075, { wave: "pulse12", gain: 0.06 });
  },

  /** A lullaby falling asleep. */
  sleep: (c, o, t) => {
    seq(c, o, t, [G5, E5], 0.15, { wave: "triangle", gain: 0.38 });
    tone(c, o, { wave: "triangle", at: t + 0.3, dur: 0.28, f: hz(C5), gain: 0.36, shape: "pluck", vibrato: { rate: 6, cents: 20 } });
  },

  /** Up and at 'em: a bright rising ding. */
  wake: (c, o, t) => {
    seq(c, o, t, [C5, G5, C6], 0.05, { wave: "pulse25", gain: 0.24 });
    tone(c, o, { wave: "pulse25", at: t + 0.15, dur: 0.24, f: hz(E6), gain: 0.24, shape: "pluck", vibrato: { rate: 9, cents: 25 } });
  },

  /** "Hi-hi!" */
  wave: (c, o, t) => {
    tone(c, o, { wave: "pulse25", at: t, dur: 0.09, f: [hz(G5), hz(C6)], gain: 0.24 });
    tone(c, o, { wave: "pulse25", at: t + 0.13, dur: 0.12, f: [hz(C6), hz(E6)], gain: 0.24 });
  },

  /** A tickle when the character is tapped. */
  giggle: (c, o, t) => seq(c, o, t, [E6, C6, E6, C6, G6], 0.045, { wave: "pulse25", gain: 0.18 }),

  /** The cut-out pops to life: a pop, a magic climb, a twinkle. */
  pop: (c, o, t) => {
    noise(c, o, { at: t, dur: 0.05, gain: 0.26 });
    tone(c, o, { wave: "square", at: t, dur: 0.05, f: [600, 200], gain: 0.2 });
    seq(c, o, t + 0.05, [C5, E5, G5, C6, E6, G6], 0.045, { wave: "pulse12", gain: 0.22 });
    tone(c, o, { wave: "pulse25", at: t + 0.32, dur: 0.26, f: hz(C7), gain: 0.13, shape: "pluck", vibrato: { rate: 14, cents: 30 } });
  },

  /** A camera shutter: click-clack. */
  shutter: (c, o, t) => {
    noise(c, o, { at: t, dur: 0.03, gain: 0.32, filter: { type: "highpass", freq: 3000 } });
    noise(c, o, { at: t + 0.075, dur: 0.045, rate: 0.7, gain: 0.26, filter: { type: "highpass", freq: 1500 } });
  },

  /** One beat of the photo countdown. */
  tick: (c, o, t) => tone(c, o, { wave: "pulse25", at: t, dur: 0.07, f: hz(A5), gain: 0.2 }),

  /** Done it: a little fanfare. */
  success: (c, o, t) => {
    const end = seq(c, o, t, [C5, E5, G5], 0.07, { wave: "pulse25", gain: 0.24 });
    tone(c, o, { wave: "pulse25", at: end, dur: 0.3, f: hz(C6), gain: 0.24, shape: "pluck" });
    tone(c, o, { wave: "triangle", at: t, dur: 0.2, f: hz(C4), gain: 0.4 });
    tone(c, o, { wave: "triangle", at: end, dur: 0.3, f: hz(C5), gain: 0.4, shape: "pluck" });
  },

  /** The big moments (a friend named, a book made): a climb and a trill. */
  celebrate: (c, o, t) => {
    const end = seq(c, o, t, [G5, C6, E6, G6], 0.06, { wave: "pulse25", gain: 0.22 });
    seq(c, o, end, [C7, A6, C7, A6, C7], 0.045, { wave: "pulse25", gain: 0.15 });
    seq(c, o, t, [C4, G4, C5], 0.15, { wave: "triangle", gain: 0.4 });
  },

  /** A gentle "uh-oh". */
  oops: (c, o, t) => {
    tone(c, o, { wave: "triangle", at: t, dur: 0.14, f: [hz(E5), hz(E5) * 0.98], gain: 0.4 });
    tone(c, o, { wave: "triangle", at: t + 0.17, dur: 0.26, f: [hz(C5), hz(C5) * 0.94], gain: 0.4, shape: "pluck" });
  },
} satisfies Record<string, Recipe>;

export type SoundName = keyof typeof SOUNDS;
