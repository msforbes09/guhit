/**
 * The neural voice's speaker: one AudioContext for the page, with an
 * AnalyserNode between the voice and the speakers so the screen can read how
 * loud the voice is right now (to move a mouth).
 */
export class AudioOut {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private smoothed = 0;
  private lastRead = 0;
  private unlockInstalled = false;

  get supported() {
    return typeof window !== "undefined" && "AudioContext" in window;
  }

  /** Created on first use; browsers keep it suspended until the page has had a tap. */
  get ctx(): AudioContext {
    if (!this.context) {
      const context = new AudioContext({ latencyHint: "interactive" });
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      analyser.connect(context.destination);
      this.context = context;
      this.analyser = analyser;
      this.samples = new Float32Array(analyser.fftSize);
    }
    return this.context;
  }

  get input(): AudioNode {
    void this.ctx;
    return this.analyser!;
  }

  /**
   * Resumes audio on the first tap or key press, so speech that starts later
   * without a gesture (a reply after the model answers) can still play.
   */
  installUnlock() {
    if (this.unlockInstalled || typeof window === "undefined") return;
    this.unlockInstalled = true;
    const unlock = () => {
      void this.resume();
      if (this.context?.state === "running") {
        window.removeEventListener("pointerdown", unlock, true);
        window.removeEventListener("keydown", unlock, true);
      }
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
  }

  /** True once audio can play; false when the browser still blocks it (no tap yet). */
  async resume(timeoutMs = 300): Promise<boolean> {
    const context = this.ctx;
    if (context.state === "running") return true;
    await Promise.race([context.resume().catch(() => {}), new Promise((r) => setTimeout(r, timeoutMs))]);
    return (context.state as AudioContextState) === "running";
  }

  /** Mono samples at their own rate as a buffer the context can play. */
  buffer(audio: Float32Array<ArrayBuffer>, sampleRate: number): AudioBuffer {
    const buffer = this.ctx.createBuffer(1, audio.length, sampleRate);
    buffer.copyToChannel(audio, 0);
    return buffer;
  }

  /** Seconds between asking for a sound to play at time t and it reaching the speakers. */
  get latency(): number {
    const context = this.context;
    if (!context) return 0;
    return (context.outputLatency || 0) + (context.baseLatency || 0);
  }

  /**
   * Loudness 0..1 from the analyser's RMS: quick to open, slower to close
   * (~80 ms), so a mouth follows syllables without flickering.
   */
  level(): number {
    const analyser = this.analyser;
    const samples = this.samples;
    if (!analyser || !samples || this.context?.state !== "running") return (this.smoothed = 0);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    // Kokoro speaks at about -23 dBFS RMS; -50 dB is silence and -12 dB a loud vowel.
    const db = 20 * Math.log10(rms + 1e-9);
    const target = Math.min(1, Math.max(0, (db + 50) / 38));
    const now = performance.now();
    const dt = this.lastRead ? Math.min(250, now - this.lastRead) : 16;
    this.lastRead = now;
    const tau = target > this.smoothed ? 25 : 80;
    this.smoothed += (target - this.smoothed) * (1 - Math.exp(-dt / tau));
    return this.smoothed < 0.02 ? 0 : this.smoothed;
  }
}
