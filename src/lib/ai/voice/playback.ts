import type { AudioOut } from "./audio-out";
import type { KokoroClient, Synthesis } from "./kokoro";
import { KOKORO, type TTSDevice, type VoiceRole, type VoiceStyle } from "./voices";

export type StartListener = (voice: VoiceRole) => void;

/** One spoken message, fed sentence by sentence while the model is still writing it. */
export interface SpeechPlayback {
  readonly role: VoiceRole;
  text: string;
  finished: boolean;
  /** Called once, when the first sentence actually starts playing. */
  onStart: (() => void) | null;
  readonly done: Promise<void>;
  add(sentence: string): void;
  end(fullText?: string): void;
  cancel(): void;
}

/** Timing of one spoken sentence, for /lab. */
export interface SentenceMetric {
  engine: "kokoro" | "builtin";
  role: VoiceRole;
  voice: string;
  device?: TTSDevice;
  text: string;
  /** Position in its message (0 = first sentence). */
  index: number;
  /** How long this sentence kept the voice waiting: from its turn (or from being added) to samples. */
  synthMs?: number;
  audioSeconds?: number;
  /** Within synthMs: eSpeak's text → phonemes, and the model itself. */
  g2pMs?: number;
  modelMs?: number;
  /** (g2pMs + modelMs) ÷ audio length: below 1 means faster than it takes to say it. */
  rtf?: number;
  /** From the sentence being handed to the voice to its sound reaching the speakers. */
  firstAudioMs?: number;
  /** Set when this sentence went to the built-in voice instead. */
  fallback?: string;
}

export interface NeuralHost {
  out: AudioOut;
  kokoro: KokoroClient;
  style: VoiceStyle;
  device: TTSDevice;
  startListeners: Set<StartListener>;
  /** A sentence slower than this (synthesis ÷ audio) gives up on the neural voice; null = no limit. */
  maxRtf: number | null;
  timeoutMs: number;
  /** The neural voice failed: it stays off for the rest of the session. */
  disable(reason: string): void;
  /** A built-in voice message, for the sentences the neural voice cannot say. */
  builtin(role: VoiceRole, notifyStart: boolean, reason: string): SpeechPlayback;
  metric(metric: SentenceMetric): void;
}

