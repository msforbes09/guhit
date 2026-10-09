import type { Kind } from "@/lib/story/kind";
import type { Scene, StoryMove } from "@/lib/story/staging";

/**
 * Test mode's storybooks: short, warm picture-book stories with a beginning,
 * a middle and an end, for readers aged 4 to 8. Each page is one or two short
 * sentences and says where it happens and what the character does there.
 *
 * In the words, {Name} is the character's name, {went} how it gets about
 * (walked, drove, flew…) and {rose} how it goes up (climbed, zoomed, grew…).
 */

export interface PlotPage {
  text: string;
  scene: Scene;
  move: StoryMove;
}

export interface Plot {
  title: string;
  /** The kinds of character the story suits. */
  kinds: Kind[];
  pages: PlotPage[];
}

const page = (scene: Scene, move: StoryMove, text: string): PlotPage => ({ text, scene, move });

const GETS_ABOUT: Kind[] = ["creature", "thing", "vehicle", "flyer"];
const WALKERS: Kind[] = ["creature", "thing"];

export const PLOTS: Plot[] = [
  {
    title: "{Name} and the Moon Picnic",
    kinds: GETS_ABOUT,
    pages: [
      page("meadow", "jump", "One sunny morning, {Name} found a note in the grass. It said, “Come to a picnic on the moon!”"),
      page("forest", "walk", "So {Name} packed a basket of berries and {went} off through the whispering woods."),
      page("night", "wave", "When the stars came out, a friendly owl waved hello. “Follow the moonbeams,” it said."),
      page("space", "jump", "Up, up, up {rose} {Name}, all the way to the moon!"),
      page("space", "dance", "The stars were waiting with lemonade. They shared the berries and danced until everyone sparkled."),
      page("home", "sleep", "Back home in bed, {Name} gave a happy, sleepy yawn. Where should {Name} go next? Draw it for me!"),
    ],
  },
  {
    title: "{Name} Finds the Treasure",
    kinds: WALKERS,
    pages: [
      page("meadow", "walk", "{Name} was playing in the park when a paper map came fluttering down from the sky."),
      page("forest", "walk", "The map showed a twisty path through the forest. {Name} followed it, past mushrooms and a sleepy owl."),
      page("beach", "jump", "The path ended at a sandy beach. {Name} jumped into a little boat and sailed across the sparkly water."),
      page("castle", "wave", "On the other side stood a castle! A kind queen waved and said, “Welcome, {Name}! We’ve been waiting for you.”"),
      page("castle", "dance", "The treasure was not gold at all. It was a party with music and cake, just for {Name}!"),
      page("night", "sleep", "Under the twinkly stars, {Name} sailed home, happy and sleepy. What treasure would you find? Draw it for me!"),
    ],
  },
  {
    title: "{Name}’s Big Snow Day",
    kinds: WALKERS,
    pages: [
      page("home", "jump", "{Name} jumped out of bed and peeked outside. The whole world was white and sparkly!"),
      page("snow", "walk", "Crunch, crunch, crunch! {Name} {went} out into the deep, soft snow."),
      page("snow", "dance", "{Name} built a snowman with a carrot nose, then danced around it in a happy circle."),
      page("castle", "wave", "At the top of the hill was a castle made of ice! A polar bear waved from the door. “Come in and play!”"),
      page("night", "dance", "When the stars came out, they lit a snowy lantern and danced on the ice together."),
      page("home", "sleep", "Then {Name} went home, warm and cozy, and dreamed of snowflakes. What would you build in the snow? Draw it for me!"),
    ],
  },
  {
    title: "The Birthday Surprise for {Name}",
    kinds: GETS_ABOUT,
    pages: [
      page("home", "idle", "It was {Name}’s birthday, but nobody said a word. Was everyone too busy?"),
      page("meadow", "walk", "{Name} {went} to the park to find some friends, but the park was very quiet."),
      page("forest", "walk", "Then {Name} heard giggles coming from the forest. What could it be?"),
      page("forest", "jump", "“Surprise!” shouted all the friends, jumping out from behind the trees."),
      page("meadow", "dance", "There was a cake with candles and balloons in every color. {Name} danced the happiest dance."),
      page("night", "sleep", "That night, {Name} fell asleep still smiling. What present would you give {Name}? Draw it for me!"),
    ],
  },
  {
    title: "{Name} Drives to the Sea",
    kinds: ["vehicle"],
    pages: [
      page("meadow", "jump", "Beep beep! {Name} woke up with a full tank and a big idea. “Today, let’s go to the sea!”"),
      page("forest", "drive", "{Name} drove along the twisty road, past tall trees and a family of deer."),
      page("rain", "drive", "Pitter-patter! A rain cloud came along, but {Name} kept going. Swish, swish went the puddles."),
      page("beach", "dance", "At last, there was the sea, shining and blue! {Name} gave a happy honk. Beep beep!"),
      page("beach", "drive", "{Name} gave rides along the sand to a crab, a seagull and a very small turtle."),
      page("night", "sleep", "When the moon came up, {Name} rolled home slowly and rested for the night. Where should {Name} drive tomorrow? Draw it for me!"),
    ],
  },
  {
    title: "{Name} Above the Clouds",
    kinds: ["flyer"],
    pages: [
      page("meadow", "jump", "{Name} wiggled and stretched in the morning sun. It was a perfect day for flying!"),
      page("sky", "fly", "Up and away! {Name} flew higher and higher, right into the fluffy clouds."),
      page("sky", "dance", "A flock of little birds came to play. They looped and swooped in a happy sky dance."),
      page("rain", "fly", "Oh no, a grumpy rain cloud! {Name} flew around it and found a rainbow on the other side."),
      page("castle", "wave", "Over the hills stood a castle with a tall tower. A princess at the window waved to {Name}."),
      page("night", "sleep", "When the moon came out, {Name} flew home and settled down to sleep. Where would you fly? Draw it for me!"),
    ],
  },
  {
    title: "{Name} and the Friendly Wave",
    kinds: ["swimmer"],
    pages: [
      page("underwater", "swim", "Deep under the sea, {Name} swam past wavy seaweed and shiny shells."),
      page("underwater", "dance", "A little crab clicked a happy song, so {Name} wiggled and danced along. Click, click, swish!"),
      page("beach", "jump", "{Name} leapt out of the waves, higher than ever before! On the beach, a seagull cheered."),
      page("sky", "swim", "Then a giant, friendly wave lifted {Name} up into the sky! {Name} swam through the clouds like they were bubbles."),
      page("night", "wave", "When the stars came out, the moon smiled and set {Name} gently back into the sea."),
      page("underwater", "sleep", "Back home under the waves, {Name} snuggled into the soft sand. What did {Name} dream about? Draw it for me!"),
    ],
  },
  {
    title: "{Name} Grows All Year",
    kinds: ["plant"],
    pages: [
      page("meadow", "grow", "In a sunny garden, {Name} stretched up toward the warm, golden sun."),
      page("rain", "dance", "Pitter-patter! A gentle rain came, and {Name} swayed and drank every drop."),
      page("meadow", "wave", "Buzz, buzz! A bumblebee and a butterfly came to visit, and {Name} wiggled hello."),
      page("forest", "dance", "When the wind blew, the leaves in the forest danced, and {Name} danced with them."),
      page("snow", "sleep", "Then winter came with soft, white snow. {Name} tucked in for a long, cozy sleep."),
      page("meadow", "grow", "When spring came back, {Name} woke up with a brand new flower! What color is it? Draw it for me!"),
    ],
  },
];

const WENT: Record<Kind, string> = {
  creature: "walked",
  thing: "bounced",
  vehicle: "drove",
  flyer: "flew",
  swimmer: "swam",
  plant: "swayed",
};
const ROSE: Record<Kind, string> = {
  creature: "climbed",
  thing: "bounced",
  vehicle: "zoomed",
  flyer: "flew",
  swimmer: "floated",
  plant: "grew",
};

function hash(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** The story for a book: one that suits the character, picked by the book's id so it stays the same. */
export function plotFor(storyId: string, kind: Kind): Plot {
  const fits = PLOTS.filter((p) => p.kinds.includes(kind));
  const pool = fits.length ? fits : PLOTS.filter((p) => p.kinds.includes("creature"));
  return pool[hash(storyId) % pool.length];
}

/** Fills in the character's name and how it moves. */
export function tell(text: string, name: string, kind: Kind): string {
  return text.replace(/\{Name\}/g, name).replace(/\{went\}/g, WENT[kind]).replace(/\{rose\}/g, ROSE[kind]);
}
