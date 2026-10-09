import type { ReactNode } from "react";
import type { Kind } from "@/lib/story/kind";
import type { Motion } from "./alive";
import {
  ArrowFatLineUp,
  ArrowFatLinesUp,
  Bird,
  Car,
  Feather,
  Footprints,
  HandWaving,
  Megaphone,
  MoonStars,
  MusicNotes,
  Plant,
  Waves,
} from "./icons";
import type { Tone } from "./ui";

export interface Move {
  motion: Motion;
  label: string;
  tone: Tone;
  icon: ReactNode;
  /** How long the move plays before going back to idle; 0 = until pressed again. */
  lasts: number;
}

const icon = (Icon: typeof Car) => <Icon size={30} weight="fill" aria-hidden="true" />;

const jump: Move = { motion: "jump", label: "Jump", tone: "sun", icon: icon(ArrowFatLineUp), lasts: 3300 };
const dance: Move = { motion: "dance", label: "Dance", tone: "pink", icon: icon(MusicNotes), lasts: 4000 };
const sleep: Move = { motion: "sleep", label: "Sleep", tone: "sky", icon: icon(MoonStars), lasts: 0 };

/** The buttons a friend gets, in its own words: a car drives and honks, a flower grows. */
export function movesFor(kind: Kind): Move[] {
  switch (kind) {
    case "vehicle":
      return [
        { motion: "walk", label: "Drive", tone: "grass", icon: icon(Car), lasts: 8400 },
        jump,
        { motion: "dance", label: "Honk", tone: "pink", icon: icon(Megaphone), lasts: 3200 },
        sleep,
      ];
    case "plant":
      return [{ motion: "jump", label: "Grow", tone: "grass", icon: icon(Plant), lasts: 3200 }, dance, sleep];
    case "flyer":
      return [
        { motion: "walk", label: "Fly", tone: "grass", icon: icon(Bird), lasts: 8400 },
        { motion: "jump", label: "Flap", tone: "sun", icon: icon(Feather), lasts: 3600 },
        dance,
        sleep,
      ];
    case "swimmer":
      return [
        { motion: "walk", label: "Swim", tone: "grass", icon: icon(Waves), lasts: 8400 },
        { motion: "jump", label: "Leap", tone: "sun", icon: icon(ArrowFatLineUp), lasts: 4800 },
        dance,
        sleep,
      ];
    case "thing":
      return [jump, dance, { motion: "walk", label: "Hop", tone: "grass", icon: icon(ArrowFatLinesUp), lasts: 8400 }, sleep];
    default:
      return [
        jump,
        dance,
        { motion: "walk", label: "Walk", tone: "grass", icon: icon(Footprints), lasts: 8400 },
        sleep,
        { motion: "wave", label: "Wave", tone: "grape", icon: icon(HandWaving), lasts: 2800 },
      ];
  }
}

/** How a friend says hello: creatures wave, everything else does its own idle. */
export const greetingMotion = (kind: Kind): Motion => (kind === "creature" ? "wave" : "idle");
