export interface Character {
  id: string;
  name: string;
  description: string;
  /** Data URL of the child's drawing (PNG). Never altered by AI. */
  drawing: string;
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
