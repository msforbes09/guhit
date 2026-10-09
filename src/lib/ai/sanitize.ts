/**
 * Small models sometimes wrap answers in markdown, echo prompt labels, add
 * emojis (which speech synthesis reads out by name) or leak a <think> block.
 * Everything shown or spoken to a child goes through these helpers first.
 */

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const LABEL = /^(?:question|page|answer|title|story|reply|response|guhit|assistant|narrator|character)\s*[:\-–]\s*/i;
const WRAPPING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;

const UNSAFE =
  /\b(?:kill\w*|murder\w*|blood\w*|bleed\w*|guns?|knife|knives|stab\w*|shoot\w*|dead|die[sd]?|dying|death|weapons?|bombs?|stupid|shut up|sexy|naked|drugs?|beer|wine|cigarettes?|suicide)\b/i;

const OUT_OF_CHARACTER =
  /\b(?:as an ai|an ai\b|language model|chatbot|artificial intelligence|i(?:'m| am) (?:a |an )?(?:computer|program|bot|real person|human))/i;

const INVITE = /\b(?:draw|drawing|picture)\b/i;

export function stripThink(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const open = out.search(/<think>/i);
  if (open !== -1) out = out.slice(0, open);
  return out.replace(/<\/?think>/gi, "");
}

export function plainText(raw: string): string {
  let text = stripThink(raw)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, "")
    .replace(/\*[^*\n]{1,40}\*/g, (m) => (/^\*[a-z ]+\*$/.test(m) ? "" : m)) // *giggles* stage directions
    .replace(/[*_`#>~|]+/g, " ")
    .replace(EMOJI, "")
    .replace(/\s+/g, " ")
    .trim();
  let previous: string;
  do {
    previous = text;
    text = text.replace(LABEL, "").replace(WRAPPING_QUOTES, "").trim();
  } while (text !== previous);
  return text;
}

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

export const isUnsafe = (text: string) => UNSAFE.test(text);
export const breaksCharacter = (text: string) => OUT_OF_CHARACTER.test(text);

/** One question, optionally led by a short reaction ("Wow! Where does Tala sleep?"). */
export function cleanQuestion(raw: string): string | null {
  const sentences = splitSentences(plainText(raw));
  const index = sentences.findIndex((s) => /\?["'”’)]*$/.test(s));
  if (index === -1) return null;
  let kept = sentences.slice(0, index + 1);
  while (kept.length > 1 && wordCount(kept.join(" ")) > 18) kept = kept.slice(1);
  const question = kept.join(" ");
  if (wordCount(question) > 25 || isUnsafe(question)) return null;
  return question;
}

/** Two or three story sentences, always ending with an invitation to draw. */
export function cleanPage(raw: string): string | null {
  const sentences = splitSentences(plainText(raw));
  const story = sentences.filter((s) => !INVITE.test(s)).slice(0, 3);
  if (story.length === 0) return null;
  const invite = sentences.find((s) => INVITE.test(s)) ?? "What happens next? Draw it for me!";
  const page = [...story, invite].join(" ");
  return isUnsafe(page) ? null : page;
}

const SMALL_WORDS = new Set(["a", "an", "and", "the", "of", "in", "on", "at", "to", "for", "with"]);

export function cleanTitle(raw: string): string | null {
  const firstLine = stripThink(raw).trim().split(/\n/)[0] ?? "";
  const title = plainText(firstLine).replace(/[.!?:;,]+$/, "").trim();
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8 || isUnsafe(title)) return null;
  return words
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** A spoken character line: drops "Tala:" prefixes the model may add. */
export function cleanLine(raw: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return plainText(raw).replace(new RegExp(`^${escaped}\\s*[:\\-–]\\s*`, "i"), "").trim();
}

/**
 * Splits streamed tokens into whole sentences as soon as each one is
 * complete, so speech can start before the model finishes the reply.
 */
export class SentenceStream {
  private buffer = "";

  push(delta: string): string[] {
    this.buffer += delta;
    this.buffer = this.buffer.replace(/<think>[\s\S]*?<\/think>/gi, "");
    // An unfinished think block may still be streaming: wait for it to close.
    if (/<think>/i.test(this.buffer)) return [];
    const out: string[] = [];
    // A sentence is done only once the next whitespace arrives, so "3.5" or
    // "..." in the middle of a stream is not cut early.
    let match: RegExpMatchArray | null;
    while ((match = this.buffer.match(/^([\s\S]*?[.!?]+["'”’)]*)\s+/))) {
      const sentence = match[1].trim();
      this.buffer = this.buffer.slice(match[0].length);
      if (sentence) out.push(sentence);
    }
    return out;
  }

  flush(): string[] {
    const rest = stripThink(this.buffer).trim();
    this.buffer = "";
    return rest ? [rest] : [];
  }
}
