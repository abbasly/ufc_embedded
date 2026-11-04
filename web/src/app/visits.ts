// The site's recent visits (the Worker sets how many days), for the About page. Counted by
// Cloudflare Web Analytics; read through our own small Worker (worker/visits.js), which holds the
// API token so it never reaches the browser. Off unless the site is built with VITE_VISITS_URL set.

const URL_: string | undefined = import.meta.env.VITE_VISITS_URL || undefined;

export interface RecentVisits {
  visits: number;
  days: number;
}

/** Visits in the last ``days`` days, or null if the count is off, empty or unavailable. */
export async function recentVisits(): Promise<RecentVisits | null> {
  if (!URL_) return null;
  try {
    const res = await fetch(URL_);
    if (!res.ok) return null;
    const { visits, days } = (await res.json()) as Partial<RecentVisits>;
    return typeof visits === "number" && visits > 0 && typeof days === "number" ? { visits, days } : null;
  } catch {
    return null;
  }
}
