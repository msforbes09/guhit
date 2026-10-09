import type { Character, Story } from "@/lib/story/types";
import { chooseModels, detectSupport, type DeviceSupport, type ModelChoice } from "./device";
import type { LLMClient } from "./llm";
import { findLLM, findSTT, findVision, STT_DTYPES } from "./models";
import { isMarkedReady, markReady, requestPersistence } from "./offline";
import {
  firstQuestionMessages,
  nextQuestionMessages,
  replyMessages,
  titleMessages,
  writePageMessages,
  type Message,
} from "./prompts";
import {
  breaksCharacter,
  cleanLine,
  cleanPage,
  cleanQuestion,
  cleanCaption,
  cleanTitle,
  isUnsafe,
  SentenceStream,
} from "./sanitize";
import type { STTClient } from "./stt";
import type { VisionClient } from "./vision";
import { Speaker, type VoiceInfo } from "./tts";
import type { AIStatus, ChatTurn, DrawingDescription, DrawingPhoto, LoadProgress, LocalAI } from "./types";

export type CallKind =
  | "reply"
  | "firstQuestion"
  | "nextQuestion"
  | "writePage"
  | "title"
  | "transcribe"
  | "describe";

export interface CallMetric {
  kind: CallKind;
  text: string;
  /** Wall time of the whole call. */
  ms: number;
  /** For replies: time until the first sentence was handed to speech. */
  firstSentenceMs?: number;
  /** For replies: time until the voice actually started (filled in when it does). */
  firstSpokenMs?: number;
  firstTokenMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  decodeTps?: number;
  prefillTps?: number;
  audioSeconds?: number;
  /** For drawing descriptions: the model's caption before clean-up. */
  detail?: string;
  fallback?: boolean;
}

export interface LoadTimings {
  totalMs?: number;
  llmMs?: number;
  sttMs?: number;
  sttWarmupMs?: number;
  visionMs?: number;
  visionWarmupMs?: number;
  ttsMs?: number;
}

const MAX_REPLY_SENTENCES = 2;

const FALLBACK_QUESTIONS = [
  (name: string) => `Where does ${name} live?`,
  (name: string) => `What does ${name} love to do?`,
  (name: string) => `Who is ${name}'s best friend?`,
  (name: string) => `What makes ${name} laugh?`,
  (name: string) => `Where does ${name} want to go today?`,
];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Compares questions ignoring case, punctuation and spacing. */
const sameText = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** The on-device engine: WebLLM for words, Whisper for listening, the OS voice for speaking. */
export class RealAI implements LocalAI {
  /** Speak each reply sentence as soon as it is written, so the character starts talking sooner. */
  autoSpeakReplies = true;
  error: string | null = null;
  /** Set when drawing recognition failed to load; everything else still works without it. */
  visionError: string | null = null;
  support: DeviceSupport | null = null;
  choice: ModelChoice | null = null;
  voices: VoiceInfo | null = null;
  readonly timings: LoadTimings = {};
  readonly metrics: CallMetric[] = [];
  onMetric: ((metric: CallMetric) => void) | null = null;

  private state: AIStatus = "idle";
  private loading: Promise<void> | null = null;
  private listeners = new Set<(p: LoadProgress) => void>();
  private llm: LLMClient | null = null;
  private stt: STTClient | null = null;
  private vision: VisionClient | null = null;
  private speaker = new Speaker();

  status(): AIStatus {
    return this.state;
  }

  load(onProgress: (p: LoadProgress) => void): Promise<void> {
    if (this.state === "ready") return Promise.resolve();
    this.listeners.add(onProgress);
    if (!this.loading) {
      this.loading = this.loadAll().finally(() => {
        this.loading = null;
        this.listeners.clear();
      });
    }
    return this.loading;
  }

  private emit(progress: LoadProgress) {
    for (const listener of this.listeners) listener(progress);
  }

  private async loadAll() {
    this.state = "loading";
    this.error = null;
    const started = performance.now();
    try {
      const support = await detectSupport();
      this.support = support;
      if (!support.webgpu) throw new Error(support.problem);
      const choice = chooseModels(support, window.location.search);
      this.choice = choice;
      void requestPersistence();

      const [{ LLMClient }, { STTClient }, { VisionClient }] = await Promise.all([
        import("./llm"),
        import("./stt"),
        import("./vision"),
      ]);
      // Downloads run side by side: the first visit is bound by network, not GPU.
      const [, , , voices] = await Promise.all([
        this.loadLLM(new LLMClient(), choice),
        this.loadSTT(new STTClient(), choice),
        this.loadVision(new VisionClient(), choice),
        // Never fails the load: without the neural voice, the built-in one speaks.
        this.speaker.load(support, choice.modelHost, (loaded, total, text) =>
          this.emit({ stage: "tts", loaded, total, text }),
        ),
      ]);
      this.voices = voices;
      this.timings.ttsMs = voices.loadMs;

      this.timings.totalMs = performance.now() - started;
      this.state = "ready";
      markReady(true);
    } catch (error) {
      this.state = "error";
      this.error = error instanceof Error ? error.message : String(error);
      // Most often the cache was cleared while offline: send the parent back to setup.
      markReady(false);
      throw error;
    }
  }

