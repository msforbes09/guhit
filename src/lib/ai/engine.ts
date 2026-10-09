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
  splitSentences,
} from "./sanitize";
import { screen, topicChange } from "./safety";
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
  /** For drawing descriptions: time spent loading the vision model for this guess (it is freed after each). */
  loadMs?: number;
  /** For drawing descriptions: the model's caption before clean-up. */
  detail?: string;
  fallback?: boolean;
}

export interface LoadTimings {
  totalMs?: number;
  llmMs?: number;
  sttMs?: number;
  sttWarmupMs?: number;
  /** The most recent vision model load (it is loaded per guess, see acquireVision). */
  visionMs?: number;
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

const WARMUP_CHARACTER: Character = {
  id: "warmup",
  name: "Pip",
  description: "a small green turtle who likes to sing",
  drawing: "",
};

/** Said instead of a model sentence that failed the safety screen. */
const SAFE_SENTENCE = "Let's think about something happy instead!";

/** The character's name and description come from the child, so they are screened too. */
function safeCharacter(character: Character): Character {
  const name = screen(character.name, "child").ok ? character.name : "Friend";
  const description = screen(character.description, "child").ok ? character.description : "";
  return name === character.name && description === character.description
    ? character
    : { ...character, name, description };
}

/** Earlier answers that failed the screen are left out of every prompt. */
function safeStory(story: Story): Story {
  return {
    ...story,
    character: safeCharacter(story.character),
    pages: story.pages.map((page) => (screen(page.answer, "child").ok ? page : { ...page, answer: "" })),
  };
}

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
  private visionUsers = 0;
  private prefetchHeld = false;
  private visionLoading: Promise<VisionClient | null> | null = null;
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

      const [{ LLMClient }, { STTClient }] = await Promise.all([import("./llm"), import("./stt")]);
      // Downloads run side by side: the first visit is bound by network, not GPU.
      // Drawing recognition is not loaded here: it is loaded for each guess and
      // freed straight after, so it never holds GPU memory during the talk loop.
      await Promise.all([this.loadLLM(new LLMClient(), choice), this.loadSTT(new STTClient(), choice)]);

      const ttsStarted = performance.now();
      this.voices = await this.speaker.init();
      this.timings.ttsMs = performance.now() - ttsStarted;
      this.emit({
        stage: "tts",
        loaded: 1,
        total: 1,
        text: this.voices.narrator ? `Voice ready (${this.voices.narrator})` : "No voice found on this device",
      });

      this.timings.totalMs = performance.now() - started;
      this.state = "ready";
      markReady(true);
      this.prefetchVision();
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
    // A short run on a reply-sized prompt compiles the GPU kernels for prompts of
    // that length now, so the character's first real answer is not the slow one.
    await llm.generate(replyMessages(WARMUP_CHARACTER, [], ""), { maxTokens: 4 });
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

  /**
   * Drawing recognition is loaded for each guess (from the browser cache once
   * setup has run) and freed afterwards, so its GPU memory never competes with
   * the talk loop. Overlapping guesses share one load.
   */
  private acquireVision(onProgress?: (p: LoadProgress) => void): Promise<VisionClient | null> {
    this.visionUsers++;
    if (this.vision) return Promise.resolve(this.vision);
    if (!this.visionLoading) {
      this.visionLoading = this.loadVision(onProgress).finally(() => {
        this.visionLoading = null;
      });
    }
    return this.visionLoading;
  }

  /**
   * Once the talk loop is ready, the first guess's model starts loading in the
   * background, so "Is that …?" does not wait for it. That guess frees it
   * again; later drawings load it on demand.
   */
  private prefetchVision() {
    if (this.prefetchHeld || this.vision || this.visionLoading) return;
    this.prefetchHeld = true;
    void this.acquireVision();
  }

  /** A guess takes over the background load's hold, so freeing after the guess really frees it. */
  private takeOverPrefetch() {
    if (!this.prefetchHeld) return;
    this.prefetchHeld = false;
    this.visionUsers = Math.max(0, this.visionUsers - 1);
  }

  /** Frees the vision model's GPU memory once no guess is using it. */
  private releaseVision() {
    this.visionUsers = Math.max(0, this.visionUsers - 1);
    if (this.visionUsers === 0 && this.vision) {
      this.vision.dispose();
      this.vision = null;
      // After the vision model has used the GPU, the next reply was cold
      // (7–8 s instead of ~1 s in /lab). Warming the LLM again now hides that
      // while the child confirms the guess and names the character.
      void this.warmLLM();
    }
  }

  private warmLLM(): Promise<unknown> {
    const llm = this.llm;
    if (!llm) return Promise.resolve();
    return llm.generate(replyMessages(WARMUP_CHARACTER, [], ""), { maxTokens: 4 }).catch(() => undefined);
  }

