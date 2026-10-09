import type { Character, Story } from "@/lib/story/types";
import type { AIStatus, ChatTurn, DrawingDescription, LoadProgress, LocalAI, PartStatus } from "./types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pick = <T,>(items: T[], index: number): T => items[index % items.length];

const FOLLOW_UPS = [
  (name: string) => `What does ${name} like to eat for breakfast?`,
  (name: string) => `Who is ${name}'s best friend?`,
  (name: string) => `What makes ${name} laugh the most?`,
  (name: string) => `Where does ${name} go on a sunny day?`,
  (name: string) => `What is ${name} a little bit afraid of?`,
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
    return `Hello! Where does ${character.name} live?`;
  }

  async nextQuestion(story: Story): Promise<string> {
    await wait(500);
    return pick(FOLLOW_UPS, story.pages.length)(story.character.name);
  }

  async writePage(story: Story, _question: string, answer: string): Promise<string> {
    await wait(700);
    const name = story.character.name;
    const idea = answer.trim().replace(/[.!?]+$/, "") || "something wonderful happened";
    return `${name} smiled. ${idea.charAt(0).toUpperCase()}${idea.slice(1)}. Can you draw what happens next?`;
  }

  async titleFor(story: Story): Promise<string> {
    await wait(300);
    return `The Adventures of ${story.character.name}`;
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
