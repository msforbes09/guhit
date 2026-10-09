import type { Metadata } from "next";
import { DrawScreen } from "@/components/kid/DrawScreen";

export const metadata: Metadata = { title: "Draw your friend · Guhit" };

export default function DrawPage() {
  return <DrawScreen />;
}
