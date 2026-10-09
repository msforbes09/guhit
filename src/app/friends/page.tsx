import type { Metadata } from "next";
import { FriendsScreen } from "@/components/kid/FriendsScreen";

export const metadata: Metadata = { title: "My friends · Guhit" };

export default function FriendsPage() {
  return <FriendsScreen />;
}
