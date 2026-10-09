import type { Metadata } from "next";
import { Suspense } from "react";
import { FriendSkeleton } from "@/components/kid/FriendScreen";
import { StoryScreen } from "@/components/kid/StoryScreen";

export const metadata: Metadata = { title: "Make a story · Guhit" };

// The friend id is in the query string so this page has one fixed URL the
// offline cache can keep; reading it needs a Suspense boundary.
export default function StoryRoute() {
  return (
    <Suspense fallback={<FriendSkeleton />}>
      <StoryScreen />
    </Suspense>
  );
}
