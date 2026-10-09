// Original chiptune score and 8-bit sound effects, synthesized from scratch
// (pulse, triangle and noise voices, like an old handheld), written as WAV.
//
//   node audio/synth.mjs
//   → public/audio/music.wav  (60 s, 100 BPM, stereo 48 kHz; sections follow the video)
//   → public/audio/sfx/*.wav  (shutter, pop, sparkle, boing, tick, ding, cross, whoosh)
//
// Nothing here is sampled or downloaded: every sound is maths below.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 48000;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
mkdirSync(join(out, "sfx"), { recursive: true });

// ---------- tiny synth ----------
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const NOTE = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return 12 * (Number(m[3]) + 1) + base;
};

/** Deterministic noise (an LFSR, like the NES noise channel). */
function lfsr(seed = 1) {
  let s = seed;
  return () => {
    const bit = (s ^ (s >> 1)) & 1;
    s = (s >> 1) | (bit << 14);
    return s & 1 ? 1 : -1;
  };
}

function track(seconds) {
  return { L: new Float32Array(Math.ceil(seconds * RATE)), R: new Float32Array(Math.ceil(seconds * RATE)) };
}

/** Adds one note. wave: pulse12 | pulse25 | pulse50 | tri | noise. */
function note(t, { at, dur, freq, wave = "pulse25", vol = 0.2, attack = 0.005, decay = 0.08, sustain = 0.7, release = 0.06, pan = 0, vibrato = 0, slide = 0, noiseSeed = 7 }) {
  const start = Math.floor(at * RATE);
  const len = Math.floor((dur + release) * RATE);
  const duty = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 }[wave];
  const rnd = lfsr(noiseSeed);
  let phase = 0;
  let held = 0;
  let noiseVal = 0;
  const gl = Math.min(1, 1 - pan) * vol;
  const gr = Math.min(1, 1 + pan) * vol;
  for (let i = 0; i < len; i++) {
    const k = start + i;
    if (k < 0 || k >= t.L.length) continue;
    const s = i / RATE;
    let env;
    if (s < attack) env = s / attack;
    else if (s < attack + decay) env = 1 - (1 - sustain) * ((s - attack) / decay);
    else if (s < dur) env = sustain;
    else env = sustain * Math.max(0, 1 - (s - dur) / release);
    const f = freq * (1 + vibrato * Math.sin(2 * Math.PI * 5.5 * s) * Math.min(1, s / 0.15)) * Math.pow(2, (slide * s) / 12);
    phase += f / RATE;
    phase -= Math.floor(phase);
    let v;
    if (wave === "tri") v = 1 - 4 * Math.abs(phase - 0.5);
    else if (wave === "noise") {
      held += f / RATE;
      if (held >= 1) {
        held -= 1;
        noiseVal = rnd();
      }
      v = noiseVal;
    } else v = phase < duty ? 1 : -1;
    t.L[k] += v * env * gl;
    t.R[k] += v * env * gr;
  }
}

/** One-pole low-pass: softens the square waves so the score stays gentle. */
function lowpass(buf, cutoff) {
  const a = Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y = (1 - a) * buf[i] + a * y;
    buf[i] = y;
  }
}

/** Ping-pong echo for a little room. */
function echo(t, delay = 0.3, feedback = 0.28, mix = 0.22) {
  const d = Math.floor(delay * RATE);
  for (let i = d; i < t.L.length; i++) {
    const l = t.L[i - d];
    const r = t.R[i - d];
    t.L[i] += r * feedback * mix * 3;
    t.R[i] += l * feedback * mix * 3;
  }
}

function normalize(t, peak = 0.7) {
  let m = 0;
  for (let i = 0; i < t.L.length; i++) m = Math.max(m, Math.abs(t.L[i]), Math.abs(t.R[i]));
  const g = m > 0 ? peak / m : 1;
  for (let i = 0; i < t.L.length; i++) {
    t.L[i] *= g;
    t.R[i] *= g;
  }
}

function fade(t, inS, outS) {
  const n = t.L.length;
  for (let i = 0; i < n; i++) {
    const s = i / RATE;
    const g = Math.min(1, inS ? s / inS : 1, outS ? (n / RATE - s) / outS : 1);
    t.L[i] *= g;
    t.R[i] *= g;
  }
}

