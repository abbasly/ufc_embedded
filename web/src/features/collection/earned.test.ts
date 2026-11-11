import { describe, expect, it } from "vitest";

import type { PastPick } from "../../backend";
import { byShinyThenElo, cardKey, earnedCards, unopened } from "./earned";

let n = 0;
function called(fighter: string, opts: { market?: number | null; right?: boolean; day?: string; segment?: "main" | "prelims" } = {}): PastPick {
  const id = `b${n++}`;
  const day = opts.day ?? "2026-10-01";
  const other = `not-${fighter}`;
  return {
    pick: { boutId: id, winner: fighter, method: null },
    bout: {
      id,
      eventId: day,
      position: 1,
      fighterA: fighter,
      fighterB: other,
      aName: fighter.toUpperCase(),
      bName: "Other",
      modelPA: null,
      marketPA: opts.market === undefined ? 0.7 : opts.market,
      segment: opts.segment ?? "main",
      title: false,
      outcome: "win",
      winner: opts.right === false ? other : fighter,
      method: "DEC",
    },
    eventName: `Card ${day}`,
    startsOn: day,
  };
}

describe("byShinyThenElo", () => {
  it("puts shiny cards first, then the higher rating, with unrated fighters last", () => {
    const cards = earnedCards([called("low"), called("high"), called("debut"), called("dog", { market: 0.3 })]);
    const elo = (id: string) => ({ low: 1500, high: 1900, dog: 1400 })[id];
    expect(byShinyThenElo(cards, elo).map((c) => c.fighter)).toEqual(["dog", "high", "low", "debut"]);
  });
});

describe("earnedCards", () => {
  it("earns a card for a right main-card call only", () => {
    const cards = earnedCards([called("a"), called("b", { right: false }), called("c", { segment: "prelims" })]);
    expect(cards.map((c) => c.fighter)).toEqual(["a"]);
    expect(cards[0]!.shiny).toBe(false);
  });

  it("makes an underdog call shiny and lists shiny cards first", () => {
    const cards = earnedCards([called("fav", { day: "2026-10-09" }), called("dog", { market: 0.3, day: "2026-10-01" })]);
    expect(cards.map((c) => [c.fighter, c.shiny])).toEqual([["dog", true], ["fav", false]]);
  });

  it("doesn't treat a fight without odds as an underdog call", () => {
    expect(earnedCards([called("a", { market: null })])[0]!.shiny).toBe(false);
  });

  it("counts repeat calls and keeps the boldest one on a shiny card", () => {
    const [card] = earnedCards([
      called("a", { market: 0.4, day: "2026-10-01" }),
      called("a", { market: 0.25, day: "2026-10-08" }),
      called("a", { market: 0.8, day: "2026-10-15" }),
    ]);
    expect(card).toMatchObject({ times: 3, shiny: true, chance: 0.25, eventName: "Card 2026-10-08" });
  });

  it("offers a shiny upgrade as something new to open", () => {
    const plain = earnedCards([called("a")]);
    const opened = new Set(plain.map(cardKey));
    expect(unopened(plain, opened)).toEqual([]);
    expect(unopened(earnedCards([called("a"), called("a", { market: 0.3 })]), opened)).toHaveLength(1);
  });
});
