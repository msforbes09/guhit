import type { Metadata } from "next";
import { SetupClient } from "./setup-client";

export const metadata: Metadata = {
  title: "Get Guhit ready",
  description: "Download Guhit's on-device AI once, then use it without internet.",
};

export default function SetupPage() {
  return <SetupClient />;
}
