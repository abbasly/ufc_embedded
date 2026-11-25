// How each player picks: how often they back the bookmakers' underdog, and how often they're
// right. From the picks this visitor may see (RiskChart.tsx draws them). Pure.

import type { VisiblePick } from "../../backend";
import { marketChance } from "../pickem/scoring";

export interface PickStyle {
  displayName: string;
  avatar: string | null;
  picks: number; // decided fights with odds
  underdogs: number; // of those, picks on the bookmakers' underdog
  right: number;
  underdogsRight: number;
}

/** Shares, for the chart. */
export const underdogShare = (s: PickStyle) => s.underdogs / s.picks;
export const hitRate = (s: PickStyle) => s.right / s.picks;

/** Every player with at least ``minPicks`` decided picks that had odds (a handful of picks
 * says little: 2 of 2 isn't a 100% player). */
export function pickStyles(picks: VisiblePick[], minPicks = 10): PickStyle[] {
  const by = new Map<string, PickStyle>();
  for (const { displayName, avatar, pick, bout } of picks) {
    if (bout.outcome !== "win") continue; // no result, or a draw / no contest
    const chance = marketChance(bout, pick.winner);
    if (chance === null) continue; // no odds: can't say whether it was an underdog
    const s = by.get(displayName) ?? { displayName, avatar, picks: 0, underdogs: 0, right: 0, underdogsRight: 0 };
    const right = pick.winner === bout.winner;
    s.picks += 1;
    s.right += Number(right);
    if (chance < 0.5) {
      s.underdogs += 1;
      s.underdogsRight += Number(right);
    }
    by.set(displayName, s);
  }
  return [...by.values()].filter((s) => s.picks >= minPicks);
}
