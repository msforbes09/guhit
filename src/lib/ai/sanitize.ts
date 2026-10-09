/**
 * Small models sometimes wrap answers in markdown, echo prompt labels, add
 * emojis (which speech synthesis reads out by name) or leak a <think> block.
 * Everything shown or spoken to a child goes through these helpers first.
 */

import { screen } from "./safety";

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const LABEL = /^(?:question|page|answer|title|story|reply|response|guhit|assistant|narrator|character)\s*[:\-–]\s*/i;
const WRAPPING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;

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

/** Model output a child must not see or hear (see safety.ts). */
export const isUnsafe = (text: string) => !screen(text, "output").ok;
export const breaksCharacter = (text: string) => OUT_OF_CHARACTER.test(text);

/** One question, optionally led by a short reaction ("Wow! Where does Tala sleep?"). */
export function cleanQuestion(raw: string): string | null {
  const sentences = splitSentences(plainText(raw));
  const index = sentences.findIndex((s) => /\?["'”’)]*$/.test(s));
  if (index === -1 || isYesNo(sentences[index])) return null;
  let kept = sentences.slice(0, index + 1);
  while (kept.length > 1 && wordCount(kept.join(" ")) > 18) kept = kept.slice(1);
  const question = kept.join(" ");
  if (wordCount(question) > 25 || isUnsafe(question)) return null;
  return question;
}

/**
 * "Is Tala scared of rain?" or "…, right?" ends a story with one word; the
 * interviewer only asks open questions (who, what, where, what happens next).
 */
function isYesNo(question: string): boolean {
  return (
    /^(?:is|are|am|was|were|do|does|did|can|could|will|would|should|shall|has|have|had|may|might)\b/i.test(question) ||
    /,\s*(?:right|okay|ok|yes|no|isn'?t (?:it|he|she|that)|aren'?t (?:they|you|we)|don'?t (?:you|they)|doesn'?t (?:it|he|she)|won'?t you)\s*\?["'”’)]*$/i.test(
      question,
    )
  );
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

const PICTURE_WORDS =
  "drawing|picture|photo|photograph|cartoon|illustration|sketch|image|painting|doodle|clip ?art|colou?ring page";
const CAPTION_LEADS = [
  /^in (?:the|this) (?:image|picture|photo|drawing),? (?:we|i|you) can see\s+/i,
  /^(?:the|this|it) (?:drawing|picture|image)? ?(?:is|shows) (?:a (?:drawing|picture) )?of\s+/i,
  /^(?:in )?(?:the|this) (?:image|picture|photo|drawing)(?: shows| is| depicts| features| of)?\s+/i,
  /^(?:there is|this is|it is|here is)\s+/i,
  new RegExp(
    `^an? (?:(?:child'?s|kid'?s|simple|colou?rful|cute|hand[- ]drawn|black and white|cartoon) )*(?:${PICTURE_WORDS})(?: image)? of\\s+`,
    "i",
  ),
  // "a cartoon dragon" → "a dragon"
  /^(an?) (?:cartoon|drawing|sketch|doodle|illustration)(?: of)? (?=\w)/i,
];
const CAPTION_TAILS =
  /\s*(?:,\s*)?(?:(?:drawn |sitting |standing )?(?:on|against|with|in front of|over) (?:a |the )?(?:plain |blank |clean )?(?:white|blank|plain|light) (?:background|paper|sheet|page|surface)(?: of paper)?|(?:on|drawn on) (?:a )?(?:piece|sheet) of paper)/gi;

const withArticle = (phrase: string) => {
  const bare = phrase.replace(/^(?:a|an)\s+/i, "");
  if (/^(?:the|some|two|three|four|five|many|several|his|her|my)\b/i.test(phrase) && bare === phrase) return phrase;
  return `${/^[aeiou]/i.test(bare) ? "an" : "a"} ${bare}`;
};

/**
 * Turns a caption like "A cartoon drawing of a purple dragon with wings on a
 * white background." into "a purple dragon with wings", ready for
 * "Is that …?". Returns "" when nothing safe and useful is left.
 */
export function cleanCaption(raw: string): string {
  // Model control tokens such as "</s>" or "<pad>" when decoding keeps them.
  const untagged = raw.replace(/<\/?[a-z_]+>/gi, " ");
  let text = plainText(untagged).split(/(?<=[.!?])\s/)[0] ?? "";
  text = text.replace(/[.!?]+$/, "").trim();
  // "A purple cartoon drawing of a bird" → "a purple bird": keep the colour, drop the medium.
  text = text.replace(
    new RegExp(`^(an?) ((?:[a-z]+ ){1,2}?)(?:(?:cartoon|simple|cute|child'?s) )*(?:${PICTURE_WORDS}) of (?:an? |the )?`, "i"),
    (_match, article: string, adjectives: string) => `${article} ${adjectives}`,
  );
  let previous: string;
  do {
    previous = text;
    for (const lead of CAPTION_LEADS) text = text.replace(lead, (m, article?: string) => (article ? `${article} ` : ""));
    text = text.trim();
  } while (text !== previous);
  text = text.replace(CAPTION_TAILS, "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || isUnsafe(text)) return "";
  // Long captions read badly in "Is that …?": keep the first ten words, ending before a dangling "and"/"with".
  let kept = words.slice(0, 10);
  while (kept.length > 2 && /^(?:and|with|of|in|on|the|a|an)$/i.test(kept[kept.length - 1])) kept = kept.slice(0, -1);
  const phrase = withArticle(kept.join(" ").replace(/,$/, ""));
  const label = phrase.charAt(0).toLowerCase() + phrase.slice(1);
  return isSensibleLabel(label) ? label : "";
}

// Captions that name the medium or the page, not what the child drew.
const GENERIC_SUBJECT = new RegExp(
  `^(?:an? |the )?(?:(?:white|blank|plain|black|small|large|simple)\\s)*(?:${PICTURE_WORDS}|paper|piece of paper|sheet of paper|background|object|thing|shape|shapes|logo|icon|text|letter|letters|number|line|lines|circle|scribble|scribbles|design|pattern|card|sign|sticker|page|toy|person)s?$`,
  "i",
);

/** "Is that …?" only makes sense for a short phrase that names a subject. */
function isSensibleLabel(label: string): boolean {
  const words = label.split(/\s+/);
  if (words.length < 2 || words.length > 10) return false;
  if (GENERIC_SUBJECT.test(label)) return false;
  // Must contain at least one real word beyond the article.
  return /[a-z]{3,}/i.test(words.slice(1).join(" "));
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
