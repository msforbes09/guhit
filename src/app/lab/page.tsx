import type { Metadata } from "next";
import { LabClient } from "./lab-client";

export const metadata: Metadata = {
  title: "Guhit lab",
  description: "Speed test for the on-device models.",
};

export default function LabPage() {
  return <LabClient />;
}
