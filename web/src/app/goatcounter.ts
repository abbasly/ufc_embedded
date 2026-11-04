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

// Every page of the site, as GoatCounter records them (no trailing slash; see vite.config.ts).
const PAGES = ["/", "/style-map", "/predictor", "/ladder", "/mma-math", "/privacy"];

/** One page's all-time views, or 0 if GoatCounter has none (it answers 404) or can't be reached. */
async function pageVisits(path: string): Promise<number> {
  try {
    const res = await fetch(`https://${CODE}.goatcounter.com/counter/${encodeURIComponent(path)}.json`);
    if (!res.ok) return 0;
    const { count } = (await res.json()) as { count: string };
    const n = Number(String(count).replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** All-time visits to the whole site, or null if counting is off or nothing's counted yet. Adds
 * up the pages' counts: GoatCounter's own site total (TOTAL.json) lags hours behind them.
 * Needs "Allow adding visitor counts on your website" in GoatCounter's settings. */
export async function totalVisits(): Promise<number | null> {
  if (!CODE) return null;
  const counts = await Promise.all(PAGES.map(pageVisits));
  const total = counts.reduce((a, b) => a + b, 0);
  return total > 0 ? total : null;
}
