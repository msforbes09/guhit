import type { Character, Story } from "@/lib/story/types";
import {
  chooseModels,
  detectSupport,
  isGpuError,
  rememberLLMOnCpu,
  type DeviceSupport,
  type ModelChoice,
} from "./device";
import type { LLMClient, TextGenerator } from "./llm";
import { CPU_LLM, findLLM, findSTT, findVision, STT_DTYPES } from "./models";
import { deleteModelFiles, partModelIds, storeCutoutModel } from "./model-files";
import { isVisionCached, markReady, requestPersistence } from "./offline";
import { installedParts, isPartInstalled, markInstalled, PARTS } from "./parts";
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
import { sharedAttempt } from "./shared-attempt";
import type { STTClient } from "./stt";
import type { VisionClient } from "./vision";
import { Speaker, type VoiceInfo } from "./tts";
import type { AIStatus, ChatTurn, DrawingDescription, DrawingPhoto, LoadProgress, LocalAI, Part, PartStatus } from "./types";

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
  /** The CPU story helper's first, one-token run after loading. */
  llmWarmupMs?: number;
  sttMs?: number;
  sttWarmupMs?: number;
  /** The most recent vision model load (it is loaded per guess, see acquireVision). */
  visionMs?: number;
  ttsMs?: number;
}

