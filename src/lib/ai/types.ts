import type { Character, Story } from "@/lib/story/types";

export type AIStatus = "idle" | "loading" | "ready" | "error";

export interface LoadProgress {
  stage: "llm" | "stt" | "tts" | "vision";
  /** Bytes (or steps) done for this stage. */
  loaded: number;
  /** Bytes (or steps) expected for this stage; 0 when unknown. */
  total: number;
  /** Human-readable progress line for this stage. */
  text: string;
}

export interface ChatTurn {
  who: "child" | "character";
  text: string;
}

export interface DrawingDescription {
  /** Short kid-friendly noun phrase, e.g. "a purple dragon with wings"; "" when there is no guess. */
  label: string;
  confidence?: number;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The picture the cut-out came from; recognition reads the original pixels, which carry more detail. */
export interface DrawingPhoto {
  /** Data URL of the original photo, or of the on-screen drawing's canvas. */
  image: string;
  /** The cut-out's bounding box in that image's own pixels (see photoCropFromCutout). */
  crop: PixelRect;
}

export interface LocalAI {
  status(): AIStatus;
  load(onProgress: (p: LoadProgress) => void): Promise<void>;
  transcribe(audio: Blob): Promise<string>;
  /**
   * Guesses what the child drew. `png` is the cut-out (data URL, transparent
   * background); pass `photo` when there is one: the guess is then made from
   * the original picture cropped to the cut-out, which is more accurate.
   */
  describeDrawing(png: string, photo?: DrawingPhoto): Promise<DrawingDescription>;
  /** The drawn character answers the child in first person. */
  reply(character: Character, history: ChatTurn[], childSays: string): Promise<string>;
  firstQuestion(character: Character): Promise<string>;
  nextQuestion(story: Story): Promise<string>;
  writePage(story: Story, question: string, answer: string): Promise<string>;
  titleFor(story: Story): Promise<string>;
  speak(text: string, voice?: "narrator" | "character"): Promise<void>;
  stopSpeaking(): void;
}
