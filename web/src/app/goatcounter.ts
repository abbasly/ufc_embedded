// GoatCounter: cookie-free visit counting, with a public total for the About page. Off (every
// function a no-op) unless the site is built with VITE_GOATCOUNTER set; see vite.config.ts.

const CODE: string | undefined = import.meta.env.VITE_GOATCOUNTER || undefined;

declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string }) => void };
  }
}

/** Count a page view after moving within the app (the script itself counts the first page). */
export function countPage(path: string) {
  window.goatcounter?.count?.({ path });
}

/** All-time visits to the whole site, or null if counting is off or the number can't be had.
 * Needs "Allow adding visitor counts on your website" in GoatCounter's settings. */
export async function totalVisits(): Promise<number | null> {
  if (!CODE) return null;
  try {
    const res = await fetch(`https://${CODE}.goatcounter.com/counter/TOTAL.json`);
    if (!res.ok) return null;
    const { count } = (await res.json()) as { count: string };
    const n = Number(String(count).replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
