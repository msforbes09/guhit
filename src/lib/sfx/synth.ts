/**
 * The 8-bit building blocks: pulse, square and triangle tones with short
 * envelopes, and crunchy noise. Every node stops and disconnects itself.
 */

export type Wave = "square" | "triangle" | "sine" | "pulse25" | "pulse12";

/** MIDI note number to Hz (69 = A4 = 440 Hz). */
export const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

const pulses = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

/** The thin, nasal NES pulse: high for `duty` of each cycle. */
function pulse(ctx: BaseAudioContext, duty: number): PeriodicWave {
  let byDuty = pulses.get(ctx);
  if (!byDuty) pulses.set(ctx, (byDuty = new Map()));
  let wave = byDuty.get(duty);
  if (!wave) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = Math.sin(2 * Math.PI * k * duty) / (Math.PI * k);
      imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (Math.PI * k);
    }
    wave = ctx.createPeriodicWave(real, imag);
    byDuty.set(duty, wave);
  }
  return wave;
}

export function setWave(ctx: BaseAudioContext, osc: OscillatorNode, wave: Wave): void {
  if (wave === "pulse25") osc.setPeriodicWave(pulse(ctx, 0.25));
  else if (wave === "pulse12") osc.setPeriodicWave(pulse(ctx, 0.125));
  else osc.type = wave;
}

export interface ToneOptions {
  at: number;
  dur: number;
  /** One pitch, or several glided through evenly over the note. */
  f: number | number[];
  wave?: Wave;
  gain?: number;
  /** "hold" stays loud then lets go; "pluck" dies away like a plucked string. */
  shape?: "hold" | "pluck";
  vibrato?: { rate: number; cents: number };
}

export function tone(ctx: BaseAudioContext, out: AudioNode, o: ToneOptions): void {
  const osc = ctx.createOscillator();
  setWave(ctx, osc, o.wave ?? "square");
  const freqs = Array.isArray(o.f) ? o.f : [o.f];
  const end = o.at + o.dur;
  osc.frequency.setValueAtTime(freqs[0], o.at);
  const step = o.dur / Math.max(1, freqs.length - 1);
  freqs.slice(1).forEach((f, i) => osc.frequency.exponentialRampToValueAtTime(f, o.at + step * (i + 1)));

  const env = ctx.createGain();
  envelope(env.gain, o.at, end, o.gain ?? 0.4, o.shape ?? "hold");
  osc.connect(env).connect(out);

  const nodes: AudioNode[] = [osc, env];
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate;
    depth.gain.value = o.vibrato.cents;
    lfo.connect(depth).connect(osc.detune);
    lfo.start(o.at);
    lfo.stop(end + 0.02);
    nodes.push(lfo, depth);
  }
  osc.start(o.at);
  osc.stop(end + 0.02);
  osc.onended = () => nodes.forEach((n) => n.disconnect());
}

/** A short attack (no clicks), then held or plucked down to silence by `end`. */
function envelope(param: AudioParam, at: number, end: number, peak: number, shape: "hold" | "pluck"): void {
  const attack = Math.min(0.006, (end - at) / 4);
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(peak, at + attack);
  if (shape === "pluck") {
    param.exponentialRampToValueAtTime(0.001, end);
  } else {
    const release = Math.min(0.03, (end - at) / 3);
    param.setValueAtTime(peak, end - release);
    param.linearRampToValueAtTime(0, end);
  }
}

/** Notes one after another, each `step` long; returns when the last one ends. */
export function seq(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  notes: number[],
  step: number,
  o: Omit<ToneOptions, "at" | "dur" | "f"> = {},
): number {
  notes.forEach((note, i) => tone(ctx, out, { ...o, at: at + i * step, dur: step * 0.92, f: hz(note) }));
  return at + notes.length * step;
}

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

/** A second of noise, each value held for a few samples: the console's grainy hiss. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noises.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let value = 0;
    for (let i = 0; i < data.length; i++) {
      if (i % 4 === 0) value = Math.random() * 2 - 1;
      data[i] = value;
    }
    noises.set(ctx, buffer);
  }
  return buffer;
}

export interface NoiseOptions {
  at: number;
  dur: number;
  gain?: number;
  /** Playback speed of the noise: low is a rumble, 1 is a hiss. */
  rate?: number;
  filter?: { type: BiquadFilterType; freq: number };
  shape?: "hold" | "pluck";
}

export function noise(ctx: BaseAudioContext, out: AudioNode, o: NoiseOptions): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.playbackRate.value = o.rate ?? 1;
  const end = o.at + o.dur;
  const env = ctx.createGain();
  envelope(env.gain, o.at, end, o.gain ?? 0.25, o.shape ?? "pluck");
  const nodes: AudioNode[] = [src, env];
  if (o.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter.type;
    filter.frequency.value = o.filter.freq;
    src.connect(filter).connect(env);
    nodes.push(filter);
  } else src.connect(env);
  env.connect(out);
  src.start(o.at, Math.random() * 0.5);
  src.stop(end + 0.02);
  src.onended = () => nodes.forEach((n) => n.disconnect());
}
