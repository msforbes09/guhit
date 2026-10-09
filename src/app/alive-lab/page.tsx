import type { Metadata } from "next";
import { AliveLab } from "./AliveLab";

export const metadata: Metadata = {
  title: "Alive lab · Guhit",
};

export default function AliveLabPage() {
  return <AliveLab />;
}
