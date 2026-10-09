import { settledKind } from "@/lib/story/kind";
import { tagPage } from "@/lib/story/staging";
import type { Character, Story } from "@/lib/story/types";
import { plotFor, tell } from "./mock-stories";
import type { AIStatus, ChatTurn, DrawingDescription, LoadProgress, LocalAI, PartStatus } from "./types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pick = <T,>(items: T[], index: number): T => items[index % items.length];

// The child guesses what happens next; the page then tells it.
const FOLLOW_UPS = [
  (name: string) => `Ooh! Where do you think ${name} goes next?`,
  (name: string) => `Who do you think ${name} meets?`,
  (name: string) => `What do you think ${name} does now?`,
  (name: string) => `How do you think ${name} feels?`,
  (name: string) => `What happens to ${name} at the very end?`,
];

const CHARACTER_QUESTIONS = [
  "Do you want to play with me?",
  "What's your favorite color?",
  "Can you draw me a friend?",
  "Where should we go today?",
];

/**
 * Canned, kid-friendly stand-in for the on-device engine so screens can be
 * built and demoed before (or without) the real models.
 */
export class MockAI implements LocalAI {
  private state: AIStatus = "idle";
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private speakResolve: (() => void) | null = null;
  /** When the pretend voice started; null while silent. */
  private speakingSince: number | null = null;
  private startListeners = new Set<(voice: "narrator" | "character") => void>();

  status(): AIStatus {
    return this.state;
  }

  /** The pretend engine has every part, once "loaded". */
  partStatus(): PartStatus {
    return this.state;
  }

  async load(onProgress: (p: LoadProgress) => void): Promise<void> {
    if (this.state === "ready") return;
    this.state = "loading";
    const stages: LoadProgress["stage"][] = ["llm", "stt", "vision", "tts"];
    for (const stage of stages) {
      for (let step = 0; step <= 4; step++) {
        onProgress({
          stage,
          loaded: step,
          total: 4,
          text: step === 4 ? `${stage} ready` : `Loading ${stage}…`,
        });
        await wait(80);
      }
    }
    this.state = "ready";
  }

  async transcribe(audio: Blob): Promise<string> {
    await wait(400);
    return audio.size > 0 ? "He lives in a big tree house by the river." : "";
  }

  async describeDrawing(png: string): Promise<DrawingDescription> {
    await wait(700);
    return png ? { label: "a purple dragon with wings", confidence: 0.8 } : { label: "" };
  }

  async reply(character: Character, history: ChatTurn[], childSays: string): Promise<string> {
    await wait(600);
    const heard = childSays.trim().replace(/[.!?]+$/, "");
    if (history.length === 0) {
      return `Hi! I'm ${character.name}! I'm so happy you drew me. What's your name?`;
    }
    return heard
      ? `Wow, ${heard.toLowerCase()}? That sounds fun! ${pick(CHARACTER_QUESTIONS, history.length)}`
      : `Hee hee! ${pick(CHARACTER_QUESTIONS, history.length)}`;
  }

  async firstQuestion(character: Character): Promise<string> {
    await wait(500);
    return `Hello! Let’s make a story. What do you think ${character.name} does first?`;
  }

  async nextQuestion(story: Story): Promise<string> {
    await wait(500);
    return pick(FOLLOW_UPS, story.pages.length - 1)(story.character.name);
  }

  /** The next page of a ready-written story that suits the character, with its scene and move. */
  async writePage(story: Story): Promise<string> {
    await wait(700);
    const kind = settledKind(story.character);
    const plot = plotFor(story.id, kind);
    const next = plot.pages[Math.min(story.pages.length, plot.pages.length - 1)];
    return tagPage(tell(next.text, story.character.name, kind), next);
  }

  async titleFor(story: Story): Promise<string> {
    await wait(300);
    const kind = settledKind(story.character);
    return tell(plotFor(story.id, kind).title, story.character.name, kind);
  }

  speak(text: string, voice: "narrator" | "character" = "narrator"): Promise<void> {
    this.stopSpeaking();
    return new Promise((resolve) => {
      this.speakResolve = resolve;
      // A real voice takes a moment to start; the pretend one does too.
      this.startTimer = setTimeout(() => {
        this.startTimer = null;
        this.speakingSince = performance.now();
        for (const listener of this.startListeners) listener(voice);
      }, 120);
      // Roughly the time it takes to read the text aloud at a gentle pace.
      this.speakTimer = setTimeout(() => {
        this.speakTimer = null;
        this.speakResolve = null;
        this.speakingSince = null;
        resolve();
      }, 120 + Math.min(4000, 60 * text.length));
    });
  }

  stopSpeaking(): void {
    if (this.speakTimer) clearTimeout(this.speakTimer);
    if (this.startTimer) clearTimeout(this.startTimer);
    this.speakTimer = null;
    this.startTimer = null;
    this.speakingSince = null;
    this.speakResolve?.();
    this.speakResolve = null;
  }

  /** About four syllables a second with a little wobble, like a voice. */
  speechLevel(): number {
    if (this.speakingSince === null) return 0;
    const t = (performance.now() - this.speakingSince) / 1000;
    const syllable = Math.abs(Math.sin(t * Math.PI * 4));
    return Math.min(1, 0.15 + 0.7 * syllable * (0.75 + 0.25 * Math.sin(t * 7.3)));
  }

  onSpeechStart(cb: (voice: "narrator" | "character") => void): () => void {
    this.startListeners.add(cb);
    return () => this.startListeners.delete(cb);
  }
}
