/**
 * Text → Kokoro phonemes. Kokoro reads IPA, not letters, so every sentence
 * goes through a grapheme-to-phoneme step first. Ported from kokoro-js 1.2.1
 * (Apache-2.0), which we cannot install as is: it pulls in a second
 * Transformers.js. The G2P itself is eSpeak NG (GPL-3.0-or-later) compiled to
 * wasm inside phonemizer.js; it is kept behind `phonemize()` so a GPL-free
 * G2P can replace it without touching the rest of the voice.
 *
 * Only import this from the voice worker: phonemizer.js is 1.3 MB.
 */
import { phonemize as espeak } from "phonemizer";

/** "us" for the American voices (af_*, am_*), "gb" for the British ones (bf_*, bm_*). */
export type Accent = "us" | "gb";

function splitNum(match: string): string {
  if (match.includes(".")) return match;
  if (match.includes(":")) {
    const [h, m] = match.split(":").map(Number);
    if (m === 0) return `${h} o'clock`;
    if (m < 10) return `${h} oh ${m}`;
    return `${h} ${m}`;
  }
  const year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return match;
  const left = match.slice(0, 2);
  const right = parseInt(match.slice(2, 4), 10);
  const suffix = match.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${suffix}`;
    if (right < 10) return `${left} oh ${right}${suffix}`;
  }
  return `${left} ${right}${suffix}`;
}

function flipMoney(match: string): string {
  const bill = match[0] === "$" ? "dollar" : "pound";
  if (isNaN(Number(match.slice(1)))) return `${match.slice(1)} ${bill}s`;
  if (!match.includes(".")) {
    const plural = match.slice(1) === "1" ? "" : "s";
    return `${match.slice(1)} ${bill}${plural}`;
  }
  const [whole, fraction] = match.slice(1).split(".");
  const cents = parseInt(fraction.padEnd(2, "0"), 10);
  const coin = match[0] === "$" ? (cents === 1 ? "cent" : "cents") : cents === 1 ? "penny" : "pence";
  return `${whole} ${bill}${whole === "1" ? "" : "s"} and ${cents} ${coin}`;
}

function pointNum(match: string): string {
  const [a, b] = match.split(".");
  return `${a} point ${b.split("").join(" ")}`;
}

/** Spells out what eSpeak would read badly (numbers, money, titles, quotes). */
function normalize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“")
    .replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«")
    .replace(/\)/g, "»")
    .replace(/[^\S \n]/g, " ")
    .replace(/  +/, " ")
    .replace(/(?<=\n) +(?=\n)/g, "")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flipMoney)
    .replace(/\d*\.\d+/g, pointNum)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?<=\d)S/g, " S")
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, "s")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim();
}

// Punctuation passes through to the model untouched: it shapes the pauses and intonation.
const PUNCTUATION = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCTUATION_RUN = new RegExp(`(\\s*[${PUNCTUATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]+\\s*)+`, "g");

function splitKeeping(text: string, pattern: RegExp): { match: boolean; text: string }[] {
  const parts: { match: boolean; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const index = m.index ?? 0;
    if (last < index) parts.push({ match: false, text: text.slice(last, index) });
    if (m[0].length > 0) parts.push({ match: true, text: m[0] });
    last = index + m[0].length;
  }
  if (last < text.length) parts.push({ match: false, text: text.slice(last) });
  return parts;
}

/** Kokoro-ready phonemes for one sentence. */
export async function phonemize(text: string, accent: Accent = "us"): Promise<string> {
  const language = accent === "us" ? "en-us" : "en";
  const parts = splitKeeping(normalize(text), PUNCTUATION_RUN);
  const phonemes = (
    await Promise.all(parts.map(async (p) => (p.match ? p.text : (await espeak(p.text, language)).join(" "))))
  ).join("");
  // eSpeak's symbols that Kokoro's vocabulary spells differently.
  let out = phonemes
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z");
  if (accent === "us") out = out.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
  return out.trim();
}
