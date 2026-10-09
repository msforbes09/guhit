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
  /** Set once this stage is loaded and started; a full bar alone does not mean ready. */
  done?: boolean;
}

export interface ChatTurn {
  who: "child" | "character";
  text: string;
}

/** Why something was kept away from the child (see src/lib/ai/safety.ts). */
export type SafetyCategory =
  | "weapon"
  | "violence"
  | "gore"
  | "adult"
  | "drugs"
  | "profanity"
  | "personal-info";

export interface DrawingDescription {
  /** Short kid-friendly noun phrase, e.g. "a purple dragon with wings"; "" when there is no guess. */
  label: string;
  confidence?: number;
  /** Set when the drawing looks unsafe for the app (the label is then ""). */
  flagged?: SafetyCategory;
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

/** The parts a parent sets up: "eyes" (always), "voice" and "talk" (ears + story helper). */
export type Part = "eyes" | "voice" | "talk";
/** A part's state; "not-installed" when it was not chosen at setup (or was removed). */
export type PartStatus = AIStatus | "not-installed";

export interface LocalAI {
  /** "ready" once every part on this device is ready. */
  status(): AIStatus;
  /** Loads parts: by default those already on this device (never a download from a kid screen). */
  load(onProgress: (p: LoadProgress) => void, parts?: Part[]): Promise<void>;
  /** Each feature waits only for its own part: guesses for "eyes", the neural voice for "voice", talking for "talk". */
  partStatus(part: Part): PartStatus;
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
  /**
   * How loud the voice is right now, 0..1 (smoothed); 0 when nothing is
   * playing. Cheap: poll it every animation frame to move a mouth.
   */
  speechLevel(): number;
  /**
   * Calls `cb` when a spoken message actually starts playing (not when it is
   * queued), with the voice that speaks it. Returns the unsubscribe function.
   */
  onSpeechStart(cb: (voice: "narrator" | "character") => void): () => void;
}