  private async loadLLM(llm: LLMClient, choice: ModelChoice) {
    const started = performance.now();
    const total = (findLLM(choice.llm)?.downloadMB ?? 1000) * 1e6;
    this.emit({ stage: "llm", loaded: 0, total, text: "Getting the story helper ready…" });
    await llm.load(choice.llm, choice.modelHost, (report) => {
      const percent = Math.round(report.progress * 100);
      const text = /fetching/i.test(report.text)
        ? `Downloading the story helper… ${percent}%`
        : /cache/i.test(report.text)
          ? `Waking up the story helper… ${percent}%`
          : `Getting the story helper ready… ${percent}%`;
      this.emit({ stage: "llm", loaded: Math.round(report.progress * total), total, text });
    });
    // A one-token run compiles the remaining GPU kernels before the child is waiting.
    await llm.generate([{ role: "user", content: "Hi" }], { maxTokens: 1 });
    this.llm = llm;
    this.timings.llmMs = performance.now() - started;
    this.emit({ stage: "llm", loaded: total, total, text: "Story helper ready" });
  }

  private async loadSTT(stt: STTClient, choice: ModelChoice) {
    const started = performance.now();
    const expected = (findSTT(choice.stt)?.downloadMB[choice.sttDevice] ?? 100) * 1e6;
    this.emit({ stage: "stt", loaded: 0, total: expected, text: "Getting the listening ears ready…" });
    const { warmupMs } = await stt.load(
      choice.stt,
      choice.sttDevice,
      STT_DTYPES[choice.sttDevice],
      choice.modelHost,
      (loaded, total) => {
        const size = Math.max(total, expected);
        this.emit({
          stage: "stt",
          loaded,
          total: size,
          text: `Downloading the listening ears… ${Math.round((loaded / size) * 100)}%`,
        });
      },
    );
    this.stt = stt;
    this.timings.sttMs = performance.now() - started;
    this.timings.sttWarmupMs = warmupMs;
    this.emit({ stage: "stt", loaded: expected, total: expected, text: "Listening ears ready" });
  }

  /** Optional: if it fails, describeDrawing() answers "no guess" and the talk loop is unaffected. */
  private async loadVision(vision: VisionClient, choice: ModelChoice) {
    const started = performance.now();
    const model = findVision(choice.vision);
    const expected = (model?.downloadMB ?? 200) * 1e6;
    this.emit({ stage: "vision", loaded: 0, total: expected, text: "Getting the seeing eyes ready…" });
    try {
      const { warmupMs } = await vision.load(
        choice.vision,
        choice.visionDevice,
        model?.dtype ?? {},
        choice.modelHost,
        (loaded, total) => {
          const size = Math.max(total, expected);
          this.emit({
            stage: "vision",
            loaded,
            total: size,
            text: `Downloading the seeing eyes… ${Math.round((loaded / size) * 100)}%`,
          });
        },
      );
      this.vision = vision;
      this.timings.visionMs = performance.now() - started;
      this.timings.visionWarmupMs = warmupMs;
      this.emit({ stage: "vision", loaded: expected, total: expected, text: "Seeing eyes ready" });
    } catch (error) {
      this.visionError = error instanceof Error ? error.message : String(error);
      this.emit({ stage: "vision", loaded: expected, total: expected, text: "Drawing recognition is not available here" });
    }
  }

  /**
   * Methods load the models on demand, but only once a parent has run setup:
   * a 1 GB download must never start from a kid screen by surprise.
   */
  private async ready(): Promise<{ llm: LLMClient; stt: STTClient }> {
    if (this.state !== "ready") {
      if (!this.loading && !isMarkedReady()) {
        throw new Error("Guhit is not set up on this device yet. Open the setup page first.");
      }
      await this.load(() => {});
    }
    return { llm: this.llm!, stt: this.stt! };
  }

  private record(metric: CallMetric): CallMetric {
    this.metrics.push(metric);
    this.onMetric?.(metric);
    return metric;
  }

  private llmMetric(kind: CallKind, text: string, started: number, llm: LLMClient, extra: Partial<CallMetric> = {}) {
    const stats = llm.lastStats;
    return this.record({
      kind,
      text,
      ms: performance.now() - started,
      firstTokenMs: stats?.firstTokenMs,
      promptTokens: stats?.promptTokens,
      completionTokens: stats?.completionTokens,
      decodeTps: stats?.decodeTps,
      prefillTps: stats?.prefillTps,
      ...extra,
    });
  }

  /** An empty label means "no guess": the screen asks the child instead of "Is that …?". */
  async describeDrawing(png: string, photo?: DrawingPhoto): Promise<DrawingDescription> {
    await this.ready();
    const vision = this.vision;
    if (!vision || (!png && !photo)) return { label: "" };
    const started = performance.now();
    try {
      // The original photo reads better than the cut-out on white (tested in /lab).
      const { caption } = photo ? await vision.describe(photo.image, photo.crop) : await vision.describe(png);
      const label = cleanCaption(caption);
      this.record({ kind: "describe", text: label, detail: caption, ms: performance.now() - started, fallback: !label });
      return { label };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.record({ kind: "describe", text: "", detail, ms: performance.now() - started, fallback: true });
      return { label: "" };
    }
  }

