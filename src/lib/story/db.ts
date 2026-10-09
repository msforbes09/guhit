import type { ChatTurn, PixelRect } from "@/lib/ai/types";
import type { Character, Story } from "./types";

/** A character the child made, plus everything they have said to each other. */
export interface Friend extends Character {
  chat: ChatTurn[];
  /** Where the cut-out sits in `drawing`, so recognition can read the original pixels. */
  photoCrop?: PixelRect;
  createdAt: number;
  updatedAt: number;
}

/** A device keeps at most this many friends; the child chooses who to let go. */
export const MAX_FRIENDS = 5;

const DB_NAME = "guhit";
const DB_VERSION = 1;
const FRIENDS = "friends";
const STORIES = "stories";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FRIENDS)) {
        db.createObjectStore(FRIENDS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORIES)) {
        const stories = db.createObjectStore(STORIES, { keyPath: "id" });
        stories.createIndex("characterId", "character.id");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      // Let the next call try again instead of caching a failed open forever.
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        tx.oncomplete = () => resolve(request.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

const newest = <T extends { updatedAt: number }>(items: T[]) =>
  items.sort((a, b) => b.updatedAt - a.updatedAt);

export function newId(): string {
  return crypto.randomUUID();
}

export async function listFriends(): Promise<Friend[]> {
  return newest(await run<Friend[]>(FRIENDS, "readonly", (s) => s.getAll()));
}

export function countFriends(): Promise<number> {
  return run<number>(FRIENDS, "readonly", (s) => s.count());
}

export function getFriend(id: string): Promise<Friend | undefined> {
  return run<Friend | undefined>(FRIENDS, "readonly", (s) => s.get(id));
}

export async function saveFriend(friend: Friend): Promise<Friend> {
  const saved = { ...friend, updatedAt: Date.now() };
  await run(FRIENDS, "readwrite", (s) => s.put(saved));
  return saved;
}

export class ShelfFullError extends Error {
  constructor() {
    super(`A device keeps ${MAX_FRIENDS} friends at most.`);
    this.name = "ShelfFullError";
  }
}

/** Keeps a brand-new friend, refusing rather than replacing when the shelf is full. */
export async function addFriend(friend: Friend): Promise<Friend> {
  if ((await countFriends()) >= MAX_FRIENDS) throw new ShelfFullError();
  return saveFriend(friend);
}

/** Removes the friend and every story they star in. */
export async function deleteFriend(id: string): Promise<void> {
  const stories = await listStories(id);
  await Promise.all(stories.map((story) => deleteStory(story.id)));
  await run(FRIENDS, "readwrite", (s) => s.delete(id));
}

export async function listStories(characterId?: string): Promise<Story[]> {
  const stories = await run<Story[]>(STORIES, "readonly", (s) =>
    characterId ? s.index("characterId").getAll(characterId) : s.getAll(),
  );
  return newest(stories);
}

export function getStory(id: string): Promise<Story | undefined> {
  return run<Story | undefined>(STORIES, "readonly", (s) => s.get(id));
}

export async function saveStory(story: Story): Promise<Story> {
  const saved = { ...story, updatedAt: Date.now() };
  await run(STORIES, "readwrite", (s) => s.put(saved));
  return saved;
}

export async function deleteStory(id: string): Promise<void> {
  await run(STORIES, "readwrite", (s) => s.delete(id));
}
