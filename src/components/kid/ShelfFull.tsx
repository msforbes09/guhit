"use client";

import { MAX_FRIENDS, type Friend } from "@/lib/story/db";
import { FriendsGrid } from "./FriendsGrid";

/**
 * Shown instead of the camera or the paper when the device already keeps
 * the most friends it can. Nothing is ever replaced without the child
 * choosing who to let go.
 */
export function ShelfFull({ friends, onChange }: { friends: Friend[]; onChange: () => void }) {
  return (
    <section className="anim-float-in flex flex-col gap-6 py-2" aria-labelledby="shelf-full-title">
      <div className="max-w-2xl">
        <h2 id="shelf-full-title" className="text-4xl font-black text-ink sm:text-5xl">
          Your shelf is full!
        </h2>
        <p className="mt-2 text-xl text-ink-soft">
          {MAX_FRIENDS} friends live here already. Let one go to make room for a new friend.
        </p>
      </div>
      <FriendsGrid friends={friends} onChange={onChange} letGoLabel="Let go" linked={false} showEmptySlots={false} />
    </section>
  );
}
