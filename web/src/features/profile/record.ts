// What a player's record says about them: best call, method record, streaks, badges, head to
// head and points over time. Pure functions over their pick history and scores (only the main
// card scores, so only main-card picks count here).

import type { EventScore, Method, PastPick } from "../../backend";
import { boutPoints, marketChance } from "../pickem/scoring";

/** Main-card picks on decided bouts (not draws or no contests), in fight order: oldest card
 * first, and on each card from the first fight to the main event. */
export function decided(history: PastPick[]): PastPick[] {
  return history
    .filter((p) => p.bout.segment === "main" && p.bout.outcome === "win")
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || b.bout.position - a.bout.position);
}

export const isRight = (p: PastPick) => p.pick.winner === p.bout.winner;
export const pointsOf = (p: PastPick) => boutPoints(p.bout, p.pick) ?? 0;
const chanceOf = (p: PastPick) => marketChance(p.bout, p.pick.winner);
const surnameOf = (p: PastPick, id: string) => (id === p.bout.fighterA ? p.bout.aName : p.bout.bName).split(" ").at(-1)!;

export interface BestCall {
  pick: PastPick;
  fighter: string; // the winner they called
  chance: number; // the bookies' chance for them
  points: number;
}

/** Their boldest right call: the winner the bookies rated lowest. */
export function bestCall(history: PastPick[]): BestCall | null {
  const right = decided(history).filter((p) => isRight(p) && chanceOf(p) !== null);
  if (!right.length) return null;
  const best = right.reduce((a, b) => (chanceOf(b)! < chanceOf(a)! ? b : a));
  return { pick: best, fighter: surnameOf(best, best.pick.winner), chance: chanceOf(best)!, points: pointsOf(best) };
}

/** For each method they called: how often that call was right (right winner and method). */
export function methodRecord(history: PastPick[]): { method: Method; right: number; total: number }[] {
  const called = decided(history).filter((p) => p.pick.method);
  return (["KO/TKO", "SUB", "DEC"] as Method[]).map((method) => {
    const mine = called.filter((p) => p.pick.method === method);
    return { method, right: mine.filter((p) => isRight(p) && p.bout.method === method).length, total: mine.length };
  });
}

/** Longest run of right picks in a row, and the run they're on now. */
export function streaks(history: PastPick[]): { longest: number; current: number } {
  let longest = 0;
  let current = 0;
  for (const p of decided(history)) {
    current = isRight(p) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return { longest, current };
}

/** Cards on which every main-card fight was picked, and picked right. */
export function perfectCards(history: PastPick[]): string[] {
  const byCard = new Map<string, PastPick[]>();
  for (const p of decided(history)) byCard.set(p.bout.eventId, [...(byCard.get(p.bout.eventId) ?? []), p]);
  return [...byCard.values()].filter((ps) => ps.length >= 3 && ps.every(isRight)).map((ps) => ps[0]!.eventName);
}

export interface HeadToHead {
  wins: number; // cards where you scored more
  losses: number;
  draws: number;
  mine: number; // points on the cards you both played
  theirs: number;
}

/** You against someone (a friend, the model) on the cards you both played. */
export function headToHead(mine: EventScore[], theirs: EventScore[]): HeadToHead {
  const other = new Map(theirs.map((s) => [s.eventId, s.points]));
  const both = mine.filter((s) => other.has(s.eventId));
  return {
    wins: both.filter((s) => s.points > other.get(s.eventId)!).length,
    losses: both.filter((s) => s.points < other.get(s.eventId)!).length,
    draws: both.filter((s) => s.points === other.get(s.eventId)!).length,
    mine: both.reduce((n, s) => n + s.points, 0),
    theirs: both.reduce((n, s) => n + other.get(s.eventId)!, 0),
  };
}

/** Running total of points, card by card, oldest first. */
export function pointsOverTime(scores: EventScore[]): { name: string; startsOn: string; points: number; total: number }[] {
  let total = 0;
  return [...scores]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map((s) => ({ name: s.name, startsOn: s.startsOn, points: s.points, total: (total += s.points) }));
}

export interface Badge {
  key: string;
  name: string;
  how: string; // what earns it
  earned: boolean;
  progress: string; // e.g. "3/5", or what they did
  fraction: number; // how far along, 0 to 1
}

/** A badge you earn by doing something ``goal`` times. */
function counted(key: string, name: string, how: string, count: number, goal: number): Badge {
  return { key, name, how, earned: count >= goal, progress: `${Math.min(count, goal)}/${goal}`, fraction: Math.min(count / goal, 1) };
}

/** The badges, earned or not (with progress, so the locked ones say what's left). */
export function badges(history: PastPick[], vsModel: HeadToHead | null): Badge[] {
  const right = decided(history).filter(isRight);
  const called = (method: Method) => right.filter((p) => p.pick.method === method && p.bout.method === method).length;
  const { longest } = streaks(history);
  const perfect = perfectCards(history);
  return [
    {
      key: "perfect",
      name: "Perfect card",
      how: "Every main-card fight of a card, right",
      earned: perfect.length > 0,
      progress: perfect.length ? `${perfect.length}× · ${perfect[0]}` : "not yet",
      fraction: perfect.length ? 1 : 0,
    },
    counted("headliner", "Headliner", "3 main events called right", right.filter((p) => p.bout.position === 1).length, 3),
    counted("underdog", "Underdog hunter", "5 underdogs called right", right.filter((p) => (chanceOf(p) ?? 1) < 0.5).length, 5),
    { ...counted("streak", "Hot streak", "8 right in a row", longest, 8), progress: `best run ${longest}` },
    {
      key: "model",
      name: "Beat the model",
      how: "More points than the model on a card",
      earned: !!vsModel && vsModel.wins > 0,
      progress: vsModel ? `${vsModel.wins} ${vsModel.wins === 1 ? "card" : "cards"}` : "–",
      fraction: vsModel && vsModel.wins > 0 ? 1 : 0,
    },
    counted("ko", "KO artist", "3 knockouts called right, winner and method", called("KO/TKO"), 3),
    counted("sub", "Tap-out expert", "2 submissions called right, winner and method", called("SUB"), 2),
    counted("judge", "Judge's eye", "5 decisions called right, winner and method", called("DEC"), 5),
  ];
}