  async transcribe(audio: Blob): Promise<string> {
    const { stt } = await this.ready();
    const started = performance.now();
    const result = await stt.transcribe(audio);
    this.record({
      kind: "transcribe",
      text: result.text,
      ms: performance.now() - started,
      audioSeconds: result.audioSeconds,
    });
    return result.text;
  }

  async reply(character: Character, history: ChatTurn[], childSays: string): Promise<string> {
    const { llm } = await this.ready();
    const started = performance.now();
    const splitter = new SentenceStream();
    const playback = this.autoSpeakReplies ? this.speaker.stream("character") : null;
    const sentences: string[] = [];
    let firstSentenceMs: number | undefined;
    let firstSpokenMs: number | undefined;
    let metric: CallMetric | null = null;
    let rejected = false;
    if (playback) {
      playback.onStart = () => {
        firstSpokenMs = performance.now() - started;
        if (metric) {
          metric.firstSpokenMs = firstSpokenMs;
          this.onMetric?.(metric);
        }
      };
    }

    const accept = (raw: string): boolean => {
      const sentence = cleanLine(raw, character.name);
      if (!sentence) return true;
      if (isUnsafe(sentence) || breaksCharacter(sentence)) {
        rejected = true;
        return false;
      }
      sentences.push(sentence);
      firstSentenceMs ??= performance.now() - started;
      playback?.add(sentence);
      return sentences.length < MAX_REPLY_SENTENCES;
    };

    await llm.generate(replyMessages(character, history, childSays), {
      maxTokens: 60,
      // Lower than the default: small models drift into nonsense at higher temperatures.
      temperature: 0.6,
      onText: (delta) => {
        for (const sentence of splitter.push(delta)) if (!accept(sentence)) return false;
      },
    });
    if (!rejected && sentences.length < MAX_REPLY_SENTENCES) for (const s of splitter.flush()) accept(s);

    let text = sentences.join(" ");
    const fallback = !text;
    if (fallback) {
      text = `Hee hee! I'm ${character.name}, and I love talking with you. What should we do next?`;
      playback?.add(text);
    }
    playback?.end(text);
    metric = this.llmMetric("reply", text, started, llm, { firstSentenceMs, firstSpokenMs, fallback });
    return text;
  }

  /**
   * Runs a prompt, cleans the output, and retries once before falling back.
   * The retry is cooler by default (fixes format slips); repeats need a warmer one.
   */
  private async complete(
    kind: CallKind,
    messages: Message[],
    maxTokens: number,
    clean: (raw: string) => string | null,
    fallback: () => string,
    temperatures = [0.7, 0.3],
  ): Promise<string> {
    const { llm } = await this.ready();
    const started = performance.now();
    for (const temperature of temperatures) {
      const text = clean(await llm.generate(messages, { maxTokens, temperature }));
      if (text) {
        this.llmMetric(kind, text, started, llm);
        return text;
      }
    }
    const text = fallback();
    this.llmMetric(kind, text, started, llm, { fallback: true });
    return text;
  }

  firstQuestion(character: Character): Promise<string> {
    return this.complete("firstQuestion", firstQuestionMessages(character), 40, cleanQuestion, () =>
      FALLBACK_QUESTIONS[0](character.name),
    );
  }

  nextQuestion(story: Story): Promise<string> {
    const name = story.character.name;
    // Small models happily ask the same question again despite being told not to.
    const asked = new Set(story.pages.map((p) => sameText(p.question)));
    const fresh = (raw: string) => {
      const question = cleanQuestion(raw);
      return question && !asked.has(sameText(question)) ? question : null;
    };
    const unasked = () =>
      FALLBACK_QUESTIONS.map((q) => q(name)).find((q) => !asked.has(sameText(q))) ??
      `What happens to ${name} next?`;
    return this.complete("nextQuestion", nextQuestionMessages(story), 40, fresh, unasked, [0.8, 1.1]);
  }

  writePage(story: Story, question: string, answer: string): Promise<string> {
    return this.complete("writePage", writePageMessages(story, question, answer), 120, cleanPage, () => {
      const idea = answer.trim().replace(/[.!?]+$/, "");
      const told = idea && !isUnsafe(idea) ? `${capitalize(idea)}. ` : "";
      return `${told}${story.character.name} had a happy day. What happens next? Draw it for me!`;
    });
  }

  titleFor(story: Story): Promise<string> {
    return this.complete("title", titleMessages(story), 20, cleanTitle, () => `The Story of ${story.character.name}`);
  }

  async speak(text: string, voice: "narrator" | "character" = "narrator"): Promise<void> {
    await this.speaker.speak(text, voice);
  }

  stopSpeaking(): void {
    this.speaker.stop();
  }

  speechLevel(): number {
    return this.speaker.level();
  }

  onSpeechStart(cb: (voice: "narrator" | "character") => void): () => void {
    return this.speaker.onStart(cb);
  }
}
