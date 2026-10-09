"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { deleteFriend, listFriends, MAX_FRIENDS, type Friend } from "@/lib/story/db";
import { Camera, Trash } from "./icons";
import { Button } from "./ui";

const TILTS = [-1.8, 1.4, -1, 2, -1.4];
const PAPERS = ["#e9f4fd", "#fff1c9", "#fde4ee", "#e5f4e3", "#efe6fb"];

/** Every friend on this device, newest first, kept fresh after a goodbye. */
export function useFriends() {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const refresh = useCallback(() => {
    listFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, []);
  useEffect(() => {
    let alive = true;
    listFriends()
      .then((all) => alive && setFriends(all))
      .catch(() => alive && setFriends([]));
    return () => {
      alive = false;
    };
  }, []);
  return { friends, refresh, full: friends !== null && friends.length >= MAX_FRIENDS };
}

function FriendCard({
  friend,
  index,
  onGone,
  letGoLabel,
  linked,
}: {
  friend: Friend;
  index: number;
  onGone: () => void;
  letGoLabel: string;
  linked: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [going, setGoing] = useState(false);
  const name = friend.name || "this friend";

  const letGo = async () => {
    setGoing(true);
    try {
      await deleteFriend(friend.id);
      onGone();
    } catch {
      setGoing(false);
    }
  };

  const picture = (
    <>
      <span
        className="grid aspect-square w-full place-items-center overflow-hidden rounded-[20px_24px_22px_26px] p-3"
        style={{ background: PAPERS[index % PAPERS.length] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
        <img src={friend.cutout ?? friend.drawing} alt="" className="sticker max-h-full max-w-full object-contain" />
      </span>
      <span className="w-full truncate text-center font-display text-2xl font-extrabold text-ink">
        {friend.name || "New friend"}
      </span>
    </>
  );

  return (
    <li
      className="crayon-edge relative flex flex-col gap-3 rounded-cut bg-white p-3 shadow-soft"
      style={{ transform: `rotate(${TILTS[index % TILTS.length]}deg)` } as CSSProperties}
    >
      {asking ? (
        <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 text-center" role="alertdialog" aria-label={`Let ${name} go?`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
          <img src={friend.cutout ?? friend.drawing} alt="" className="sticker h-20 w-20 object-contain opacity-80" />
          <p className="font-display text-xl font-extrabold text-ink">Say goodbye to {name}?</p>
          <p className="text-base text-ink-soft">Their stories will go too.</p>
          <div className="flex w-full flex-col gap-2">
            <Button tone="paper" size="sm" onClick={() => setAsking(false)} autoFocus disabled={going}>
              Keep {friend.name || "them"}
            </Button>
            <Button tone="red" size="sm" onClick={letGo} disabled={going}>
              {going ? "Bye bye…" : "Let go"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {linked ? (
            <Link href={`/friend?id=${encodeURIComponent(friend.id)}`} className="flex flex-col gap-2 rounded-[20px]">
              {picture}
            </Link>
          ) : (
            <div className="flex flex-col gap-2">{picture}</div>
          )}
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[18px] bg-paper-deep px-3 font-display text-lg font-bold text-ink-soft hover:bg-pink/40 hover:text-ink"
          >
            <Trash size={24} weight="bold" aria-hidden="true" />
            {letGoLabel}
          </button>
        </>
      )}
    </li>
  );
}

export function FriendsGrid({
  friends,
  onChange,
  letGoLabel = "Let go",
  linked = true,
  showEmptySlots = true,
}: {
  friends: Friend[];
  onChange: () => void;
  letGoLabel?: string;
  linked?: boolean;
  showEmptySlots?: boolean;
}) {
  const empty = Math.max(0, MAX_FRIENDS - friends.length);
  return (
    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
      {friends.map((friend, i) => (
        <FriendCard key={friend.id} friend={friend} index={i} onGone={onChange} letGoLabel={letGoLabel} linked={linked} />
      ))}
      {showEmptySlots &&
        Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`}>
            <Link
              href="/snap"
              className="flex h-full min-h-60 flex-col items-center justify-center gap-2 rounded-cut border-[3px] border-dashed border-ink-faint/50 bg-white/50 p-4 text-center font-display text-lg font-bold text-ink-soft hover:border-ink-soft hover:text-ink"
            >
              <Camera size={36} weight="duotone" aria-hidden="true" />
              Room for a new friend
            </Link>
          </li>
        ))}
    </ul>
  );
}
