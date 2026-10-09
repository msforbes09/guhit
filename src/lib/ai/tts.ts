import { splitSentences } from "./sanitize";

export type VoiceRole = "narrator" | "character";

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
  narrator: string | null;
  character: string | null;
  /** True when the narrator voice is installed on the device (works offline). */
  local: boolean;
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

/** One spoken message, fed sentence by sentence while the model is still writing it. */
export class Playback {
  text = "";
  finished = false;
  /** Called once, when the first sentence starts playing. */
  onStart: (() => void) | null = null;
  readonly done: Promise<void>;
  private started = false;
  private open = true;
  private cancelled = false;
  private pending = 0;
  private utterances: SpeechSynthesisUtterance[] = [];
  private release!: () => void;
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly role: VoiceRole,
    private voice: SpeechSynthesisVoice | null,
  ) {
    this.done = new Promise((resolve) => (this.release = resolve));
  }

  add(sentence: string) {
    if (this.cancelled || !sentence.trim()) return;
    this.text = this.text ? `${this.text} ${sentence}` : sentence;
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
      if (this.started) return;
      this.started = true;
      this.onStart?.();
    };
    utterance.onend = utterance.onerror = () => {
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
    if (this.watchdog) clearTimeout(this.watchdog);
    this.utterances = [];
    this.release();
  }
}

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

export class Speaker {
  private voices: Record<VoiceRole, SpeechSynthesisVoice | null> = { narrator: null, character: null };
  private initPromise: Promise<VoiceInfo> | null = null;
  private active: Playback | null = null;

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  init(): Promise<VoiceInfo> {
    if (!this.initPromise) this.initPromise = this.pickVoices();
    return this.initPromise;
  }

  private async pickVoices(): Promise<VoiceInfo> {
    if (!this.supported) return { narrator: null, character: null, local: false };
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
    return { narrator: narrator?.name ?? null, character: character?.name ?? null, local: narrator?.localService ?? false };
  }

  /** Starts a message that is spoken sentence by sentence as text arrives. */
  stream(role: VoiceRole): Playback {
    this.stop();
    const playback = new Playback(role, this.voices[role]);
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
    if (!this.supported) return;
    this.active?.cancel();
    this.active = null;
    window.speechSynthesis.cancel();
  }
}
