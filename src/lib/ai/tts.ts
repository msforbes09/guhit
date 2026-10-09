import { isMarkedReady } from "./offline";
import { splitSentences } from "./sanitize";
import { AudioOut } from "./voice/audio-out";
import { isKokoroCached, KokoroClient } from "./voice/kokoro";
import {
  NeuralPlayback,
  type NeuralHost,
  type SentenceMetric,
  type SpeechPlayback,
  type StartListener,
} from "./voice/playback";
import {
  chooseTTSDevice,
  findVoice,
  KOKORO,
  PRELOADED_VOICES,
  preferredEngine,
  setPreferredEngine,
  styleFor,
  type TTSDevice,
  type VoiceEngine,
  type VoiceRole,
} from "./voice/voices";

export type { SentenceMetric, SpeechPlayback, VoiceEngine, VoiceRole };

/** On the CPU, a voice slower than this (synthesis time ÷ speech time) would leave gaps; use the built-in one. */
const MAX_WASM_RTF = 0.8;
/** A sentence that takes longer than this to synthesise is said by the built-in voice instead. */
const SENTENCE_TIMEOUT_MS = 4000;

// Voices installed with the OS (localService) keep working with Wi-Fi off;
// browser "Google" voices stream from a server, so they are only a last resort.
const NARRATOR_VOICES = [
  "Samantha",
  "Ava",
  "Allison",
  "Susan",
  "Serena",
  "Karen",
  "Moira",
  "Tessa",
  "Kate",
  "Fiona",
  "Victoria",
  "Microsoft Aria",
  "Microsoft Jenny",
  "Microsoft Zira",
];
const CHARACTER_VOICES = ["Tessa", "Karen", "Moira", "Fiona", "Kate", "Ava", "Samantha", "Microsoft Jenny", "Microsoft Aria"];
const NOVELTY =
  /^(?:Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Junior|Ralph|Fred|Grandpa|Grandma|Rocko|Eddy|Reed)\b/i;

const STYLE: Record<VoiceRole, { rate: number; pitch: number }> = {
  narrator: { rate: 0.95, pitch: 1.05 },
  // A higher, quicker voice makes the drawing sound like its own little person.
  character: { rate: 1.05, pitch: 1.45 },
};

export interface VoiceInfo {
  /** The built-in (OS) voices, used when the neural voice is off. */
  narrator: string | null;
  character: string | null;
  /** True when the built-in narrator voice is installed on the device (works offline). */
  local: boolean;
  /** Which voice speaks now. */
  engine: VoiceEngine;
  /** The neural voice when it loaded: device, measured speed and the Kokoro voices in use. */
  kokoro: { device: TTSDevice; rtf: number; warmupMs: number; narrator: string; character: string } | null;
  /** Why the neural voice is not speaking, when it is not. */
  reason: string | null;
  loadMs?: number;
}

function rank(voices: SpeechSynthesisVoice[], preferred: string[], avoid?: SpeechSynthesisVoice | null) {
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang) && !NOVELTY.test(v.name) && v !== avoid);
  const local = english.filter((v) => v.localService);
  for (const name of preferred) {
    const match = local.find((v) => v.name === name || v.name.startsWith(`${name} `));
    if (match) return match;
  }
  return (
    local.find((v) => /^en[-_]US/i.test(v.lang)) ??
    local[0] ??
    english.find((v) => /^en[-_]US/i.test(v.lang)) ??
    english[0] ??
    null
  );
}

/**
 * Loudness for the built-in voice, which gives no access to its audio: each
 * spoken word bumps the level, which then fades out over ~150 ms. Voices that
 * report no word boundaries get a gentle syllable-like wobble instead.
 */
export class WordMeter {
  private speakingSince: number | null = null;
  private lastWord = 0;
  private peak = 0;

  start() {
    this.speakingSince = performance.now();
    this.lastWord = 0;
  }

  word() {
    this.lastWord = performance.now();
    this.peak = 0.65 + Math.random() * 0.35;
  }

