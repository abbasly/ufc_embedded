// The daily fighter: a hidden fighter, the same for everyone, two a day. Every guess is ranked by
// how close it is: by weight class first, then in the style embedding (the similarity Fighter
// Lab's "most similar" uses). #1 is the fighter, and so on down the whole map. Pure.

import { embDistance } from "../../data/styleMap";
import type { Fighter } from "../../data/types";

export const ROUNDS = 2;
const LAUNCH = "2026-11-26"; // puzzle #1
const TOP = 3; // answers: champions and the top 3 of every division

/** Today in Berlin (yyyy-mm-dd): a new day's fighters at midnight there. */
export function dayOf(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The puzzle number of a day, #1 on launch day. */
export function puzzleNumber(day: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${LAUNCH}T12:00:00Z`)) / 86400e3) + 1;
}

/** The fighters in the game: the men's divisions for now. The style map knows how people fight,
 * not their size or sex, so a women's bantamweight's closest styles were heavyweights. */
export const inPlay = (fighters: Fighter[]): Fighter[] => fighters.filter((f) => !f.weight_class.startsWith("Women"));

/** Who can be the answer: champions and every division's top 3 (people know them), in a
 * fixed order. */
export function answerPool(fighters: Fighter[]): Fighter[] {
  return fighters.filter((f) => f.rank !== null && f.rank <= TOP).sort((a, b) => a.id.localeCompare(b.id));
}

/** 32-bit FNV-1a: a stable number from a string. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The answer of a day's round (0 or 1): the same for everyone, never the same fighter twice in
 * one day. */
export function answerFor(fighters: Fighter[], day: string, round: number): Fighter | null {
  const pool = answerPool(fighters);
  if (!pool.length) return null;
  const pick = (r: number) => hash(`${day}#${r}`) % pool.length;
  let i = pick(round);
  if (round > 0 && pool.length > 1) {
    const earlier = new Set(Array.from({ length: round }, (_, r) => pick(r)));
    while (earlier.has(i)) i = (i + 1) % pool.length;
  }
  return pool[i]!;
}

/** The men's divisions, lightest first. */
const DIVISIONS = ["Flyweight", "Bantamweight", "Featherweight", "Lightweight", "Welterweight", "Middleweight", "Light Heavyweight", "Heavyweight"];
const divisionOf = (f: Fighter) => DIVISIONS.indexOf(f.weight_class);

/** How many divisions apart two fighters are (unknown divisions: as far as it gets). */
export function divisionGap(a: Fighter, b: Fighter): number {
  const i = divisionOf(a);
  const j = divisionOf(b);
  return i < 0 || j < 0 ? DIVISIONS.length : Math.abs(i - j);
}

/** Is the answer heavier than a guess, lighter, or in the same division? */
export function weightHint(guess: Fighter, answer: Fighter): "heavier" | "lighter" | "same" {
  const d = divisionOf(answer) - divisionOf(guess);
  return d > 0 ? "heavier" : d < 0 ? "lighter" : "same";
}

/** Every fighter's place by closeness to the answer: the answer is #1, then their division by
 * style, then the divisions next to theirs by style, and so on. Weight first, so finding the
 * division gets you close; style decides within it. */
export function closeness(fighters: Fighter[], answer: Fighter): Map<string, number> {
  const order = fighters
    .map((f) => ({ id: f.id, gap: divisionGap(f, answer), d: f.id === answer.id ? -1 : embDistance(f.emb, answer.emb) }))
    .sort((a, b) => a.gap - b.gap || a.d - b.d || a.id.localeCompare(b.id));
  return new Map(order.map((o, i) => [o.id, i + 1]));
}

/** How warm a place is, for the bar under a guess: 1 at #1, falling off fast at first (the top
 * hundred matter most), 0 at the far end of the map. */
export function warmth(place: number, total: number): number {
  if (total <= 1) return 1;
  return Math.max(0, 1 - Math.log(place) / Math.log(total));
}

/** A player's round, as kept in the browser. */
export interface RoundState {
  answer: string; // the answer's id when the round was started (a data refresh can't change it)
  guesses: string[]; // ids, oldest first
  hints: ("division" | "style")[];
  gaveUp: boolean;
}

export const solved = (s: RoundState) => s.guesses.includes(s.answer);
export const over = (s: RoundState) => solved(s) || s.gaveUp;
