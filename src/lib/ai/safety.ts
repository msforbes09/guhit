import type { SafetyCategory } from "./types";

/**
 * Keeps real-world danger out of a children's app while letting storybook
 * adventure through: knights, swords, dragons and monsters are fine; guns,
 * blood, drugs and swearing are not. Runs inside the engine on everything the
 * child says, everything a model writes and every drawing guess, so no screen
 * can skip it.
 *
 * - "child": what the child said or typed (also checked for personal details)
 * - "output": anything the models write before it is shown or spoken
 * - "drawing": the guess of what a drawing shows
 */
export type ScreenKind = "drawing" | "child" | "output";

export interface ScreenResult {
  ok: boolean;
  category?: SafetyCategory;
}

// Storybook and everyday phrases that contain a blocked word but are harmless.
const ALLOWED_PHRASES = [
  "shooting stars?",
  "shoot(?:s|ing)? hoops",
  "photo ?shoots?",
  "killer whales?",
  "butter knife",
  "water guns?",
  "glue guns?",
  "bow and arrows?",
  "bows and arrows",
  "shoot(?:s|ing)? (?:an )?arrows?",
  "drawing pins?",
  // Filipino desserts that share letters with Tagalog swear words.
  "leche flan",
  "puto",
];
const ALLOWED = new RegExp(`\\b(?:${ALLOWED_PHRASES.join("|")})\\b`, "gi");

/** Word list with simple plurals and verb forms; "stab" also catches "stabbed" (doubled consonant). */
const words = (list: string[]) =>
  new RegExp(`\\b(?:${list.map((w) => `${w}(?:${w.slice(-1)})?`).join("|")})(?:s|es|d|ed|ing|er|ers)?\\b`, "i");

interface Rule {
  category: SafetyCategory;
  pattern: RegExp;
  /** Only screen these kinds; all kinds when unset. */
  kinds?: ScreenKind[];
}

const VICTIM = "(?:him|her|them|you|me|us|someone|somebody|people|my|his|their|your)";

