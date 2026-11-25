// The race between players over the finished cards: after each card, everyone on a board is
// ranked by their total points so far. Pure functions, drawn by RaceChart.tsx.

import type { RaceScore } from "../../backend";
import { places } from "./scoring";

export interface RaceCard {
  eventId: string;
  eventName: string;
  startsOn: string;
}

export interface RaceStep {
  total: number; // points after this card
  gained: number; // points on this card
  place: number; // as the leaderboard shows it: equal totals share a place
  tied: boolean; // someone on the board has the same total
  position: number; // 1, 2, 3... with ties broken (by right picks, then name): the line's height
}

export interface RaceLine {
  displayName: string;
  avatar: string | null;
  steps: RaceStep[]; // one per card, in order
}

export interface Race {
  cards: RaceCard[];
  lines: RaceLine[]; // the top ``top`` at the last card, then anyone in ``always`` below them
  players: number; // how many players the board ranks
}

/** The race on a board: ``players`` (display names) restricts it to a league or friends;
 * without it, everyone with a score. Players without a score on a card still count, with what
 * they had (so a league member who skipped a card drops back). */
export function race(scores: RaceScore[], opts: { players?: string[]; top?: number; always?: string[] } = {}): Race {
  const top = opts.top ?? 5;
  const board = opts.players ? new Set(opts.players) : null;
  const mine = board ? scores.filter((s) => board.has(s.displayName)) : scores;

  const cardsById = new Map<string, RaceCard>();
  for (const s of mine) cardsById.set(s.eventId, { eventId: s.eventId, eventName: s.eventName, startsOn: s.startsOn });
  const cards = [...cardsById.values()].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.eventId.localeCompare(b.eventId));

  const avatar = new Map<string, string | null>();
  for (const s of mine) avatar.set(s.displayName, s.avatar);
  const names = [...new Set([...(opts.players ?? []), ...mine.map((s) => s.displayName)])];
  const byKey = new Map(mine.map((s) => [`${s.displayName}\u0000${s.eventId}`, s]));

  const total = new Map(names.map((n) => [n, 0]));
  const correct = new Map(names.map((n) => [n, 0]));
  const steps = new Map<string, RaceStep[]>(names.map((n) => [n, []]));
  for (const card of cards) {
    const gained = new Map<string, number>();
    for (const n of names) {
      const s = byKey.get(`${n}\u0000${card.eventId}`);
      gained.set(n, s?.points ?? 0);
      total.set(n, total.get(n)! + (s?.points ?? 0));
      correct.set(n, correct.get(n)! + (s?.correct ?? 0));
    }
    const order = [...names].sort((a, b) => total.get(b)! - total.get(a)! || correct.get(b)! - correct.get(a)! || a.localeCompare(b));
    const shared = places(order.map((n) => ({ points: total.get(n)! })));
    const count = new Map<number, number>();
    shared.forEach((pl) => count.set(pl, (count.get(pl) ?? 0) + 1));
    order.forEach((n, i) =>
      steps.get(n)!.push({ total: total.get(n)!, gained: gained.get(n)!, place: shared[i]!, tied: count.get(shared[i]!)! > 1, position: i + 1 }),
    );
  }

  const last = (n: string) => steps.get(n)!.at(-1)?.position ?? Infinity;
  const leaders = names.filter((n) => last(n) <= top);
  const extra = (opts.always ?? []).filter((n) => names.includes(n) && !leaders.includes(n));
  const lines = [...leaders, ...extra]
    .sort((a, b) => last(a) - last(b))
    .map((n) => ({ displayName: n, avatar: avatar.get(n) ?? null, steps: steps.get(n)! }));
  return { cards, lines, players: names.length };
}
