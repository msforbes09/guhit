// Longer cues first: "its name is Puti" must not read as "its … Name".
const NAME_CUE =
  /\b(?:(?:his|her|their|its|my friend's) name is|name is|this is|that is|that's|thats|it's|its|meet|say hi to|say hello to|called|i call (?:him|her|it|them))\s+(?:my\s+(?:friend\s+)?)?((?:(?:mister|mr|miss|mrs|ms|princess|prince|captain|king|queen|doctor|dr|sir|lady|baby|little|big)\.?\s+)?[A-Za-z][A-Za-z'-]*)/gi;

const NOT_NAMES = new Set(["a", "an", "the", "my", "our", "his", "her", "is", "and", "so", "very", "really", "name"]);

const capitalise = (words: string) =>
  words
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/**
 * Splits a spoken introduction ("This is Tala, a purple dragon scared of rain")
 * into a name and a description the child can still edit.
 */
export function parseIntro(spoken: string): { name: string; description: string } {
  const text = spoken.trim().replace(/\s+/g, " ");
  if (!text) return { name: "", description: "" };

  for (const cue of text.matchAll(NAME_CUE)) {
    if (NOT_NAMES.has(cue[1].toLowerCase())) continue;
    const before = text.slice(0, cue.index).replace(/\b(?:and|is)\s*$/i, "");
    const after = text.slice(cue.index + cue[0].length);
    return { name: capitalise(cue[1]), description: tidy(`${before} ${after}`) };
  }

  const words = text.split(" ");
  // A single word ("Tala!") is almost always just the name.
  if (words.length <= 2) return { name: capitalise(words[0].replace(/[^A-Za-z'-]/g, "")), description: tidy(words.slice(1).join(" ")) };

  return { name: "", description: tidy(text) };
}

/** A spoken phrase as a tidy sentence: capitalised, with an ending full stop. */
export function tidy(rest: string): string {
  const cleaned = rest
    .replace(/^[\s,.!?:;-]+/, "")
    .replace(/^(?:and\s+)?(?:(?:this|that|he|she|it|they)(?:'s| is| are)|who is|who's|is)\s+/i, "")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/[\s,]+$/, "")
    .trim();
  if (!cleaned) return "";
  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

const TITLE = /^(?:mister|mr|miss|mrs|ms|princess|prince|captain|king|queen|doctor|dr|sir|lady|baby|little|big)$/i;

const FILLER = new Set([
  "me",
  "my", "name", "is", "it's", "its", "it", "call", "him", "her", "them", "i", "think", "maybe",
  "um", "uh", "erm", "the", "a", "called", "he", "she", "they", "their", "his", "hmm", "and", "so", "well",
]);

/** Just the name from an answer to "What's my name?" ("Her name is Tala", "um, Tala"). */
export function nameFrom(spoken: string): string {
  for (const cue of spoken.matchAll(NAME_CUE)) {
    if (!NOT_NAMES.has(cue[1].toLowerCase())) return capitalise(cue[1]);
  }
  const words = spoken
    .replace(/[^A-Za-z' -]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w.toLowerCase()));
  if (!words.length) return "";
  // "Mister Robot", "Princess Ana": a title keeps the word after it.
  return capitalise(TITLE.test(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0]);
}

const YES = /^(?:yes|yeah|yep|yup|yay|sure|right|correct|ok|okay|oo|opo|oho)\b[\s,.!]*/i;
const NO = /^(?:no|nope|nah|hindi|not really)\b[\s,.!]*/i;

/**
 * Reads a spoken reply to "Is that a purple dragon?": yes, no (with whatever
 * the child says it really is), or a plain correction.
 */
export function readYesNo(spoken: string): { answer: "yes" | "no" | "other"; rest: string } {
  const text = spoken.trim();
  if (YES.test(text)) return { answer: "yes", rest: text.replace(YES, "").trim() };
  if (NO.test(text)) {
    const rest = text.replace(NO, "").replace(/^(?:it's|it is|its|that's|that is|i'm|i am)\s+/i, "").trim();
    return { answer: "no", rest };
  }
  return { answer: "other", rest: text };
}
