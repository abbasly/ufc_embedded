// Pure helpers for the Elo ladder.

import type { PredictorFighter } from "../../data/types";

export const ACTIVE_YEARS = 2;

/** Fighters who fought within `years` of `asOf` (ISO date). */
export function isActive(f: PredictorFighter, asOf: string, years = ACTIVE_YEARS): boolean {
  const cutoff = new Date(asOf);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return new Date(f.last_fight) >= cutoff;
}

/** Elo change over the last 12 months, or null for fighters who debuted since. */
export const yearChange = (f: PredictorFighter) => (f.elo_year_ago === null ? null : f.elo - f.elo_year_ago);

/** Biggest risers (sign 1) or fallers (sign -1) over the last year, ignoring tiny moves. */
export function movers(fighters: PredictorFighter[], sign: 1 | -1, n = 5): PredictorFighter[] {
  return fighters
    .filter((f) => (yearChange(f) ?? 0) * sign > 0)
    .sort((a, b) => (yearChange(b)! - yearChange(a)!) * sign)
    .slice(0, n);
}