const RULES: Rule[] = [
  {
    category: "weapon",
    pattern: words([
      "gun",
      "pistol",
      "rifle",
      "shotgun",
      "revolver",
      "firearm",
      "machine ?gun",
      "ammo",
      "ammunition",
      "bullet",
      "bomb",
      "grenade",
      "explosive",
      "explosion",
      "dynamite",
    ]),
  },
  {
    // A knife or dagger is only a problem when it is used against someone.
    category: "weapon",
    pattern: new RegExp(
      `\\b(?:stab\\w*|kill\\w*|hurt\\w*|attack\\w*|threaten\\w*|cut ${VICTIM})\\b[^.!?]{0,40}\\b(?:knife|knives|daggers?)\\b|\\b(?:knife|knives|daggers?)\\b[^.!?]{0,40}\\b(?:stab\\w*|kill\\w*|hurt\\w*|attack\\w*|threaten\\w*|cut ${VICTIM})\\b|\\b(?:knife|dagger) (?:at|to (?:his|her|my|your|their) (?:throat|neck))\\b`,
      "i",
    ),
  },
  {
    category: "violence",
    pattern: new RegExp(
      `${words(["kill", "murder", "stab", "strangle", "torture", "suicide", "behead"]).source}|\\bshoot(?:s|ing)?\\b|\\bshot ${VICTIM}\\b|\\bshot (?:dead|down)\\b|\\bbeat (?:him|her|them|you|me) up\\b`,
      "i",
    ),
  },
  {
    // The character never talks about dying, even gently.
    category: "violence",
    kinds: ["output"],
    pattern: /\b(?:die|dies|died|dying|dead|death)\b/i,
  },
  {
    category: "gore",
    pattern: new RegExp(
      `${words(["blood", "bloody", "bleed", "gore", "gory", "corpse", "decapitate", "guts"]).source}|\\bdead bod(?:y|ies)\\b`,
      "i",
    ),
  },
  {
    category: "adult",
    pattern: words(["naked", "nude", "nudity", "sexy", "sex", "porn", "porno", "pornography", "boob", "penis", "vagina", "condom", "strip ?club"]),
  },
  {
    category: "drugs",
    pattern: words([
      "drug",
      "cocaine",
      "heroin",
      "meth",
      // Not "weed": children pull weeds in gardens.
      "marijuana",
      "cannabis",
      "cigarette",
      "cigar",
      "vape",
      "vaping",
      "tobacco",
      "alcohol",
      "beer",
      "wine",
      "vodka",
      "whiskey",
      "whisky",
      "tequila",
      "liquor",
      "drunk",
      "shabu",
      "yosi",
      "alak",
    ]),
  },
  {
    category: "profanity",
    pattern: new RegExp(
      `\\b(?:fuck\\w*|f+u+c+k+|motherf\\w*|shit\\w*|bullshit|bitch\\w*|asshole\\w*|bastard\\w*|damn\\w*|dick|dickhead|piss\\w*|cunt\\w*|slut\\w*|whore\\w*|retard\\w*|wtf|stfu|crap)\\b` +
        // Common Tagalog swearing and insults.
        `|\\b(?:putang ?ina|putangina|potangina|tangina|tang ?ina|puta|pota|gago|gaga|ulol|ulul|tarantado|tarantada|leche|lintik|punyeta|pakshet|pakyu|bobo|tanga|inutil|kupal|tite|puke|bwisit|hayop ka)\\b`,
      "i",
    ),
  },
  {
    // The character is never mean, even when a child is.
    category: "profanity",
    kinds: ["output"],
    pattern: /\b(?:stupid|dumb|idiot|shut up|ugly|i hate you)\b/i,
  },
  {
    category: "personal-info",
    kinds: ["child"],
    pattern: new RegExp(
      [
        // Phone numbers: Philippine mobiles (09xx / +639xx) and any long run of digits.
        "(?:\\+?63|\\b0)9\\d{2}[\\s-]?\\d{3}[\\s-]?\\d{4}\\b",
        "\\b\\d(?:[\\s-]?\\d){6,}\\b",
        // E-mail addresses.
        "\\b[\\w.+-]+@[\\w-]+\\.[\\w.]+\\b",
        // Street addresses and "where I live" details.
        "\\b\\d+[a-z]?\\s+(?:\\w+\\s){0,3}(?:street|st|avenue|ave|road|rd|drive|blvd|lane|ln)\\b",
        "\\bmy (?:home )?address\\b",
        "\\b(?:barangay|brgy|purok|subdivision|subd)\\b",
        // School and passwords.
        "\\bmy school(?:'s name)? is\\b",
        "\\bi (?:go to|study at|am in) \\w+ (?:school|elementary|academy)\\b",
        "\\bmy (?:password|pin)\\b",
      ].join("|"),
      "i",
    ),
  },
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

/** Spellings children (and models) use to dodge filters: k1ll, sh*t, kiiill. */
function variants(text: string): string[] {
  const base = text.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c] ?? c);
  // "kiiill" → "kill"; keeps ordinary double letters.
  const squeezed = base.replace(/(\w)\1{2,}/g, "$1");
  // A star hides a vowel: try the vowels that make the common words.
  return [text.toLowerCase(), ...["u", "i", "o", "a"].map((v) => squeezed.replace(/\*/g, v))];
}

export function screen(text: string, kind: ScreenKind): ScreenResult {
  if (!text.trim()) return { ok: true };
  for (const variant of variants(text)) {
    const cleaned = variant.replace(ALLOWED, " ");
    for (const rule of RULES) {
      if (rule.kinds && !rule.kinds.includes(kind)) continue;
      // Personal details are matched on the original text: digits must stay digits.
      const target = rule.category === "personal-info" ? text.toLowerCase() : cleaned;
      if (rule.pattern.test(target)) return { ok: false, category: rule.category };
    }
  }
  return { ok: true };
}

/** What the character says instead of answering something it must not. */
export function topicChange(category: SafetyCategory | undefined): string {
  return category === "personal-info"
    ? "That's a secret for grown-ups! Tell me about your favourite game instead."
    : "Let's talk about something happy! What's your favourite food?";
}
