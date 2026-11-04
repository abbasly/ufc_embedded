// GoatCounter: cookie-free visit counting for the GoatCounter dashboard. Off (a no-op) unless
// the site is built with VITE_GOATCOUNTER set; see vite.config.ts.

declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string }) => void };
  }
}

/** Count a page view after moving within the app (the script itself counts the first page). */
export function countPage(path: string) {
  window.goatcounter?.count?.({ path });
}
