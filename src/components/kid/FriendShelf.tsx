"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { listFriends, type Friend } from "@/lib/story/db";
import { ArrowRight } from "./icons";

const TILTS = [-2.5, 1.8, -1.2, 2.4, -1.8, 1.2];
const PAPERS = ["#e9f4fd", "#fff1c9", "#fde4ee", "#e5f4e3", "#efe6fb", "#ffe6d3"];

export function FriendTile({ friend, index }: { friend: Friend; index: number }) {
  return (
    <Link
      href={`/friend?id=${encodeURIComponent(friend.id)}`}
      className="crayon-edge press group flex w-40 shrink-0 snap-start flex-col items-center gap-2 rounded-cut bg-white p-3 pb-3.5 sm:w-44"
      style={{ "--tilt": `${TILTS[index % TILTS.length]}deg` } as CSSProperties}
    >
      <span
        className="grid aspect-square w-full place-items-center overflow-hidden rounded-[20px_24px_22px_26px] p-3"
        style={{ background: PAPERS[index % PAPERS.length] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
        <img
          src={friend.cutout ?? friend.drawing}
          alt=""
          className="sticker max-h-full max-w-full object-contain transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-2"
        />
      </span>
      <span className="w-full truncate text-center font-display text-xl font-extrabold text-ink">
        {friend.name || "New friend"}
      </span>
    </Link>
  );
}

/** Newest friends on the home screen, straight from this device's storage. */
export function FriendShelf() {
  const [friends, setFriends] = useState<Friend[] | null>(null);

  useEffect(() => {
    let alive = true;
    listFriends()
      .then((all) => alive && setFriends(all))
      .catch(() => alive && setFriends([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section aria-labelledby="shelf-title" className="mt-10 sm:mt-14">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id="shelf-title" className="font-display text-3xl font-extrabold text-ink sm:text-4xl">
          My friends
        </h2>
        {friends && friends.length > 0 && (
          <Link
            href="/friends"
            className="inline-flex min-h-14 items-center gap-2 rounded-full px-4 font-display text-xl font-bold text-sky-deep underline decoration-[3px] underline-offset-4 hover:text-ink"
          >
            See all
            <ArrowRight size={22} weight="bold" aria-hidden="true" />
          </Link>
        )}
      </div>

      {friends === null ? (
        <div className="flex gap-5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 w-40 animate-pulse rounded-cut bg-paper-deep sm:w-44" />
          ))}
        </div>
      ) : friends.length === 0 ? (
        <EmptyShelf />
      ) : (
        <ul className="scrollbar-paper -mx-4 flex snap-x gap-5 overflow-x-auto px-4 pt-2 pb-6 sm:-mx-6 sm:px-6">
          {friends.slice(0, 8).map((friend, i) => (
            <li key={friend.id}>
              <FriendTile friend={friend} index={i} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyShelf() {
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-cut-lg border-[3px] border-dashed border-paper-edge bg-paper-deep/50 p-5 sm:p-6">
      <div className="flex gap-3" aria-hidden="true">
        {[-3, 2, -1].map((tilt, i) => (
          <span
            key={i}
            className="block h-24 w-20 rounded-[16px_20px_18px_22px] border-[3px] border-dashed border-ink-faint/60 bg-white/70"
            style={{ transform: `rotate(${tilt}deg)` }}
          />
        ))}
      </div>
      <p className="max-w-sm text-xl font-bold text-ink-soft">
        Your friends will live here. Bring your first drawing to life!
      </p>
    </div>
  );
}
