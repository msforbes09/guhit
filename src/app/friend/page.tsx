import type { Metadata } from "next";
import { Suspense } from "react";
import { FriendScreen, FriendSkeleton } from "@/components/kid/FriendScreen";

export const metadata: Metadata = { title: "My friend · Guhit" };

// The friend id is in the query string so this page has one fixed URL the
// offline cache can keep; reading it needs a Suspense boundary.
export default function FriendPage() {
  return (
    <Suspense fallback={<FriendSkeleton />}>
      <FriendScreen />
    </Suspense>
  );
}