function wav(t, file) {
  const n = t.L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, t.L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, t.R[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(file, buf);
  console.log(`→ ${file} (${(n / RATE).toFixed(2)} s)`);
}

// ---------- the score ----------
const BPM = 100;
const BEAT = 60 / BPM; // 0.6 s
const BAR = BEAT * 4; // 2.4 s
const LENGTH = 60;

// I–vi–IV–V in C, one chord per bar.
const CHORDS = [
  ["C3", ["C4", "E4", "G4", "C5"]],
  ["A2", ["A3", "C4", "E4", "A4"]],
  ["F2", ["F3", "A3", "C4", "F4"]],
  ["G2", ["G3", "B3", "D4", "G4"]],
];

// Melody, 8 eighths per bar ("-" holds, "." rests). Phrase A then B.
const MELODY = [
  "G4 - C5 - E5 - D5 C5",
  "E5 - - - C5 - A4 -",
  "A4 - C5 - F5 - E5 D5",
  "D5 - - - B4 - G4 -",
  "E5 - G5 - C6 - B5 A5",
  "G5 - E5 - C5 - E5 -",
  "F5 - A5 - G5 - F5 E5",
  "D5 - E5 - D5 - B4 -",
].map((bar) => bar.split(" "));

/** What plays in each bar (section map follows the video's scenes). */
function section(bar) {
  if (bar < 2) return { arp: 0.5, bass: 0.6, drums: 0, lead: 0 }; // hook
  if (bar < 4) return { arp: 0, bass: 0.5, drums: 0.25, lead: 0 }; // the problem: sparse
  if (bar < 5) return { arp: 1, bass: 0.8, drums: 0.5, lead: 0.8 }; // logo reveal
  if (bar < 17) return { arp: 0.8, bass: 1, drums: 1, lead: 0.7 }; // the app
  if (bar < 21) return { arp: 0.7, bass: 0.7, drums: 0.35, lead: 0 }; // offline: calmer
  if (bar < 23) return { arp: 1, bass: 1, drums: 1.2, lead: 1 }; // title card
  return { arp: 0.6, bass: 0.6, drums: 0, lead: 0.6 }; // end card
}

const music = track(LENGTH);
const leadT = track(LENGTH);
const bars = Math.ceil(LENGTH / BAR);
for (let bar = 0; bar < bars; bar++) {
  const at = bar * BAR;
  const sec = section(bar);
  const [root, chord] = CHORDS[bar % 4];
  const last = bar >= 23;
  // Bass: triangle, root on 1 and 3, octave hop on the "and" of 4.
  if (sec.bass) {
    const r = NOTE(root);
    for (const [beat, n, d] of [[0, r, 0.9], [2, r, 0.9], [3.5, r + 12, 0.25]]) {
      note(music, { at: at + beat * BEAT, dur: d * BEAT, freq: midi(n), wave: "tri", vol: 0.34 * sec.bass, release: 0.05 });
    }
  }
  // Arpeggio: soft 12.5% pulse in eighths, panned a little left.
  if (sec.arp) {
    for (let i = 0; i < 8; i++) {
      const n = NOTE(chord[[0, 1, 2, 3, 2, 1, 2, 3][i]]) + 12;
      note(music, { at: at + i * (BEAT / 2), dur: BEAT / 2 - 0.05, freq: midi(n), wave: "pulse12", vol: 0.07 * sec.arp, decay: 0.12, sustain: 0.35, pan: -0.35 });
    }
  }
  // Drums: soft kick (sine drop), hats on the off-beats, snare on 2 and 4.
  if (sec.drums) {
    for (let b = 0; b < 4; b++) {
      if (b % 2 === 0 || sec.drums > 1) note(music, { at: at + b * BEAT, dur: 0.12, freq: 150, wave: "tri", vol: 0.42 * Math.min(1, sec.drums), slide: -60, decay: 0.1, sustain: 0.2, release: 0.03 });
      note(music, { at: at + (b + 0.5) * BEAT, dur: 0.03, freq: 9000, wave: "noise", vol: 0.05 * sec.drums, decay: 0.03, sustain: 0.1, release: 0.02, pan: 0.3, noiseSeed: 3 });
      if (b % 2 === 1) note(music, { at: at + b * BEAT, dur: 0.09, freq: 2600, wave: "noise", vol: 0.11 * Math.min(1, sec.drums), decay: 0.08, sustain: 0.15, release: 0.04, noiseSeed: 11 });
    }
  }
  // Lead: 25% pulse with a little vibrato, panned right.
  if (sec.lead && !last) {
    const line = MELODY[bar % 8];
    for (let i = 0; i < 8; i++) {
      const tok = line[i];
      if (tok === "-" || tok === ".") continue;
      let holds = 1;
      while (i + holds < 8 && line[i + holds] === "-") holds++;
      note(leadT, { at: at + i * (BEAT / 2), dur: holds * (BEAT / 2) - 0.04, freq: midi(NOTE(tok)), wave: "pulse25", vol: 0.12 * sec.lead, vibrato: 0.006, decay: 0.1, sustain: 0.6, pan: 0.25 });
    }
  }
  // Ending: a held C major chord that rings out.
  if (bar === 23) {
    ["C4", "E4", "G4", "C5", "E5"].forEach((n, i) =>
      note(leadT, { at: at + BEAT * 2 + i * 0.09, dur: 2.2, freq: midi(NOTE(n)), wave: i % 2 ? "pulse25" : "pulse12", vol: 0.07, decay: 0.6, sustain: 0.45, release: 1.2, vibrato: 0.004, pan: i % 2 ? 0.3 : -0.3 }),
    );
    note(music, { at: at + BEAT * 2, dur: 2.2, freq: midi(NOTE("C2")), wave: "tri", vol: 0.3, release: 1.2 });
  }
}
// A little rise into the logo reveal (bar 4 = 9.6 s).
for (let i = 0; i < 8; i++) note(leadT, { at: 4 * BAR - 0.6 + i * 0.075, dur: 0.06, freq: midi(NOTE("C5") + [0, 4, 7, 12, 16, 19, 24, 28][i]), wave: "pulse12", vol: 0.06 + i * 0.008 });

for (const ch of ["L", "R"]) {
  lowpass(music[ch], 5200);
  lowpass(leadT[ch], 4200);
  for (let i = 0; i < music[ch].length; i++) music[ch][i] += leadT[ch][i];
}
echo(music, 0.3, 0.25, 0.18);
fade(music, 0.4, 1.2);
normalize(music, 0.6);
wav(music, join(out, "music.wav"));

// ---------- sound effects ----------
function sfx(name, seconds, build, peak = 0.7) {
  const t = track(seconds);
  build(t);
  for (const ch of ["L", "R"]) lowpass(t[ch], 7000);
  normalize(t, peak);
  wav(t, join(out, "sfx", `${name}.wav`));
}
// Camera shutter: a noise click, a short gap, a second click and a bright blip.
sfx("shutter", 0.35, (t) => {
  note(t, { at: 0, dur: 0.035, freq: 7000, wave: "noise", vol: 0.6, decay: 0.03, sustain: 0.2, release: 0.02 });
  note(t, { at: 0.07, dur: 0.05, freq: 4000, wave: "noise", vol: 0.5, decay: 0.05, sustain: 0.2, release: 0.03, noiseSeed: 5 });
  note(t, { at: 0.08, dur: 0.08, freq: midi(NOTE("C7")), wave: "pulse25", vol: 0.25, decay: 0.06, sustain: 0.3 });
});
// Pop: a quick upward chirp (things appearing).
sfx("pop", 0.16, (t) => note(t, { at: 0, dur: 0.09, freq: midi(NOTE("G5")), wave: "pulse50", vol: 0.4, slide: 40, decay: 0.07, sustain: 0.3, release: 0.04 }));
// Sparkle: a fast rising arpeggio (logo, magic moments).
sfx("sparkle", 0.7, (t) =>
  ["C6", "E6", "G6", "C7", "E7", "G7"].forEach((n, i) => note(t, { at: i * 0.05, dur: 0.12, freq: midi(NOTE(n)), wave: "pulse12", vol: 0.3 - i * 0.03, decay: 0.1, sustain: 0.3, release: 0.15 })),
);
// Boing: a bouncy slide (moves).
sfx("boing", 0.4, (t) => {
  note(t, { at: 0, dur: 0.12, freq: midi(NOTE("C4")), wave: "pulse25", vol: 0.4, slide: 30, decay: 0.1 });
  note(t, { at: 0.12, dur: 0.18, freq: midi(NOTE("G5")), wave: "pulse25", vol: 0.3, slide: -24, decay: 0.15, sustain: 0.4 });
});
// Tick: a tiny blip (progress steps).
sfx("tick", 0.08, (t) => note(t, { at: 0, dur: 0.03, freq: midi(NOTE("E6")), wave: "pulse12", vol: 0.4, decay: 0.03, sustain: 0.2, release: 0.02 }), 0.5);
// Ding: a two-note success chime.
sfx("ding", 0.8, (t) => {
  note(t, { at: 0, dur: 0.1, freq: midi(NOTE("E6")), wave: "pulse25", vol: 0.35, decay: 0.08, sustain: 0.5, release: 0.2 });
  note(t, { at: 0.1, dur: 0.35, freq: midi(NOTE("A6")), wave: "pulse25", vol: 0.35, decay: 0.2, sustain: 0.4, release: 0.3, vibrato: 0.006 });
});
// Cross-out: a descending buzz (the cloud gets crossed out).
sfx("cross", 0.4, (t) => note(t, { at: 0, dur: 0.28, freq: midi(NOTE("A4")), wave: "pulse50", vol: 0.35, slide: -30, decay: 0.2, sustain: 0.5, release: 0.08 }));
// Whoosh: filtered noise swell (transitions).
sfx("whoosh", 0.45, (t) => note(t, { at: 0, dur: 0.3, freq: 1800, wave: "noise", vol: 0.25, attack: 0.18, decay: 0.1, sustain: 0.4, release: 0.12, slide: 30 }), 0.45);
// Mic: the push-to-talk "listening" blip, two notes up.
sfx("mic", 0.3, (t) => {
  note(t, { at: 0, dur: 0.06, freq: midi(NOTE("C6")), wave: "pulse25", vol: 0.3, decay: 0.05 });
  note(t, { at: 0.08, dur: 0.08, freq: midi(NOTE("G6")), wave: "pulse25", vol: 0.3, decay: 0.06 });
});
