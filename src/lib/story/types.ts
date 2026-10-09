import type { Kind } from "./kind";
import type { Scene, StoryMove } from "./staging";

export interface Character {
  id: string;
  name: string;
  description: string;
  /** Data URL of the child's drawing (PNG). Never altered by AI. */
  drawing: string;
  /** Data URL of the drawing cut out on a transparent background (PNG). */
  cutout?: string;
  /** What sort of thing it is (see kind.ts); the character moves and talks like one. */
  kind?: Kind;
}

export interface StoryPage {
  id: string;
  /** Data URL of the child's drawing for this scene (PNG), once drawn. */
  drawing?: string;
  question: string;
  answer: string;
  text: string;
  /** Where the page happens, from the story writer (see staging.ts); read from the words when missing. */
  scene?: Scene;
  /** What the character does on the page, from the story writer; read from the words when missing. */
  move?: StoryMove;
}

export interface Story {
  id: string;
  title: string;
  character: Character;
  pages: StoryPage[];
  createdAt: number;
  updatedAt: number;
}
