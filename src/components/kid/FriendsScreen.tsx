"use client";

import { FriendsGrid, useFriends } from "./FriendsGrid";
import { Camera, PaintBrush } from "./icons";
import { LinkButton, TopBar } from "./ui";

/** /friends: every character on this device; open one to talk, or say goodbye. */
export function FriendsScreen() {
  const { friends, refresh } = useFriends();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <TopBar title="My friends" />
      <div className="flex flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
        {friends === null ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-cut bg-paper-deep" />
            ))}
          </div>
        ) : friends.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 pb-16 text-center">
            <p className="font-display text-4xl font-black text-ink">No friends yet!</p>
            <p className="max-w-sm text-xl text-ink-soft">Snap a drawing or draw one here, and it will live on this shelf.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/snap" tone="sun" size="lg" icon={<Camera size={32} weight="fill" aria-hidden="true" />}>
                Snap a drawing
              </LinkButton>
              <LinkButton href="/draw" tone="sky" size="lg" icon={<PaintBrush size={30} weight="fill" aria-hidden="true" />}>
                Draw one
              </LinkButton>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xl text-ink-soft">Tap a friend to talk again.</p>
            <FriendsGrid friends={friends} onChange={refresh} />
          </>
        )}
      </div>
    </main>
  );
}
