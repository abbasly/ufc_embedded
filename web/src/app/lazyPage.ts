// Lazily loaded code that survives a new deploy. Each deploy renames the code files and
// removes the old ones, so a tab opened before it fails to load a page it hasn't visited yet
// (tapping the nav "does nothing" until a refresh). On such a failure, reload once to pick
// up the new version.

import { type ComponentType, lazy } from "react";

const KEY = "reloaded-for-new-code";
const MIN_GAP_MS = 30_000; // never auto-reload more often than this, so a real outage can't loop

/** Reload the page to get the latest code, unless that was just tried. */
export function reloadForNewCode(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < MIN_GAP_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** React.lazy that reloads the page if the code can't be loaded (an older deploy's tab). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((error: unknown) => {
      if (reloadForNewCode()) return new Promise<{ default: T }>(() => {}); // the page is reloading
      throw error;
    }),
  );
}
