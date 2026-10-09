import { settledKind } from "@/lib/story/kind";
import { tagPage } from "@/lib/story/staging";
import type { Character, Story } from "@/lib/story/types";
import { plotFor, tell } from "./mock-stories";

/**
 * Stories without the story helper: ready-written picture-book plots that suit
 * the character (mock-stories.ts), told one page per answer. Test mode uses
 * them too.
 */

const pick = <T,>(items: T[], index: number): T => items[Math.abs(index) % items.length];

// The child guesses what happens next; the page then tells it.
const FOLLOW_UPS = [
  (name: string) => `Ooh! Where do you think ${name} goes next?`,
  (name: string) => `Who do you think ${name} meets?`,
  (name: string) => `What do you think ${name} does now?`,
  (name: string) => `How do you think ${name} feels?`,
  (name: string) => `What happens to ${name} at the very end?`,
];

export const writtenFirstQuestion = (character: Character) =>
  `Hello! Let’s make a story. What do you think ${character.name} does first?`;

export const writtenNextQuestion = (story: Story) => pick(FOLLOW_UPS, story.pages.length - 1)(story.character.name);

/** The next page of a ready-written story that suits the character, with its scene and move. */
export function writtenPage(story: Story): string {
  const kind = settledKind(story.character);
  const plot = plotFor(story.id, kind);
  const next = plot.pages[Math.min(story.pages.length, plot.pages.length - 1)];
  return tagPage(tell(next.text, story.character.name, kind), next);
}

export function writtenTitle(story: Story): string {
  const kind = settledKind(story.character);
  return tell(plotFor(story.id, kind).title, story.character.name, kind);
}