  /** Optional: if it fails, describeDrawing() answers "no guess" and the talk loop is unaffected. */
  private async loadVision(onProgress?: (p: LoadProgress) => void): Promise<VisionClient | null> {
    const choice = this.choice;
    if (!choice) return null;
    const started = performance.now();
    const model = findVision(choice.vision);
    const expected = (model?.downloadMB ?? 200) * 1e6;
    onProgress?.({ stage: "vision", loaded: 0, total: expected, text: "Getting the seeing eyes ready…" });
    const { VisionClient } = await import("./vision");
    const vision = new VisionClient();
    try {
      await vision.load(choice.vision, choice.visionDevice, model?.dtype ?? {}, choice.modelHost, (loaded, total) => {
        const size = Math.max(total, expected);
        onProgress?.({
          stage: "vision",
          loaded,
          total: size,
          text: `Downloading the seeing eyes… ${Math.round((loaded / size) * 100)}%`,
        });
      });
      this.vision = vision;
      this.visionError = null;
      this.timings.visionMs = performance.now() - started;
      onProgress?.({ stage: "vision", loaded: expected, total: expected, text: "Seeing eyes ready" });
      return vision;
    } catch (error) {
      vision.dispose();
      this.visionError = error instanceof Error ? error.message : String(error);
      onProgress?.({ stage: "vision", loaded: expected, total: expected, text: "Drawing recognition is not available here" });
      return null;
    }
  }

  /**
   * For /setup: downloads drawing recognition into the browser cache so later
   * guesses work offline, then frees it again. Returns false if it failed.
   */
  async prepareVision(onProgress: (p: LoadProgress) => void): Promise<boolean> {
    await this.ready();
    const vision = await this.acquireVision(onProgress);
    this.releaseVision();
    return vision !== null;
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
    if (!png && !photo) return { label: "" };
    const started = performance.now();
    const vision = await this.acquireVision();
    this.takeOverPrefetch();
    const loadMs = performance.now() - started;
    try {
      if (!vision) return { label: "" };
      // The original photo reads better than the cut-out on white (tested in /lab).
      const task = this.choice?.visionTask;
      const { caption } = photo
        ? await vision.describe(photo.image, photo.crop, task)
        : await vision.describe(png, undefined, task);
      const ms = performance.now() - started;
      const verdict = screen(caption, "drawing");
      if (!verdict.ok) {
        const detail = `${caption} [flagged: ${verdict.category}]`;
        this.record({ kind: "describe", text: "", detail, ms, loadMs, fallback: true });
        return { label: "", flagged: verdict.category };
      }
      const label = cleanCaption(caption);
      this.record({ kind: "describe", text: label, detail: caption, ms, loadMs, fallback: !label });
      return { label };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.record({ kind: "describe", text: "", detail, ms: performance.now() - started, loadMs, fallback: true });
      return { label: "" };
    } finally {
      this.releaseVision();
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
    const playback = this.autoSpeakReplies ? this.speaker.stream("character") : null;

    // Unsafe words from the child never reach the model: the character kindly changes the subject.
    const heard = screen(childSays, "child");
    if (!heard.ok) {
      const text = topicChange(heard.category);
      playback?.add(text);
      playback?.end(text);
      this.record({ kind: "reply", text, detail: `blocked child input: ${heard.category}`, ms: 0, fallback: true });
      return text;
    }

    const splitter = new SentenceStream();
    const sentences: string[] = [];
    // Small models ask "What's your name?" every turn; a question already asked is dropped.
    const askedBefore = new Set(
      history
        .filter((t) => t.who === "character")
        .flatMap((t) => splitSentences(t.text))
        .filter((s) => s.endsWith("?"))
        .map(sameText),
    );
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

    const say = (sentence: string) => {
      sentences.push(sentence);
      firstSentenceMs ??= performance.now() - started;
      playback?.add(sentence);
    };
    // Each sentence is checked before it is spoken; a bad one is replaced and generation stops.
    const accept = (raw: string): boolean => {
      const sentence = cleanLine(raw, character.name);
      if (!sentence) return true;
      if (isUnsafe(sentence) || breaksCharacter(sentence)) {
        rejected = true;
        if (sentences.length) say(SAFE_SENTENCE);
        return false;
      }
      if (sentence.endsWith("?") && askedBefore.has(sameText(sentence))) return false;
      say(sentence);
      return sentences.length < MAX_REPLY_SENTENCES;
    };

    const safeHistory = history.filter((t) => t.who === "character" || screen(t.text, "child").ok);
    await llm.generate(replyMessages(safeCharacter(character), safeHistory, childSays), {
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
    const safe = safeCharacter(character);
    return this.complete("firstQuestion", firstQuestionMessages(safe), 40, cleanQuestion, () =>
      FALLBACK_QUESTIONS[0](safe.name),
    );
  }

  nextQuestion(unscreened: Story): Promise<string> {
    const story = safeStory(unscreened);
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

  async writePage(unscreened: Story, question: string, answer: string): Promise<string> {
    const story = safeStory(unscreened);
    const name = story.character.name;
    const heard = screen(answer, "child");
    if (!heard.ok) {
      // The child's words stay out of the model and out of the book.
      const text = `${name} wanted to think about happy things instead. What happens next? Draw it for me!`;
      this.record({ kind: "writePage", text, detail: `blocked child input: ${heard.category}`, ms: 0, fallback: true });
      return text;
    }
    return this.complete("writePage", writePageMessages(story, question, answer), 120, cleanPage, () => {
      const idea = answer.trim().replace(/[.!?]+$/, "");
      const told = idea ? `${capitalize(idea)}. ` : "";
      return `${told}${name} had a happy day. What happens next? Draw it for me!`;
    });
  }

  titleFor(unscreened: Story): Promise<string> {
    const story = safeStory(unscreened);
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
