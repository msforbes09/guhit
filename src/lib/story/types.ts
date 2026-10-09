import type { Kind } from "./kind";

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
}

export interface Story {
  id: string;
  title: string;
  character: Character;
  pages: StoryPage[];
  createdAt: number;
  updatedAt: number;
}
