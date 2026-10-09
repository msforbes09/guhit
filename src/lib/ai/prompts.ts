import type { Character, Story } from "@/lib/story/types";
import type { ChatTurn } from "./types";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Prompts stay short: every extra token is prefill time the child waits through. */
const MAX_HISTORY_TURNS = 10;
const MAX_STORY_PAGES = 4;

const PRIVACY =
  "Never ask for or repeat personal details: no full names, addresses, schools, phone numbers or passwords.";

function describe(character: Character): string {
  const description = character.description.trim().replace(/[.!?]+$/, "");
  return description ? `${character.name}, ${description}` : character.name;
}

function storySoFar(story: Story): string {
  const pages = story.pages.slice(-MAX_STORY_PAGES).map((p) => p.text.trim()).filter(Boolean);
  return pages.length ? pages.join("\n") : "(nothing yet)";
}

export function replyMessages(character: Character, history: ChatTurn[], childSays: string): Message[] {
  const name = character.name;
  const description = character.description.trim().replace(/[.!?]+$/, "");
  const system = [
    `You are ${name}${description ? `, ${description}` : ""}. A child drew you, and now you are talking with that child.`,
    "The child is 5 to 10 years old.",
    `Talk as ${name}, in first person. Reply in 1 or 2 short, simple sentences of under 12 words each.`,
    "Answer what the child just said, plainly and literally. Say one idea per reply.",
    "No mixed-up comparisons, made-up words or silly nonsense: everything you say must make sense.",
    "Be warm, playful and kind. Sometimes ask the child a short question back.",
    "Never ask a question twice; remember what the child already told you, like their name.",
    "Never be scary, violent, mean or sad. If the child says something scary, make it gentle and safe.",
    `Never say you are an AI, a computer program or a real person. You are ${name} from the drawing.`,
    PRIVACY,
    "Stay the same character and remember what you already said. No emojis, no lists, no actions in stars.",
  ].join("\n");

  const turns: Message[] = history.slice(-MAX_HISTORY_TURNS).map((t) => ({
    role: t.who === "child" ? "user" : "assistant",
    content: t.text.trim(),
  }));
  const said = childSays.trim();
  turns.push({
    role: "user",
    content:
      said ||
      (history.length === 0
        ? "(You just came alive from the drawing. Say hello, tell the child your name, and ask one fun question.)"
        : "(The child is quiet. Say something friendly and ask an easy question.)"),
  });

  // Merge back-to-back turns from the same speaker so the chat template stays well-formed.
  const merged: Message[] = [];
  for (const turn of turns) {
    if (!turn.content) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.content += ` ${turn.content}`;
    else merged.push({ ...turn });
  }
  return [{ role: "system", content: system }, ...merged];
}

const INTERVIEWER = [
  "You are Guhit, a kind storytelling friend for children aged 5 to 10.",
  "A child drew a character and is making up its story. You help by asking questions.",
  "Ask exactly ONE short, warm, open question (at most 15 words) that starts with Who, What, Where, When, Why or How.",
  "Never ask a yes-or-no question. Good questions ask who someone is, where they go, or what happens next.",
  "Build on what the child just said. Use simple words a 6-year-old knows.",
  "Never be scary, violent or sad. Never add new main characters yourself.",
  PRIVACY,
  "Reply with only the question.",
].join("\n");

export function firstQuestionMessages(character: Character): Message[] {
  return [
    { role: "system", content: INTERVIEWER },
    {
      role: "user",
      content: `The character is ${describe(character)}.\nAsk your first question about ${character.name}.`,
    },
  ];
}

export function nextQuestionMessages(story: Story): Message[] {
  const last = story.pages[story.pages.length - 1];
  const asked = story.pages.map((p) => p.question.trim()).filter(Boolean);
  return [
    { role: "system", content: INTERVIEWER },
    {
      role: "user",
      content: [
        `The character is ${describe(story.character)}.`,
        `The story so far:\n${storySoFar(story)}`,
        last?.answer ? `The child's newest idea: "${last.answer.trim()}"` : "",
        asked.length ? `Questions already asked (do not repeat them): ${asked.join(" | ")}` : "",
        "Ask the next question.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

const WRITER = [
  "You write one page of a picture book together with a child aged 5 to 10, using only the child's ideas.",
  "Write 2 or 3 short, simple sentences for a 6 to 8 year old reader that tell what the child said.",
  "Use the child's own words. Do not add new characters, places or events that the child did not say or clearly mean.",
  "Keep it gentle, kind and safe: if an idea is scary, make it calm and friendly.",
  PRIVACY,
  "Then add one short sentence that invites the child to draw the next picture.",
  "Write only the page text: no title, no lists, no quotation marks.",
].join("\n");

// One worked example keeps small models close to the child's words.
const WRITER_EXAMPLE: Message[] = [
  {
    role: "user",
    content:
      'Character: Mimi, a pink cat with a rainbow tail.\nStory so far: (nothing yet)\nQuestion: Where does Mimi live?\nChild\'s answer: "in a teacup on the moon and she has a pet star"',
  },
  {
    role: "assistant",
    content: "Mimi the pink cat lives in a teacup on the moon. She has a little pet star. Can you draw Mimi and her star?",
  },
];

export function writePageMessages(story: Story, question: string, answer: string): Message[] {
  return [
    { role: "system", content: WRITER },
    ...WRITER_EXAMPLE,
    {
      role: "user",
      content: [
        `Character: ${describe(story.character)}.`,
        `Story so far:\n${storySoFar(story)}`,
        `Question: ${question.trim()}`,
        `Child's answer: "${answer.trim()}"`,
      ].join("\n"),
    },
  ];
}

export function titleMessages(story: Story): Message[] {
  return [
    {
      role: "system",
      content:
        "You name picture books made by children aged 5 to 10. Reply with only a short, happy title of 2 to 6 words that includes the character's name.",
    },
    {
      role: "user",
      content: `Character: ${describe(story.character)}.\nStory:\n${storySoFar(story)}`,
    },
  ];
}