const MAX_REPLY_SENTENCES = 2;
/** The story helper's first start on the GPU; "?llmStartTimeout=<ms>" overrides it for /lab. */
const LLM_START_TIMEOUT_MS = 180_000;

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
  /** Each part's own state: a screen needs only the parts it uses. */
  private partState: Record<Part, AIStatus> = { eyes: "idle", voice: "idle", talk: "idle" };
  private listeners = new Set<(p: LoadProgress) => void>();
  private lastText: Partial<Record<LoadProgress["stage"], string>> = {};
  private llm: TextGenerator | null = null;
  private gpuLLM: LLMClient | null = null;
  private stt: STTClient | null = null;
  private vision: VisionClient | null = null;
  private visionUsers = 0;
  private prefetchHeld = false;
  private visionLoading: Promise<VisionClient | null> | null = null;
  private speaker = new Speaker();
  /**
   * After a failed setup, "Continue download" runs load() again: a model that
   * finished, or is still loading, is kept rather than started a second time.
   */
  private llmLoad = sharedAttempt(async () => {
    const choice = this.choice!;
    if (findLLM(choice.llm)?.cpu) return this.loadCpuLLM(choice);
    const { LLMClient } = await import("./llm");
    // One client for every attempt: a retry reloads in the same WebLLM worker.
    this.gpuLLM ??= new LLMClient();
    try {
      await this.loadLLM(this.gpuLLM, choice);
    } catch (error) {
      if (!isGpuError(error instanceof Error ? error.message : String(error))) throw error;
      // The page saw a GPU but WebLLM cannot use it: the CPU story helper
      // instead, on this device from now on, rather than no story helper at all.
      rememberLLMOnCpu();
      this.choice = { ...choice, llm: CPU_LLM };
      await this.loadCpuLLM(this.choice);
    }
  });
  private llmWarm = sharedAttempt(() => this.warmUpLLM());
  private sttLoad = this.sttAttempt();
  /** Device and model choice, worked out once. */
  private prepared = sharedAttempt(async () => {
    const support = await detectSupport();
    this.support = support;
    this.choice = chooseModels(support, window.location.search);
    void requestPersistence();
  });
  private partRuns: Record<Part, () => Promise<void>> = {
    eyes: sharedAttempt(() => this.loadEyes()),
    voice: sharedAttempt(() => this.loadVoicePart()),
    talk: sharedAttempt(() => this.loadTalk()),
  };

  private sttAttempt() {
    return sharedAttempt(async () => {
      const { STTClient } = await import("./stt");
      await this.loadSTT(new STTClient(), this.choice!);
    });
  }

  /** "ready" once every part on this device is; parts not set up do not count. */
  status(): AIStatus {
    return this.state;
  }

  /** One part: "not-installed" when it was not chosen at setup (or was removed). */
  partStatus(part: Part): PartStatus {
    const state = this.partState[part];
    return state === "idle" && !isPartInstalled(part) ? "not-installed" : state;
  }

  /**
   * Loads the given parts, by default the ones already on this device (kid
   * screens never start a download). /setup passes the parts the parent chose.
   */
  async load(onProgress: (p: LoadProgress) => void, parts: Part[] = installedParts()): Promise<void> {
    this.listeners.add(onProgress);
    try {
      await this.loadParts(parts);
    } finally {
      this.listeners.delete(onProgress);
    }
  }

  private emit(progress: LoadProgress) {
    this.lastText[progress.stage] = progress.text;
    for (const listener of this.listeners) listener(progress);
  }

  private updateState() {
    const installed = installedParts();
    const states = PARTS.map((part) => this.partState[part]);
    if (states.includes("loading")) this.state = "loading";
    else if (states.includes("error")) this.state = "error";
    else if (installed.length > 0 && installed.every((part) => this.partState[part] === "ready")) this.state = "ready";
    else this.state = "idle";
    markReady(this.state === "ready");
  }

  /**
   * In order of importance (eyes, voice, talk), each part on its own: one that
   * fails leaves the others working. Phones take one at a time (WebKit closes
   * a tab past ~1–1.5 GB, and downloads share a weaker connection).
   */
  private async loadParts(parts: Part[]) {
    const pending = PARTS.filter((part) => parts.includes(part) && this.partState[part] !== "ready");
    if (pending.length === 0) return;
    this.error = null;
    const started = performance.now();
    let failure: unknown = null;
    try {
      await this.prepared();
      const run = (part: Part) => this.runPart(part).catch((error) => void (failure ??= error));
      if (this.support!.mobile) for (const part of pending) await run(part);
      else await Promise.all(pending.map(run));
    } catch (error) {
      failure ??= error;
    }
    this.timings.totalMs = performance.now() - started;
    this.updateState();
    if (this.state === "ready") {
      // One more throwaway word now that the voice shares the GPU with the rest.
      this.speaker.rewarm();
      // Phones keep the eyes' model only while a guess needs it (see acquireVision).
      if (!this.support?.mobile && this.partState.eyes === "ready") this.prefetchVision();
    }
    if (failure) {
      this.error = failure instanceof Error ? failure.message : String(failure);
      throw failure;
    }
  }

  private async runPart(part: Part) {
    this.partState[part] = "loading";
    this.updateState();
    try {
      await this.partRuns[part]();
      this.partState[part] = "ready";
      markInstalled(part, true);
    } catch (error) {
      this.partState[part] = "error";
      throw error;
    } finally {
      this.updateState();
    }
  }

  /**
   * The eyes: drawing recognition is downloaded and checked once here, then
   * loaded for each guess and freed after. The AI cut-out model is stored too,
   * so "Try AI cut-out" works offline later (best effort).
   */
  private async loadEyes() {
    const choice = this.choice!;
    if (!(await isVisionCached(choice.vision))) {
      const vision = await this.acquireVision((p) => this.emit(p));
      this.releaseVision();
      if (!vision) throw new Error(this.visionError ?? "Drawing recognition could not start.");
    }
    this.emit({ stage: "vision", loaded: 1, total: 1, text: "Seeing eyes ready", done: true });
    // In the background: an optional extra must never hold up the parts after it.
    void storeCutoutModel(choice.source, choice.modelHost).catch(() => undefined);
  }

  /** Never fails: without the neural voice, the device's own voice speaks. */
  private async loadVoicePart() {
    const support = this.support!;
    const choice = this.choice!;
    const loadVoice = () =>
      this.speaker.load(support, choice.modelHost, choice.source, (loaded, total, text) =>
        this.emit({ stage: "tts", loaded, total, text }),
      );
    let voices = await loadVoice();
    // A first, cold load can fail while other models fill the GPU; on its own it usually succeeds.
    if (voices.engine === "builtin" && voices.reason?.startsWith("Kokoro failed to load")) voices = await loadVoice();
    this.voices = voices;
    this.timings.ttsMs = voices.loadMs;
    this.emit({ stage: "tts", loaded: 1, total: 1, text: this.lastText.tts ?? "Voice ready", done: true });
  }

  /** Talking: the listening ears, then the story helper (its slow first start last). */
  private async loadTalk() {
    if (this.support!.mobile) {
      await this.sttLoad();
      await this.llmLoad();
    } else {
      await Promise.all([this.sttLoad(), this.llmLoad()]);
    }
    await this.llmWarm();
  }

  /**
   * Removes a part from this device: its models leave the browser's storage.
   * The page should reload afterwards, which also frees what is in memory.
   */
  async removePart(part: Part): Promise<void> {
    await this.prepared();
    markInstalled(part, false);
    this.partState[part] = "idle";
    this.updateState();
    await deleteModelFiles(partModelIds(part, this.choice!));
  }

  private async loadLLM(llm: LLMClient, choice: ModelChoice) {
    const started = performance.now();
    const total = (findLLM(choice.llm)?.downloadMB ?? 1000) * 1e6;
    this.emit({ stage: "llm", loaded: 0, total, text: "Getting the story helper ready…" });
    // WebLLM counts whole files (~30 MB each), so on a phone the bar sat at 0%
    // for minutes; the bytes that have arrived move it in between.
    let fileFraction = 0;
    let downloaded = 0;
    let phase = "Getting the story helper ready…";
    let waking = false;
    const show = () => {
      // Never 100% here: the story helper still has to start (warmUpLLM) before it is ready.
      const fraction = Math.min(0.99, waking ? fileFraction : Math.max(fileFraction, downloaded / total));
      this.emit({
        stage: "llm",
        loaded: Math.round(fraction * total),
        total,
        text: `${phase} ${Math.round(fraction * 100)}%`,
      });
    };
    const origin = {
      modelHost: choice.modelHost,
      source: choice.source,
      // Phones: two files at a time instead of four, gentler on memory and on a weak connection.
      maxDownloads: this.support?.mobile ? 2 : null,
    };
    await llm.load(
      choice.llm,
      origin,
      (report) => {
        fileFraction = report.progress;
        waking = /cache/i.test(report.text) && !/fetching/i.test(report.text);
        phase = waking
          ? "Waking up the story helper…"
          : downloaded > 0 || /fetching/i.test(report.text)
            ? "Downloading the story helper…"
            : "Getting the story helper ready…";
        show();
      },
      (bytes) => {
        downloaded = bytes;
        if (!waking) phase = "Downloading the story helper…";
        show();
      },
    );
    this.llm = llm;
    this.timings.llmMs = performance.now() - started;
  }

  /**
   * A short run on a reply-sized prompt compiles the GPU kernels for prompts of
   * that length now, so the character's first real answer is not the slow one.
   * On some phones this first start takes minutes, so the line counts the
   * seconds; past the limit it fails with a GPU error, whose button offers to
   * carry on without the graphics chip.
   */
  private async warmUpLLM() {
    const llm = this.llm!;
    const total = (findLLM(llm.modelId)?.downloadMB ?? 1000) * 1e6;
    if (!findLLM(llm.modelId)?.cpu) {
      const started = performance.now();
      const override = Number(new URLSearchParams(window.location.search).get("llmStartTimeout"));
      const limitMs = Number.isFinite(override) && override > 0 ? override : LLM_START_TIMEOUT_MS;
      const tick = () => {
        const seconds = Math.round((performance.now() - started) / 1000);
        this.emit({
          stage: "llm",
          loaded: Math.round(total * 0.99),
          total,
          text:
            seconds < 10
              ? "Starting the story helper…"
              : `Starting the story helper… ${seconds} s (the first start can take a minute or two on a phone)`,
        });
      };
      tick();
      const ticker = setInterval(tick, 5000);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          llm.generate(replyMessages(WARMUP_CHARACTER, [], ""), { maxTokens: 4 }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    `The story helper did not start on this device's graphics chip: its WebGPU warm-up took over ${Math.round(limitMs / 1000)} s.`,
                  ),
                ),
              limitMs,
            );
          }),
        ]);
      } finally {
        clearInterval(ticker);
        clearTimeout(timer);
      }
      this.timings.llmWarmupMs = performance.now() - started;
    }
    this.emit({ stage: "llm", loaded: total, total, text: "Story helper ready", done: true });
  }

  /** The story helper on the CPU (no usable WebGPU): one ONNX file, downloaded and loaded by Transformers.js. */
  private async loadCpuLLM(choice: ModelChoice) {
    const started = performance.now();
    const model = findLLM(choice.llm);
    if (!model?.cpu) throw new Error(`${choice.llm} has no CPU build.`);
    const expected = model.downloadMB * 1e6;
    this.emit({ stage: "llm", loaded: 0, total: expected, text: "Getting the story helper ready…" });
    const { CpuLLMClient } = await import("./llm-cpu");
    const llm = new CpuLLMClient();
    const { warmupMs } = await llm.load(choice.llm, model.cpu.dtype, choice.modelHost, choice.source, (loaded, total) => {
      const size = Math.max(total, expected);
      this.emit({
        stage: "llm",
        loaded,
        total: size,
        text: `Downloading the story helper… ${Math.round((loaded / size) * 100)}%`,
      });
    });
    this.llm = llm;
    this.timings.llmMs = performance.now() - started;
    this.timings.llmWarmupMs = warmupMs;
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
      choice.source,
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
    this.emit({ stage: "stt", loaded: expected, total: expected, text: "Listening ears ready", done: true });
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
      // Phones never hold all four models: the ears step aside while the eyes look
      // (they come back from the cache in a second or two, on the next listen).
      if (this.support?.mobile) this.unloadEars();
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
      // while the child confirms the guess and names the character. The voice
      // shares the GPU too.
      void this.warmLLM();
      this.speaker.rewarm();
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
      const dtype = model?.dtype ?? {};
      await vision.load(choice.vision, choice.visionDevice, dtype, choice.modelHost, choice.source, (loaded, total) => {
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
      onProgress?.({ stage: "vision", loaded: expected, total: expected, text: "Seeing eyes ready", done: true });
      return vision;
    } catch (error) {
      vision.dispose();
      this.visionError = error instanceof Error ? error.message : String(error);
      onProgress?.({
        stage: "vision",
        loaded: expected,
        total: expected,
        text: "Drawing recognition is not available here",
        done: true,
      });
      return null;
    }
  }

  private unloadEars() {
    if (!this.stt) return;
    this.stt.terminate();
    this.stt = null;
    this.sttLoad = this.sttAttempt();
  }

  /**
   * Methods load their part on demand, but only once a parent has set it up:
   * a download must never start from a kid screen by surprise.
   */
  private async needPart(part: Part) {
    if (this.partState[part] === "ready") return;
    if (this.partState[part] !== "loading" && !isPartInstalled(part)) {
      throw new Error(`This part of Guhit (${part}) is not set up on this device. Open the setup page to add it.`);
    }
    await this.load(() => {}, [part]);
  }

  private async storyHelper(): Promise<TextGenerator> {
    await this.needPart("talk");
    return this.llm!;
  }

  /** The listening ears, back from the cache if a guess sent them away (phones). */
  private async ears(): Promise<STTClient> {
    await this.needPart("talk");
    await this.sttLoad();
    return this.stt!;
  }

  private record(metric: CallMetric): CallMetric {
    this.metrics.push(metric);
    this.onMetric?.(metric);
    return metric;
  }

  private llmMetric(kind: CallKind, text: string, started: number, llm: TextGenerator, extra: Partial<CallMetric> = {}) {
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
    if (!png && !photo) return { label: "" };
    // Without the eyes the screens simply ask the child what it is.
    if (this.partStatus("eyes") === "not-installed") return { label: "" };
    await this.needPart("eyes");
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
    const stt = await this.ears();
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
    const llm = await this.storyHelper();
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
    // Likewise a stock exclamation ("How cool!") at the end of reply after reply.
    const isExclamation = (s: string) => s.endsWith("!") && s.split(/\s+/).length <= 4;
    const exclaimedLately = new Set(
      history
        .filter((t) => t.who === "character")
        .slice(-3)
        .flatMap((t) => splitSentences(t.text))
        .filter(isExclamation)
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
      if (isExclamation(sentence) && exclaimedLately.has(sameText(sentence))) {
        // Drop it; stop if the reply already says something, else let the model go on.
        return sentences.length === 0;
      }
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
    const llm = await this.storyHelper();
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