/** A short breath between sentences, as a person reading aloud would leave. */
const SENTENCE_GAP_S = 0.18;
/** Kokoro already ends a clause with its comma pause; only a hair more is needed. */
const CLAUSE_GAP_S = 0.04;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Splits a long first sentence after its opening clause ("I'm Tala, | and
 * I'm so happy you drew me!"): the short clause is voiced sooner, and the
 * rest is ready before it has finished playing. Without a comma, a long
 * sentence splits before a joining word, and the clause gets a comma so it
 * keeps a mid-sentence tune ("I live in a castle, | and I eat pancakes").
 */
export function splitOpening(sentence: string): [string, string] | null {
  if (words(sentence) < 7) return null;
  for (const match of sentence.matchAll(/[,;:—–]\s+/g)) {
    const end = (match.index ?? 0) + 1;
    const [clause, rest] = [sentence.slice(0, end), sentence.slice(end).trim()];
    if (words(clause) >= 2 && words(rest) >= 3) return [clause, rest];
  }
  if (words(sentence) < 11) return null;
  for (const match of sentence.matchAll(/\s(?=(?:and|but|so|because|when|while|with|who|where|then)\s)/gi)) {
    const index = match.index ?? 0;
    const [clause, rest] = [sentence.slice(0, index), sentence.slice(index + 1)];
    if (words(clause) >= 4 && words(rest) >= 4) return [`${clause},`, rest];
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Kokoro speech through Web Audio. Sentence n+1 is synthesised while sentence
 * n plays and is scheduled to start right after it, so a reply flows without
 * gaps. If a sentence fails or is too slow, it and the rest of the message go
 * to the built-in voice, after whatever is already playing.
 */
export class NeuralPlayback implements SpeechPlayback {
  text = "";
  finished = false;
  onStart: (() => void) | null = null;
  readonly done: Promise<void>;
  private release!: () => void;
  private open = true;
  private cancelled = false;
  private started = false;
  private ending = false;
  private failed = false;
  /** Sentences added and not yet finished playing (or handed over). */
  private pending = 0;
  private count = 0;
  private chain: Promise<void> = Promise.resolve();
  private sources = new Set<AudioBufferSourceNode>();
  private scheduledEnd = 0;
  /** Pause owed after the audio scheduled last. */
  private gap = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private builtin: Promise<SpeechPlayback> | null = null;

  constructor(
    readonly role: VoiceRole,
    private host: NeuralHost,
  ) {
    this.done = new Promise((resolve) => (this.release = resolve));
  }

  add(sentence: string) {
    if (this.cancelled || !this.open || !sentence.trim()) return;
    this.text = this.text ? `${this.text} ${sentence}` : sentence;
    const opening = this.count === 0 ? splitOpening(sentence) : null;
    if (opening) {
      this.enqueue(opening[0], CLAUSE_GAP_S);
      this.enqueue(opening[1], SENTENCE_GAP_S);
    } else {
      this.enqueue(sentence, SENTENCE_GAP_S);
    }
  }

  /** `gapAfter`: the pause left after this piece before the next one starts. */
  private enqueue(sentence: string, gapAfter: number) {
    const index = this.count++;
    const addedAt = performance.now();
    this.pending++;
    // Sent to the worker right away so its text → phonemes step overlaps the sentence before.
    let job: Promise<Synthesis> | null = null;
    if (!this.failed) {
      const { voice, speed } = this.host.style;
      job = this.host.kokoro.synthesize(sentence, voice, speed);
      job.catch(() => {});
    }
    this.chain = this.chain.then(() => this.render(sentence, index, addedAt, job, gapAfter));
  }

  end(fullText?: string) {
    this.open = false;
    if (fullText !== undefined) this.text = fullText;
    this.armWatchdog();
    this.check();
  }

  cancel() {
    this.cancelled = true;
    this.open = false;
    this.host.kokoro.cancelPending();
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    void this.builtin?.then((playback) => playback.cancel());
    this.finish();
  }

  private async render(
    sentence: string,
    index: number,
    addedAt: number,
    job: Promise<Synthesis> | null,
    gapAfter: number,
  ) {
    if (this.cancelled) return;
    if (this.failed || !job) return this.handOver(sentence);
    const { host } = this;
    const { voice } = host.style;
    // The clock starts when this sentence's turn comes, not while the one before is voiced.
    const turn = performance.now();
    let result: Synthesis;
    try {
      result = await withTimeout(job, host.timeoutMs, `took over ${host.timeoutMs / 1000} s`);
    } catch (error) {
      if (this.cancelled) return;
      const reason = error instanceof Error ? error.message : String(error);
      // For /lab: how late the sentence really was.
      void job.then((late) =>
        host.metric({
          engine: "kokoro",
          role: this.role,
          voice,
          device: host.device,
          text: sentence,
          index,
          synthMs: performance.now() - Math.max(turn, addedAt),
          g2pMs: late.g2pMs,
          modelMs: late.modelMs,
          audioSeconds: late.audio.length / KOKORO.sampleRate,
          fallback: "arrived too late, not played",
        }),
      );
      this.fail(`Kokoro ${reason}`);
      return this.handOver(sentence, `Kokoro ${reason}`);
    }
    if (this.cancelled) return;
    // Time this sentence kept the voice waiting: from its turn (or from being added, if later) to samples.
    const synthMs = performance.now() - Math.max(turn, addedAt);
    const audioSeconds = result.audio.length / KOKORO.sampleRate;
    // Work done for this sentence (phonemes + model) per second of speech.
    const rtf = (result.g2pMs + result.modelMs) / 1000 / audioSeconds;
    // Too slow for this device: say this sentence (it is ready), then switch.
    if (host.maxRtf !== null && rtf > host.maxRtf && audioSeconds > 1) {
      this.fail(`Kokoro too slow here (real-time factor ${rtf.toFixed(2)})`);
    }
    if (!(await host.out.resume())) {
      // The page has had no tap yet, so Web Audio may not play.
      return this.handOver(sentence, "audio blocked until a tap");
    }
    if (this.cancelled) return;

    const ctx = host.out.ctx;
    const buffer = host.out.buffer(result.audio as Float32Array<ArrayBuffer>, KOKORO.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = host.style.pitch;
    source.connect(host.out.input);
    const at = Math.max(ctx.currentTime + 0.02, this.scheduledEnd ? this.scheduledEnd + this.gap : 0);
    source.start(at);
    this.scheduledEnd = at + buffer.duration / host.style.pitch;
    this.gap = gapAfter;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.pending--;
      this.check();
    };
    this.armWatchdog();

    const untilHeardMs = Math.max(0, (at - ctx.currentTime + host.out.latency) * 1000);
    // From the audio clock, not the timer below, which browsers delay in background tabs.
    const firstAudioMs = performance.now() + untilHeardMs - addedAt;
    this.later(() => {
      host.metric({
        engine: "kokoro",
        role: this.role,
        voice,
        device: host.device,
        text: sentence,
        index,
        synthMs,
        g2pMs: result.g2pMs,
        modelMs: result.modelMs,
        audioSeconds,
        rtf,
        firstAudioMs,
      });
      this.markStarted(true);
    }, untilHeardMs);
  }

  private fail(reason: string) {
    if (this.failed) return;
    this.failed = true;
    this.host.disable(reason);
  }

  /** The rest of this message goes to the built-in voice, once the neural audio already queued has played. */
  private handOver(sentence: string, reason = "neural voice off") {
    this.failed = true;
    if (!this.builtin) {
      const waitMs = Math.max(0, (this.scheduledEnd - this.host.out.ctx.currentTime) * 1000);
      this.builtin = new Promise<void>((resolve) => this.later(resolve, waitMs)).then(() => {
        const playback = this.host.builtin(this.role, !this.started, reason);
        playback.onStart = () => this.markStarted(false);
        return playback;
      });
    }
    void this.builtin.then((playback) => {
      if (!this.cancelled) playback.add(sentence);
    });
    this.pending--;
    this.check();
  }

  private markStarted(notify: boolean) {
    if (this.started || this.cancelled) return;
    this.started = true;
    this.onStart?.();
    if (notify) for (const listener of this.host.startListeners) listener(this.role);
  }

  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  /** Never leave the caller waiting forever if an audio event goes missing. */
  private armWatchdog() {
    if (this.open || this.finished) return;
    if (this.watchdog) clearTimeout(this.watchdog);
    const ctx = this.host.out.ctx;
    const unsaid = Math.max(0, this.pending - this.sources.size);
    const ms = Math.max(0, this.scheduledEnd - ctx.currentTime) * 1000 + unsaid * this.host.timeoutMs + 3000;
    this.watchdog = setTimeout(() => this.finish(), ms);
  }

  private check() {
    if (this.open || this.pending > 0 || this.ending || this.finished) return;
    this.ending = true;
    if (!this.builtin) return this.finish();
    // The built-in voice decides when the message is over.
    if (this.watchdog) clearTimeout(this.watchdog);
    void this.builtin.then((playback) => {
      playback.end();
      return playback.done.then(() => this.finish());
    });
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    if (this.watchdog) clearTimeout(this.watchdog);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.release();
  }
}
