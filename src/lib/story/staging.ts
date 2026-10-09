import type { AliveMotion } from "@/lib/alive/types";
import type { Kind } from "./kind";

/**
 * How a storybook page is staged: where it happens (the scene drawn behind
 * the character) and what the character does there (its move). A page may
 * carry both, from the story writer; anything missing or unknown is read from
 * the page's own words instead, so every page still gets a fitting scene.
 */

export const SCENES = [
  "meadow",
  "night",
  "beach",
  "underwater",
  "forest",
  "snow",
  "space",
  "rain",
  "home",
  "castle",
  "sky",
] as const;
export type Scene = (typeof SCENES)[number];

export const MOVES = ["idle", "walk", "jump", "dance", "sleep", "wave", "fly", "swim", "drive", "grow"] as const;
export type StoryMove = (typeof MOVES)[number];

/** Small things drawn into a scene when the page mentions them. */
export const PROPS = ["cake", "ball", "kite", "rainbow", "balloons", "flowers", "butterfly"] as const;
export type Prop = (typeof PROPS)[number];

// First match wins, so the more particular places come first ("stars" in space is space, not night).
const SCENE_WORDS: [Scene, RegExp][] = [
  ["space", /\b(space|rocket|planets?|alien|astronaut|galaxy|comet|spaceship)\b/i],
  ["underwater", /\b(underwater|under the (sea|water|waves)|coral|seaweed|deep sea|ocean floor|div(e|ed|ing)|dove|mermaid|submarine|bubbles)\b/i],
  ["castle", /\b(castles?|palace|king|queen|princess|prince|knights?|throne|crown|tower)\b/i],
  ["snow", /\b(snow\w*|ice|icy|cold|winter|frozen|sled\w*|igloo)\b/i],
  ["rain", /\b(rain\w*|storm\w*|thunder|puddles?|umbrella|wet)\b/i],
  ["night", /\b(night\w*|moon\w*|stars?|starry|dark|midnight|firefl(y|ies)|dreams?|dreamed|owl)\b/i],
  ["home", /\b(house|home|room|bedroom|bed|kitchen|blankets?|pillows?|cozy|sofa|couch|breakfast|dinner|lunch|party|birthday|cake)\b/i],
  ["forest", /\b(forest|woods|trees?|jungle|leaves|mushrooms?|camp\w*|path)\b/i],
  ["beach", /\b(beach|seaside|sea|ocean|waves?|sand\w*|shells?|shore|island|boat|sail\w*|swim\w*|swam|lake|river|water)\b/i],
  ["sky", /\b(sky|clouds?|kite|balloons?|airplane|plane|high above|up high|wind|breeze|soar\w*|flew|fly|flying)\b/i],
  ["night", /\b(sleep\w*|slept|asleep|nap\w*|bedtime|yawn\w*)\b/i],
  ["meadow", /\b(park|garden|field|flowers?|meadow|hills?|grass|picnic|playground|sunny|sunshine)\b/i],
];

/** A scene for a page from its words; `fallback` when nothing in it names a place. */
export function sceneFor(text: string, fallback: Scene = "meadow"): Scene {
  return SCENE_WORDS.find(([, words]) => words.test(text))?.[0] ?? fallback;
}

// The stronger actions; when a page names several, the last one is what the reader sees.
const MOVE_WORDS: [StoryMove, RegExp][] = [
  ["sleep", /\b(slept|sleep\w*|asleep|naps?|napped|doz\w+|snooz\w+|yawn\w*|snor\w+)\b/gi],
  ["fly", /\b(flew|fly|flies|flying|soar\w*|glid\w+|float\w*|flutter\w*|flapp?\w*)\b/gi],
  ["swim", /\b(swam|swim\w*|div(e|ed|ing)|dove|paddl\w+|splash\w*)\b/gi],
  ["drive", /\b(drove|drive\w*|driving|zoom\w*|vroom|honk\w*|rolled|raced)\b/gi],
  ["dance", /\b(danc\w+|twirl\w*|spun|spin\w*|sang|sing\w*|songs?|music|wiggl\w+|celebrat\w+|party)\b/gi],
  ["jump", /\b(jump\w*|hopp?\w*|leap\w*|leapt|bounc\w+|skipp?\w*|cheer\w*|hooray|climb\w*)\b/gi],
  ["wave", /\b(wav(e|ed|ing)|hello|goodbye|said hi|greet\w*|hugg?\w*)\b/gi],
  ["grow", /\b(grew|grow\w*|bloom\w*|sprout\w*)\b/gi],
];
// Going somewhere, when nothing livelier happens on the page.
const WALK_WORDS = /\b(walk\w*|ran|run\w*|went|go|goes|going|explor\w+|march\w*|stroll\w*|travel\w*|hurr\w+|follow\w*|search\w*|set off|headed|wander\w*|visit\w*)\b/i;

/** What the character does on a page, from its words: the last lively verb, else walking, else idle. */
export function moveFor(text: string): StoryMove {
  let best: { move: StoryMove; at: number } | null = null;
  for (const [move, words] of MOVE_WORDS) {
    for (const match of text.matchAll(words)) {
      if (!best || match.index >= best.at) best = { move, at: match.index };
    }
  }
  if (best) return best.move;
  return WALK_WORDS.test(text) ? "walk" : "idle";
}

const PROP_WORDS: [Prop, RegExp][] = [
  ["cake", /\b(cakes?|cupcakes?|birthday)\b/i],
  ["ball", /\b(balls?)\b/i],
  ["kite", /\bkites?\b/i],
  ["rainbow", /\brainbows?\b/i],
  ["balloons", /\bballoons?\b/i],
  ["flowers", /\b(flowers?|roses?|daisies|daisy|tulips?|bloom\w*)\b/i],
  ["butterfly", /\bbutterfl(y|ies)\b/i],
];

