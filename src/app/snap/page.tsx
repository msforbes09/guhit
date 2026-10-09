import type { Metadata } from "next";
import { SnapScreen } from "@/components/kid/SnapScreen";

export const metadata: Metadata = { title: "Snap your drawing · Guhit" };

export default function SnapPage() {
  return <SnapScreen />;
}
