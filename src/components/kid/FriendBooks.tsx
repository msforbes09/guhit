"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listStories } from "@/lib/story/db";
import type { Story } from "@/lib/story/types";
import { BookOpen } from "./icons";

const COVERS = ["bg-sun", "bg-pink", "bg-sky", "bg-grass"];

/** The storybooks this friend stars in, newest first. */
export function FriendBooks({ friendId }: { friendId: string }) {
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    let alive = true;
    listStories(friendId)
      .then((all) => alive && setStories(all.filter((s) => s.title && s.pages.length > 0)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [friendId]);

  if (stories.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 font-display text-xl font-extrabold text-ink">Our books</h2>
      <ul className="flex flex-col gap-2">
        {stories.slice(0, 4).map((story, i) => (
          <li key={story.id}>
            <Link
              href={`/book?id=${encodeURIComponent(story.id)}`}
              className={`crayon-edge press flex min-h-14 items-center gap-3 rounded-[18px] px-4 py-2 font-display text-lg font-bold text-ink ${COVERS[i % COVERS.length]}`}
            >
              <BookOpen size={26} weight="fill" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{story.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
