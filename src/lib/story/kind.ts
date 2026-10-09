/**
 * What sort of thing a drawing is, from the words describing it. The single
 * source for anything that depends on it (only creatures get a head, hands
 * and feet and wave; each kind moves like itself). Children mostly draw
 * people and animals, so anything not clearly something else is a creature.
 */
export type Kind = "creature" | "vehicle" | "plant" | "flyer" | "swimmer" | "thing";

const WORDS: Record<Kind, string[]> = {
  vehicle: [
    "car", "jeep", "jeepney", "bus", "truck", "firetruck", "train", "boat", "ship", "bike", "bicycle",
    "motorcycle", "motorbike", "tricycle", "trike", "rocket", "spaceship", "van", "taxi", "tractor",
    "scooter", "wagon", "submarine", "ambulance", "bulldozer", "excavator", "racecar", "kariton",
  ],
  plant: [
    "flower", "tree", "plant", "sunflower", "cactus", "leaf", "leaves", "rose", "tulip", "daisy",
    "bush", "grass", "palm", "mushroom", "vine", "bulaklak", "puno", "halaman",
  ],
  flyer: [
    "bird", "butterfly", "bee", "plane", "airplane", "aeroplane", "jet", "helicopter", "kite",
    "balloon", "owl", "parrot", "eagle", "dragonfly", "ladybug", "ladybird", "moth", "ibon", "paruparo",
    "eroplano", "saranggola", "lobo",
  ],
  swimmer: [
    "fish", "whale", "shark", "dolphin", "octopus", "turtle", "seahorse", "jellyfish", "starfish",
    "crab", "squid", "seal", "isda", "pating", "pagong",
  ],
  creature: [
    "person", "people", "girl", "boy", "man", "men", "woman", "women", "kid", "child", "children",
    "baby", "mom", "mommy", "mama", "dad", "daddy", "papa", "lola", "lolo", "kuya", "teacher",
    "princess", "prince", "king", "queen", "fairy", "mermaid", "superhero", "hero", "ninja", "pirate",
    "wizard", "witch", "ghost", "zombie", "alien", "robot", "monster", "dragon", "dinosaur", "dino",
    "unicorn", "cat", "kitten", "kitty", "dog", "puppy", "bear", "teddy", "bunny", "rabbit", "lion",
    "tiger", "elephant", "monkey", "horse", "pony", "cow", "pig", "sheep", "goat", "fox", "wolf",
    "mouse", "mice", "frog", "giraffe", "zebra", "panda", "koala", "kangaroo", "hippo", "rhino",
    "deer", "squirrel", "hamster", "chicken", "duck", "penguin", "snowman", "carabao", "kalabaw",
    "tao", "bata", "babae", "lalaki", "aso", "pusa", "unggoy", "baboy", "kabayo", "manok", "daga",
    "sister", "brother", "sis", "bro", "friend", "bestie", "grandma", "grandpa", "granny", "nana",
    "aunt", "auntie", "uncle", "cousin", "twin", "family", "me", "myself", "nanay", "tatay", "inay",
    "itay", "tita", "tito", "pinsan", "kapatid", "kaibigan", "guro", "dalaga", "binata",
  ],
  // Clearly inanimate: these hop about but never get arms and legs.
  thing: [
    "house", "castle", "tower", "building", "ball", "cake", "cupcake", "cookie", "pizza", "candy",
    "box", "cup", "mug", "rock", "stone", "star", "heart", "shoe", "hat", "chair", "table", "bed",
    "lamp", "book", "pencil", "crayon", "toy", "block", "clock", "phone", "computer", "tv", "door",
    "sun", "moon", "cloud", "rainbow", "mountain", "apple", "banana", "bahay", "bola", "bato",
    // Not bituin, araw, buwan or ulap: they are popular names too.
  ],
};

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One pattern per kind; a plural "s"/"es" still counts ("cars", "buses").
const PATTERNS = (Object.keys(WORDS) as (keyof typeof WORDS)[]).map((kind) => ({
  kind,
  re: new RegExp(`\\b(?:${WORDS[kind].map(escape).join("|")})(?:e?s)?\\b`, "i"),
}));

/** The kind named earliest in one piece of text ("a girl holding a flower" is a creature), or null. */
function kindIn(text: string): Kind | null {
  let best: { kind: Kind; at: number } | null = null;
  for (const { kind, re } of PATTERNS) {
    const match = re.exec(text);
    if (match && (!best || match.index < best.at)) best = { kind, at: match.index };
  }
  return best?.kind ?? null;
}

/**
 * Pass the most trusted words first: the child's confirmed description, then
 * the drawing reader's guess. The first one that names something decides; a
 * bare name ("Lily") or no words at all means a creature.
 */
export function kindOf(...texts: (string | undefined)[]): Kind {
  for (const text of texts) {
    const kind = text ? kindIn(text) : null;
    if (kind) return kind;
  }
  return "creature";
}

/**
 * The kind to use for a saved friend or story character. Friends saved
 * before creatures became the default were stored as "thing" whenever no
 * keyword matched; those keep "thing" only when their words say so.
 */
export function settledKind(c: { kind?: Kind; description?: string; seenAs?: string }): Kind {
  if (c.kind && c.kind !== "thing") return c.kind;
  return kindOf(c.description, c.seenAs);
}
