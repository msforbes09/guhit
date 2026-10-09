"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getFriend, type Friend } from "@/lib/story/db";
import { House } from "./icons";
import { MeetFriend } from "./MeetFriend";
import { TalkToFriend } from "./TalkToFriend";
import { LinkButton, TopBar } from "./ui";

/** /friend?id=…: meet a new character, or talk with one already named. */
export function FriendScreen() {
  const id = useSearchParams().get("id");
  const [loaded, setLoaded] = useState<{ id: string | null; friend: Friend | null } | null>(null);

  useEffect(() => {
    let alive = true;
    (id ? getFriend(id) : Promise.resolve(undefined))
      .then((friend) => alive && setLoaded({ id, friend: friend ?? null }))
      .catch(() => alive && setLoaded({ id, friend: null }));
    return () => {
      alive = false;
    };
  }, [id]);

  const [met, setMet] = useState<Friend | null>(null);

  if (!loaded || loaded.id !== id) return <FriendSkeleton />;
  if (!loaded.friend) return <FriendMissing />;

  const friend = met && met.id === loaded.friend.id ? met : loaded.friend;
  if (!friend.name) return <MeetFriend friend={friend} onMet={setMet} />;
  return <TalkToFriend key={friend.id} friend={friend} />;
}

export function FriendSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col" aria-busy="true">
      <TopBar />
      <div className="px-4 sm:px-6">
        <div className="h-[50vh] min-h-80 animate-pulse rounded-cut-lg bg-paper-deep lg:h-[72vh]" />
      </div>
    </main>
  );
}

function FriendMissing() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <TopBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-16 text-center">
        <p className="font-display text-4xl font-black text-ink">Hmm, where did they go?</p>
        <p className="max-w-sm text-xl text-ink-soft">This friend isn&rsquo;t on this device. Let&rsquo;s make a new one!</p>
        <LinkButton href="/" tone="sun" size="lg" icon={<House size={30} weight="fill" aria-hidden="true" />}>
          Go home
        </LinkButton>
      </div>
    </main>
  );
}