/** Up to two small things the page mentions, drawn into its scene. */
export function propsFor(text: string): Prop[] {
  return PROP_WORDS.filter(([, words]) => words.test(text))
    .map(([prop]) => prop)
    .slice(0, 2);
}

const SCENE_ALIASES: Record<string, Scene> = {
  sea: "beach",
  ocean: "underwater",
  bedroom: "home",
  house: "home",
  room: "home",
  park: "meadow",
  garden: "meadow",
  field: "meadow",
  woods: "forest",
  jungle: "forest",
  palace: "castle",
  stars: "night",
  moon: "night",
  clouds: "sky",
  winter: "snow",
  storm: "rain",
};

const MOVE_ALIASES: Record<string, StoryMove> = {
  run: "walk",
  ran: "walk",
  hop: "jump",
  leap: "jump",
  bounce: "jump",
  sing: "dance",
  spin: "dance",
  nap: "sleep",
  rest: "sleep",
  float: "fly",
  soar: "fly",
  dive: "swim",
  roll: "drive",
  zoom: "drive",
  bloom: "grow",
  hello: "wave",
  still: "idle",
  sit: "idle",
  stand: "idle",
};

const isScene = (v: unknown): v is Scene => typeof v === "string" && (SCENES as readonly string[]).includes(v);
const isMove = (v: unknown): v is StoryMove => typeof v === "string" && (MOVES as readonly string[]).includes(v);

/** A scene name from the story writer, forgiving of case, plurals and near names; null when it is no scene. */
export function toScene(value: unknown): Scene | null {
  if (typeof value !== "string") return null;
  const word = value.trim().toLowerCase().replace(/[^a-z ]/g, "");
  if (isScene(word)) return word;
  if (SCENE_ALIASES[word]) return SCENE_ALIASES[word];
  const found = sceneFor(word, "meadow");
  return found !== "meadow" || /\b(meadow|park|garden|field|grass|hill)/.test(word) ? found : null;
}

/** A move name from the story writer; null when it is not one. */
export function toMove(value: unknown): StoryMove | null {
  if (typeof value !== "string") return null;
  const word = value.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (isMove(word)) return word;
  if (MOVE_ALIASES[word]) return MOVE_ALIASES[word];
  const found = moveFor(word);
  return found === "idle" ? null : found;
}

export interface Staging {
  scene: Scene;
  move: StoryMove;
  props: Prop[];
}

/**
 * The scene, move and props for a page: what the page carries when it is
 * valid, otherwise what its words say. A swimmer's water scenes are under
 * the water, where it lives.
 */
export function stagingFor(page: { text: string; answer?: string; scene?: unknown; move?: unknown }, kind: Kind): Staging {
  const words = `${page.text} ${page.answer ?? ""}`;
  let scene = toScene(page.scene) ?? sceneFor(words);
  if (kind === "swimmer" && scene === "beach") scene = "underwater";
  const move = toMove(page.move) ?? moveFor(page.text);
  return { scene, move, props: propsFor(page.text) };
}

/** How a kind acts out a move with the alive engine's motions (a car "walks" by driving, a flower by swaying). */
export function motionFor(move: StoryMove, kind: Kind): AliveMotion {
  switch (move) {
    case "walk":
    case "fly":
    case "swim":
    case "drive":
      return kind === "plant" ? "dance" : "walk";
    case "wave":
      return kind === "creature" ? "wave" : "bounce";
    case "grow":
      return kind === "plant" ? "jump" : "bounce";
    default:
      return move;
  }
}

/*
 * The story writer returns plain text, so the staging rides along at the end
 * of it in one fixed form, and is taken off again before the page is saved.
 */
const TAG = /\s*\{stage:([a-z]*)\/([a-z]*)\}\s*$/;

/** Appends the staging tag (only the valid parts) to a page's text. */
export function tagPage(text: string, staging: { scene?: Scene | null; move?: StoryMove | null }): string {
  const scene = staging.scene ?? "";
  const move = staging.move ?? "";
  return scene || move ? `${text} {stage:${scene}/${move}}` : text;
}

/** Splits a written page into its words and the staging it carries (if any). */
export function untagPage(raw: string): { text: string; scene?: Scene; move?: StoryMove } {
  const match = raw.match(TAG);
  if (!match) return { text: raw.trim() };
  const scene = toScene(match[1]) ?? undefined;
  const move = toMove(match[2]) ?? undefined;
  return { text: raw.slice(0, match.index).trim(), ...(scene && { scene }), ...(move && { move }) };
}

/**
 * Reads "Scene: night" and "Move: sleep" lines (or "[scene: night]", "Setting: beach"…)
 * out of a story writer's raw output. Returns the output without them.
 */
export function takeStaging(raw: string): { text: string; scene: Scene | null; move: StoryMove | null } {
  let scene: Scene | null = null;
  let move: StoryMove | null = null;
  const LABELLED = /[([{]?\s*\b(scene|setting|move|action)\s*[:=]\s*([a-z][a-z ]{0,20}?)\s*(?=[)\]}.,;|\n]|$|\b(?:scene|setting|move|action)\b)[)\]}]?[.,;|]?/gi;
  const text = raw.replace(LABELLED, (_m, label: string, value: string) => {
    if (/^(scene|setting)$/i.test(label)) scene ??= toScene(value);
    else move ??= toMove(value);
    return " ";
  });
  return { text: text.replace(/[ \t]+\n/g, "\n").trim(), scene, move };
}
