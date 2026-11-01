// Pure graph helpers for MMA math: who beat whom, and shortest "proof" chains.

import type { FightRow } from "../../data/types";

export interface Fight {
  index: number;
  winner: number;
  loser: number;
  date: string;
  method: string;
  round: number | null;
  title: boolean;
  winnerOdds: number | null;
  weightClass: string;
}

export function toFight(row: FightRow, index: number): Fight {
  const [winner, loser, date, method, round, title, winnerOdds, weightClass] = row;
  return { index, winner, loser, date, method, round, title, winnerOdds, weightClass };
}

/** Winner -> fights they won, keeping only the latest win over each opponent. */
export function winsByFighter(fights: Fight[]): Map<number, Fight[]> {
  const latest = new Map<string, Fight>();
  for (const f of fights) latest.set(`${f.winner}>${f.loser}`, f); // fights are oldest first
  const adj = new Map<number, Fight[]>();
  for (const f of latest.values()) adj.set(f.winner, [...(adj.get(f.winner) ?? []), f]);
  return adj;
}

/** Shortest chain of wins from `from` to `to` (BFS), or null if MMA math can't get there. */
export function shortestChain(adj: Map<number, Fight[]>, from: number, to: number): Fight[] | null {
  if (from === to) return null;
  const via = new Map<number, Fight>([[from, undefined as unknown as Fight]]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift()!;
    for (const fight of adj.get(current) ?? []) {
      if (via.has(fight.loser)) continue;
      via.set(fight.loser, fight);
      if (fight.loser === to) {
        const chain: Fight[] = [];
        for (let f = fight; f; f = via.get(f.winner)!) {
          chain.unshift(f);
          if (f.winner === from) break;
        }
        return chain;
      }
      queue.push(fight.loser);
    }
  }
  return null;
}

/** American odds > 0 means the winner was the betting underdog. */
export const isUpset = (f: Fight) => f.winnerOdds !== null && f.winnerOdds > 0;
