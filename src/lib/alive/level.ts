/**
 * Loudness 0..1 from live audio, for <AliveCharacter level={meter.level}>.
 * Read every animation frame without React re-renders. Connect whatever
 * plays the character's voice (TTS output, an <audio> element, the mic) to
 * `meter.input`.
 */
export interface LevelMeter {
  /** Connect the voice to this node. It passes audio through unchanged. */
  input: AnalyserNode;
  level: () => number;
}

export function createLevelMeter(ctx: AudioContext): LevelMeter {
  const input = ctx.createAnalyser();
  input.fftSize = 1024;
  input.smoothingTimeConstant = 0.2;
  const buf = new Float32Array(input.fftSize);
  return {
    input,
    level: () => {
      input.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // Speech RMS sits around 0.02-0.2; map that range onto 0..1.
      return Math.max(0, Math.min(1, (rms - 0.015) * 6));
    },
  };
}

/** Meter for an <audio>/<video> element that also keeps it audible. */
export function meterMediaElement(ctx: AudioContext, el: HTMLMediaElement): LevelMeter {
  const meter = createLevelMeter(ctx);
  const src = ctx.createMediaElementSource(el);
  src.connect(meter.input);
  meter.input.connect(ctx.destination);
  return meter;
}

/** Meter for a MediaStream (e.g. the microphone); not routed to the speakers. */
export function meterStream(ctx: AudioContext, stream: MediaStream): LevelMeter {
  const meter = createLevelMeter(ctx);
  ctx.createMediaStreamSource(stream).connect(meter.input);
  return meter;
}