  stop() {
    this.speakingSince = null;
  }

  level(): number {
    if (this.speakingSince === null) return 0;
    const now = performance.now();
    if (this.lastWord) return Math.max(0, this.peak * (1 - (now - this.lastWord) / 150));
    const t = (now - this.speakingSince) / 1000;
    return t < 0.25 ? 0.5 : 0.15 + 0.6 * Math.abs(Math.sin(t * Math.PI * 4));
  }
}

const NO_LISTENERS = new Set<StartListener>();

/** One spoken message through the browser's built-in voice (speechSynthesis). */
export class Playback implements SpeechPlayback {
  text = "";
  finished = false;
  /** Called once, when the first sentence starts playing. */
  onStart: (() => void) | null = null;
  readonly done: Promise<void>;
  private started = false;
  private open = true;
  private cancelled = false;
  private pending = 0;
  private count = 0;
  private utterances: SpeechSynthesisUtterance[] = [];
  private release!: () => void;
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly role: VoiceRole,
    private voice: SpeechSynthesisVoice | null,
    private meter: WordMeter,
    private startListeners: Set<StartListener>,
    private metric: ((m: SentenceMetric) => void) | null = null,
    private reason?: string,
  ) {
    this.done = new Promise((resolve) => (this.release = resolve));
  }

  add(sentence: string) {
    if (this.cancelled || !sentence.trim()) return;
    this.text = this.text ? `${this.text} ${sentence}` : sentence;
    if (!("speechSynthesis" in window)) return;
    const addedAt = performance.now();
    const index = this.count++;
    const utterance = new SpeechSynthesisUtterance(sentence);
    if (this.voice) {
      utterance.voice = this.voice;
      utterance.lang = this.voice.lang;
    } else {
      utterance.lang = "en-US";
    }
    utterance.rate = STYLE[this.role].rate;
    utterance.pitch = STYLE[this.role].pitch;
    utterance.onstart = () => {
      if (this.cancelled) return;
      this.meter.start();
      this.metric?.({
        engine: "builtin",
        role: this.role,
        voice: this.voice?.name ?? "default",
        text: sentence,
        index,
        firstAudioMs: performance.now() - addedAt,
        fallback: this.reason,
      });
      if (this.started) return;
      this.started = true;
      this.onStart?.();
      for (const listener of this.startListeners) listener(this.role);
    };
    utterance.onboundary = (event) => {
      if (!this.cancelled && event.name === "word") this.meter.word();
    };
    utterance.onend = utterance.onerror = () => {
      this.meter.stop();
      this.pending--;
      this.check();
    };
    this.pending++;
    // Chrome drops the end event of utterances that were garbage collected.
    this.utterances.push(utterance);
    window.speechSynthesis.speak(utterance);
  }

  end(fullText?: string) {
    this.open = false;
    if (fullText !== undefined) this.text = fullText;
    // Chrome occasionally never fires "end"; never leave the caller waiting forever.
    const words = this.text.split(/\s+/).length;
    this.watchdog = setTimeout(() => this.finish(), 4000 + (words / 2.5 / STYLE[this.role].rate) * 1000);
    this.check();
  }

  cancel() {
    this.cancelled = true;
    this.open = false;
    this.finish();
  }

  private check() {
    if (!this.open && this.pending <= 0) this.finish();
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.meter.stop();
    if (this.watchdog) clearTimeout(this.watchdog);
    this.utterances = [];
    this.release();
  }
}

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

/**
 * Speaks with Kokoro (an on-device neural voice) when it is loaded and keeps
 * up, and with the browser's built-in voice otherwise. Once the neural voice
 * fails or falls behind, the built-in voice speaks for the rest of the session.
 */
