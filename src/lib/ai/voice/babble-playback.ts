import { babble, stopBabble } from "@/lib/sfx/babble";
import type { Kind } from "@/lib/story/kind";
import type { SentenceMetric, SpeechPlayback, StartListener } from "./playback";
import type { VoiceRole } from "./voices";

/**
 * One message in 8-bit babble (src/lib/sfx/babble.ts), for when no voice can
 * say it: the character without the neural voice, or anyone when the device
 * voice does not work either. Text added together is babbled as one line
 * (babble keeps a line to about 3 s); text that arrives later follows it.
 */
export class BabblePlayback implements SpeechPlayback {
  text = "";
  finished = false;
  onStart: (() => void) | null = null;
  readonly done: Promise<void>;
  private release!: () => void;
  private open = true;
  private cancelled = false;
  private started = false;
  private count = 0;
  private waiting = "";
  private addedAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    readonly role: VoiceRole,
    private kind: Kind,
    private startListeners: Set<StartListener>,
    private metric: ((m: SentenceMetric) => void) | null = null,
    private reason?: string,
  ) {
    this.done = new Promise((resolve) => (this.release = resolve));
  }

  add(sentence: string) {
    if (this.cancelled || !this.open || !sentence.trim()) return;
    this.text = this.text ? `${this.text} ${sentence}` : sentence;
    if (!this.waiting) {
      this.addedAt = performance.now();
      this.chain = this.chain.then(() => this.say());
    }
    this.waiting = this.waiting ? `${this.waiting} ${sentence}` : sentence;
  }

  private async say() {
    const line = this.waiting;
    this.waiting = "";
    if (this.cancelled || !line) return;
    const playing = babble(line, this.kind);
    this.metric?.({
      engine: "babble",
      role: this.role,
      voice: this.kind,
      text: line,
      index: this.count++,
      firstAudioMs: performance.now() - this.addedAt,
      fallback: this.reason,
    });
    if (!this.started) {
      this.started = true;
      this.onStart?.();
      for (const listener of this.startListeners) listener(this.role);
    }
    await playing;
  }

  end(fullText?: string) {
    this.open = false;
    if (fullText !== undefined) this.text = fullText;
    void this.chain.then(() => this.finish());
  }

  cancel() {
    if (this.finished) return;
    this.cancelled = true;
    this.open = false;
    if (this.started) stopBabble();
    this.finish();
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.release();
  }
}
