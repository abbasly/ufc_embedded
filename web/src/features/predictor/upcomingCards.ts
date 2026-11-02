// Upcoming fights for the predictor: future cards only, biggest fights first.

import type { PredictorData, PredictorFighter, UpcomingCard, UpcomingFight } from "../../data/types";
import { winProb } from "./model";

export interface Bout extends UpcomingFight {
  fa?: PredictorFighter;
  fb?: PredictorFighter;
  pModel: number | null; // our P(A wins), when we know both fighters
}

/** How big a name a fighter is: champions, then ranked fighters, then Elo. */
const fame = (f?: PredictorFighter) =>
  !f ? 0 : (f.champion ? 3 : 0) + (f.rank !== null ? 2 - f.rank / 16 : 0) + f.elo / 2000;

/** Cards on or after `today` (yyyy-mm-dd): the main event first, then the biggest fights. */
export function upcomingCards(data: PredictorData, today: string): (UpcomingCard & { bouts: Bout[] })[] {
  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  return (data.upcoming ?? [])
    .filter((c) => c.date >= today)
    .map((c) => ({
      ...c,
      bouts: c.fights
        .map((f) => {
          const fa = f.a ? byId.get(f.a) : undefined;
          const fb = f.b ? byId.get(f.b) : undefined;
          return { ...f, fa, fb, pModel: fa && fb ? winProb(data.win_model, fa, fb) : null };
        })
        .sort((x, y) => Number(Boolean(y.main)) - Number(Boolean(x.main)) || fame(y.fa) + fame(y.fb) - (fame(x.fa) + fame(x.fb))),
    }))
    .filter((c) => c.bouts.length > 0);
}

/** "Sat 7 Nov" for a yyyy-mm-dd date. */
export const cardDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Unordered key for a pair of fighter ids. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Short event label for the ticker: "UFC 335" or "UFC Fight Night" (the part before ":"). */
export const eventShort = (name?: string | null) => (name ? (name.split(":")[0] ?? name).trim() : null);
