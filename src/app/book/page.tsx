import type { Metadata } from "next";
import { Suspense } from "react";
import { BookScreen } from "@/components/kid/BookScreen";

export const metadata: Metadata = { title: "Storybook · Guhit" };

// The story id is in the query string so this page has one fixed URL the
// offline cache can keep; reading it needs a Suspense boundary.
export default function BookRoute() {
  return (
    <Suspense>
      <BookScreen />
    </Suspense>
  );
}
