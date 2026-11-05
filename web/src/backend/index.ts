// The one place that picks the backend, so the rest of the app never knows which it is:
//   - Supabase, when the site is built with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
//     (repository variables in CI);
//   - the in-browser demo backend, with VITE_ACCOUNTS=demo (local development only);
//   - none otherwise: accounts are off and the site works as before, with no sign-in anywhere.
// Backend code is loaded only when used, and left out of builds where it can't be.

import type { Backend } from "./types";

export type * from "./types";
export { BackendError, METHODS } from "./types";

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL || undefined;
const anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY || undefined;
const demo = import.meta.env.DEV && import.meta.env.VITE_ACCOUNTS === "demo";

export const accountsEnabled = Boolean(url && anonKey) || demo;

let backend: Promise<Backend> | null = null;

/** The backend (created once, on first use), or null when accounts are off. */
export function getBackend(): Promise<Backend> | null {
  if (url && anonKey) {
    backend ??= import("./supabase").then((m) => m.supabaseBackend(url, anonKey));
  } else if (demo) {
    backend ??= import("./demo").then((m) => m.demoBackend());
  }
  return backend;
}
