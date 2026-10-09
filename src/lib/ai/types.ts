import type { Character, Story } from "@/lib/story/types";

export type AIStatus = "idle" | "loading" | "ready" | "error";

export interface LoadProgress {
  stage: "llm" | "stt" | "tts";
  /** Bytes (or steps) done for this stage. */
  loaded: number;
  /** Bytes (or steps) expected for this stage; 0 when unknown. */
  total: number;
  /** Human-readable progress line for this stage. */
  text: string;
}

export interface LocalAI {
  status(): AIStatus;
  load(onProgress: (p: LoadProgress) => void): Promise<void>;
  transcribe(audio: Blob): Promise<string>;
  firstQuestion(character: Character): Promise<string>;
  nextQuestion(story: Story): Promise<string>;
  writePage(story: Story, question: string, answer: string): Promise<string>;
  titleFor(story: Story): Promise<string>;
  speak(text: string): Promise<void>;
  stopSpeaking(): void;
}
