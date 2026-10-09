/**
 * Runs before Next.js starts (an inline script in the root layout), so it is
 * self-contained: no imports, no helpers.
 *
 * When a page opens on a different history entry than the one it was
 * activated on (an iPhone Home Screen app restoring its last session can do
 * this), Next.js restores that entry by fetching its page data. Offline the
 * fetch fails and Next falls back to a full page load, which can then find the
 * same state again: the app restarts at the splash, over and over. Offline,
 * the entry's Next.js state is cleared first, so Next simply shows the page
 * that loaded. Online, Next's own restore works and nothing is touched.
 *
 * Returns what it saw, for the start log (boot-log.ts).
 */
export function historyGuard(win: {
  navigation?: { activation?: { entry?: { key?: string } | null } | null; currentEntry?: { key?: string } | null };
  history: { state: unknown; replaceState: (data: unknown, unused: string, url?: string) => void };
  location: { href: string };
  navigator: { onLine?: boolean };
  performance?: { getEntriesByType?: (type: string) => unknown[] };
}): { missedTraversal: boolean; how: string } {
  let how = "";
  try {
    const timing = win.performance?.getEntriesByType?.("navigation")?.[0] as { type?: string } | undefined;
    how = timing?.type ?? "";
  } catch {
    // No navigation timing: the log just leaves it blank.
  }
  const nav = win.navigation;
  const activation = nav?.activation?.entry?.key;
  const current = nav?.currentEntry?.key;
  const state = win.history.state as { __NA?: unknown } | null;
  const missedTraversal = !!activation && !!current && activation !== current && state?.__NA === true;
  if (missedTraversal && win.navigator.onLine === false) {
    try {
      win.history.replaceState(null, "", win.location.href);
    } catch {
      // Could not clear it: Next restores the entry as before.
    }
  }
  return { missedTraversal, how };
}