export class Speaker {
  /** The page's speaker, so /lab can switch voices and read sentence timings. */
  static latest: Speaker | null = null;
  private voices: Record<VoiceRole, SpeechSynthesisVoice | null> = { narrator: null, character: null };
  private initPromise: Promise<void> | null = null;
  private active: SpeechPlayback | null = null;
  private meter = new WordMeter();
  private out = new AudioOut();
  private startListeners = new Set<StartListener>();
  private kokoro: KokoroClient | null = null;
  private neural: { device: TTSDevice; rtf: number; warmupMs: number } | null = null;
  /** Set when the neural voice gave up for this session (or never loaded). */
  private reason: string | null = null;
  private loadMs: number | undefined;
  private loading: Promise<VoiceInfo> | null = null;
  /** "?ttsForce=1" keeps the neural voice on even when it measures too slow (for /lab). */
  private forced = false;
  /** Every spoken sentence's timing, for /lab. */
  onMetric: ((metric: SentenceMetric) => void) | null = null;

  constructor() {
    Speaker.latest = this;
  }

  get supported() {
    return typeof window !== "undefined" && ("speechSynthesis" in window || this.out.supported);
  }

  /** Picks the built-in voices (always needed: they are the fallback). */
  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.pickVoices();
    return this.initPromise;
  }

  private async pickVoices(): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    if (voices.length === 0) {
      // Chrome fills the voice list asynchronously.
      await new Promise<void>((resolve) => {
        const done = () => {
          synth.removeEventListener("voiceschanged", done);
          resolve();
        };
        synth.addEventListener("voiceschanged", done);
        setTimeout(done, 2000);
      });
      voices = synth.getVoices();
    }
    const narrator = rank(voices, NARRATOR_VOICES);
    const character = rank(voices, CHARACTER_VOICES, narrator) ?? narrator;
    this.voices = { narrator, character };
  }

  info(): VoiceInfo {
    const { narrator, character } = this.voices;
    return {
      narrator: narrator?.name ?? null,
      character: character?.name ?? null,
      local: narrator?.localService ?? false,
      engine: this.useNeural() ? "kokoro" : "builtin",
      kokoro: this.neural
        ? { ...this.neural, narrator: styleFor("narrator").voice, character: styleFor("character").voice }
        : null,
      reason: this.reason ?? (preferredEngine() === "builtin" ? "built-in voice chosen in /lab" : null),
      loadMs: this.loadMs,
    };
  }

  /**
   * Loads the neural voice (downloading it only from /setup or /lab, or before
   * the first setup), and always the built-in voices as the fallback. Never
   * throws: without Kokoro, Guhit speaks with the built-in voice.
   */
  load(
    support: { webgpu: boolean; mobile: boolean },
    modelHost: string | null,
    onProgress: (loaded: number, total: number, text: string) => void,
  ): Promise<VoiceInfo> {
    // /lab may load the voice on its own before the engine loads everything.
    if (!this.loading) {
      this.loading = this.loadVoice(support, modelHost, onProgress).finally(() => (this.loading = null));
    }
    return this.loading;
  }

  private async loadVoice(
    support: { webgpu: boolean; mobile: boolean },
    modelHost: string | null,
    onProgress: (loaded: number, total: number, text: string) => void,
  ): Promise<VoiceInfo> {
    const started = performance.now();
    await this.init();
    this.out.installUnlock();
    const search = window.location.search;
    this.forced = new URLSearchParams(search).get("ttsForce") === "1";
    const device = chooseTTSDevice(support, search);
    const total = (KOKORO.modelMB[device] + KOKORO.voiceMB * PRELOADED_VOICES.length) * 1e6;
    // The download may start only where a parent asked for it, never on a kid screen.
    const mayDownload = !isMarkedReady() || /^\/(setup|lab)\b/.test(window.location.pathname);

    if (!this.out.supported) {
      this.reason = "Web Audio is missing";
    } else if (!this.kokoro && !mayDownload && !(await isKokoroCached(device))) {
      this.reason = "Kokoro is not downloaded yet (open /setup)";
    } else if (!this.kokoro) {
      onProgress(0, total, "Getting the storytelling voice ready…");
      const kokoro = new KokoroClient();
      try {
        const first = [styleFor("narrator").voice, styleFor("character").voice];
        const voices = [...new Set([...first, ...PRELOADED_VOICES])];
        const { warmupMs, rtf } = await kokoro.load(device, modelHost, voices, (loaded, size) => {
          const expected = Math.max(size, total);
          onProgress(loaded, expected, `Downloading the storytelling voice… ${Math.round((loaded / expected) * 100)}%`);
        });
        if (device === "wasm" && rtf > MAX_WASM_RTF && !this.forced) {
          kokoro.dispose();
          this.reason = `Kokoro is slower than speech on this device (real-time factor ${rtf.toFixed(2)})`;
        } else {
          this.kokoro = kokoro;
          this.neural = { device, rtf, warmupMs };
          this.reason = null;
        }
      } catch (error) {
        kokoro.dispose();
        this.reason = `Kokoro failed to load: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    this.loadMs = performance.now() - started;
    const info = this.info();
    const voiceName = (id: string) => findVoice(id)?.name ?? id;
    onProgress(
      total,
      total,
      info.engine === "kokoro" && info.kokoro
        ? `Voice ready (Kokoro ${voiceName(info.kokoro.narrator)} and ${voiceName(info.kokoro.character)})`
        : info.narrator
          ? `Using the device voice (${info.narrator})`
          : "No voice found on this device",
    );
    return info;
  }

  private useNeural(): boolean {
    return !!this.kokoro && !this.reason && preferredEngine() === "kokoro";
  }

  /** For /lab: switch between Kokoro and the built-in voice; choosing Kokoro again clears a fallback. */
  setEngine(engine: VoiceEngine) {
    setPreferredEngine(engine);
    if (engine === "kokoro" && this.kokoro) this.reason = null;
  }

  private builtinPlayback(role: VoiceRole, notifyStart: boolean, reason?: string): Playback {
    const listeners = notifyStart ? this.startListeners : NO_LISTENERS;
    return new Playback(role, this.voices[role], this.meter, listeners, (m) => this.onMetric?.(m), reason);
  }

  private neuralHost(role: VoiceRole, kokoro: KokoroClient, device: TTSDevice): NeuralHost {
    return {
      out: this.out,
      kokoro,
      style: styleFor(role),
      device,
      startListeners: this.startListeners,
      maxRtf: device === "wasm" && !this.forced ? MAX_WASM_RTF : null,
      timeoutMs: SENTENCE_TIMEOUT_MS,
      disable: (reason) => {
        this.reason = reason;
      },
      builtin: (r, notify, reason) => this.builtinPlayback(r, notify, reason),
      metric: (m) => this.onMetric?.(m),
    };
  }

  /** Starts a message that is spoken sentence by sentence as text arrives. */
  stream(role: VoiceRole): SpeechPlayback {
    this.stop();
    const playback =
      this.useNeural() && this.kokoro && this.neural
        ? new NeuralPlayback(role, this.neuralHost(role, this.kokoro, this.neural.device))
        : this.builtinPlayback(role, true, this.kokoro ? (this.reason ?? undefined) : undefined);
    this.active = playback;
    return playback;
  }

  async speak(text: string, role: VoiceRole = "narrator"): Promise<void> {
    if (!this.supported) return;
    // A streamed reply is often still being spoken when the screen asks to
    // speak the same text: join it instead of starting over.
    const active = this.active;
    if (active && !active.finished && active.role === role && same(active.text, text)) return active.done;
    await this.init();
    const playback = this.stream(role);
    for (const sentence of splitSentences(text)) playback.add(sentence);
    playback.end(text);
    return playback.done;
  }

  stop() {
    this.active?.cancel();
    this.active = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  /** 0..1: the neural voice's measured loudness, or the built-in voice's word-by-word estimate. */
  level(): number {
    return Math.max(this.out.level(), this.meter.level());
  }

  onStart(listener: StartListener): () => void {
    this.startListeners.add(listener);
    return () => this.startListeners.delete(listener);
  }
}
