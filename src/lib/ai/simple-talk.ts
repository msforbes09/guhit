/**
 * Talking with the listening ears alone (no story helper): the friend hears
 * the child, does the moves it is asked for ("jump!", "Tala, dance"), and
 * answers with short written lines that show it heard: hello, a colour, an
 * animal. Everything else gets a playful nudge toward its own moves. The
 * child's words still pass the safety screen first.
 */
import type { Kind } from "@/lib/story/kind";
import { screen, topicChange } from "./safety";

export interface SimpleMove {
  label: string;
  motion: string;
}

/** "Wake up": ends a sleep (the screen goes back to idle). */
export const WAKE: SimpleMove = { label: "Wake", motion: "idle" };

/** Other words for each motion, beyond the button's own label. */
const SAY_FOR_MOTION: Record<string, string[]> = {
  // "jam" is how the ears often hear a short, shouted "jump!".
  jump: ["jump", "jam", "hop", "bounce", "grow", "flap", "leap"],
  dance: ["dance", "wiggle", "boogie", "honk", "spin"],
  walk: ["walk", "run", "drive", "fly", "swim", "go", "move"],
  sleep: ["sleep", "nap", "bed", "goodnight", "night"],
  wave: ["wave", "hello wave"],
};

const words = (text: string) => text.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(Boolean);

/** The move the child asked for, if any: its button label first, then other words for it. */
export function hearMove(heard: string, moves: SimpleMove[]): SimpleMove | null {
  const said = new Set(words(heard));
  if (said.has("wake") || said.has("awake")) return WAKE;
  for (const move of moves) {
    if (said.has(move.label.toLowerCase())) return move;
  }
  for (const move of moves) {
    if ((SAY_FOR_MOTION[move.motion] ?? []).some((word) => said.has(word))) return move;
  }
  return null;
}

/** How each kind of friend sounds when it is happy. */
const SOUND: Record<Kind, string> = {
  creature: "Hee hee!",
  vehicle: "Vroom!",
  plant: "Rustle rustle!",
  flyer: "Tweet tweet!",
  swimmer: "Splash!",
  thing: "Boing!",
};

const COLOURS = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "black", "white", "gold", "rainbow"];
const ANIMALS = [
  "cat", "dog", "puppy", "kitten", "bird", "fish", "horse", "cow", "pig", "duck", "rabbit", "bunny", "lion", "tiger",
  "bear", "elephant", "monkey", "dinosaur", "dragon", "unicorn", "frog", "turtle", "owl", "butterfly", "bee", "shark",
];
const GREETINGS = ["hi", "hello", "hey", "hiya", "morning"];
const KIND_WORDS = ["yes", "yay", "cool", "nice", "love", "like", "good", "great", "awesome", "fun", "pretty"];
const pick = <T,>(items: T[], turn: number): T => items[Math.abs(turn) % items.length];

/**
 * A short line in the friend's own voice, for the ears alone. `turn` varies
 * the words; `moves` are the friend's move buttons, to suggest one to try.
 */
export function simpleReply(
  heard: string,
  c: { name: string; kind: Kind; moves?: string[] },
  move: SimpleMove | null,
  turn: number,
): string {
  const verdict = screen(heard, "child");
  if (!verdict.ok) return topicChange(verdict.category);
  const sound = SOUND[c.kind];
  if (move === WAKE) return "Yawn! I'm awake!";
  if (move?.motion === "sleep") return "Yawn… night night!";
  if (move) return pick([`${sound} Watch me ${move.label.toLowerCase()}!`, `Okay! ${move.label}! Again?`], turn);
  const said = words(heard);
  if (said.length === 0) return "Hmm? Say it again!";
  if (said.some((w) => GREETINGS.includes(w))) return `Hi! I'm ${c.name}! ${sound}`;
  const colour = COLOURS.find((w) => said.includes(w));
  if (colour) return pick([`I love ${colour}! ${sound}`, `${colour[0].toUpperCase()}${colour.slice(1)} is so pretty!`], turn);
  const animal = ANIMALS.find((w) => said.includes(w) || said.includes(`${w}s`));
  if (animal) return pick([`A ${animal}? I want to meet it!`, `Ooh, a ${animal}! ${sound}`], turn);
  if (said.some((w) => KIND_WORDS.includes(w))) return pick(["I like that!", `${sound} That makes me happy!`], turn);
  const [first, second] = (c.moves ?? ["Jump", "Dance"]).map((label) => label.toLowerCase());
  return pick([`${sound} Tell me to ${first}!`, `Hmm! Can I ${second ?? first} for you?`], turn);
}

export type PromptId = "name" | "dance" | "joke" | "sleepy";

/** Picture buttons a child can tap to chat without the story helper (or say, with the ears). */
export const PROMPTS: { id: PromptId; label: string }[] = [
  { id: "name", label: "What's your name?" },
  { id: "dance", label: "Let's dance!" },
  { id: "joke", label: "Tell me a joke" },
  { id: "sleepy", label: "Are you sleepy?" },
];

/** Picture-book jokes, short enough to read aloud in one breath. */
const JOKES = [
  "Why did the crayon go to school? To get a little sharper!",
  "What do you call a sleeping dinosaur? A dino-snore!",
  "Why are fish so smart? They swim in schools!",
  "What does a cloud wear under its coat? Thunder-wear!",
  "Why did the cookie go to the doctor? It felt crummy!",
];

/** What the child asked out loud, when it is one of the picture buttons' questions. */
export function hearPrompt(heard: string): PromptId | null {
  const said = words(heard).join(" ");
  if (/\bjoke\b|\bfunny\b/.test(said)) return "joke";
  if (/\bsleepy\b|\btired\b/.test(said)) return "sleepy";
  if (/\byour name\b|\bwho are you\b/.test(said)) return "name";
  if (/\blet's dance\b|\blets dance\b/.test(said)) return "dance";
  return null;
}

/**
 * The friend's answer to a picture button, in its own words, and the move
 * that acts it out (one of its own moves; `turn` varies the jokes).
 */
export function promptReply(
  id: PromptId,
  c: { name: string; kind: Kind },
  moves: SimpleMove[],
  turn: number,
): { text: string; move: SimpleMove | null } {
  const sound = SOUND[c.kind];
  const byMotion = (motion: string) => moves.find((m) => m.motion === motion) ?? null;
  const happy = byMotion("jump") ?? moves[0] ?? null;
  switch (id) {
    case "name":
      return { text: `I'm ${c.name}! ${sound}`, move: byMotion("wave") ?? happy };
    case "dance": {
      const dance = byMotion("dance");
      return { text: dance ? `${sound} Watch me ${dance.label.toLowerCase()}!` : `${sound} Let's go!`, move: dance ?? happy };
    }
    case "joke":
      return { text: pick(JOKES, turn), move: happy };
    case "sleepy":
      return { text: "Yawn… a little! Night night!", move: byMotion("sleep") };
  }
}
