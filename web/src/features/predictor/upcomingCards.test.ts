import { describe, expect, it } from "vitest";

import type { PredictorData, PredictorFighter } from "../../data/types";
import { eventShort, pairKey, upcomingCards } from "./upcomingCards";

const fighter = (id: string, elo: number, rank: number | null = null, champion: string | null = null): PredictorFighter =>
  ({ id, name: id, weight_class: "Lightweight", last_fight: "2026-01-01", record: { wins: 1, losses: 0, draws: 0 },
     rank, champion, image: null, elo, elo_year_ago: null, elo_peak: elo, x: [0] }) as PredictorFighter; // prettier-ignore

const data = {
  win_model: { inputs: ["slpm"], weights: [1], scale: [1] },
  fighters: [fighter("a", 1500), fighter("b", 1500), fighter("champ", 1900, null, "Lightweight"), fighter("no1", 1800, 1)],
  upcoming: [
    { date: "2026-10-31", fights: [{ a: "a", b: "b", a_name: "A", b_name: "B", p_market: 0.5 }] },
    {
      date: "2026-11-07",
      fights: [
        { a: "a", b: "b", a_name: "A", b_name: "B", p_market: 0.5 },
        { a: "champ", b: "no1", a_name: "Champ", b_name: "No1", p_market: 0.6 },
        { a: "a", b: null, a_name: "A", b_name: "Debutant", p_market: null },
        { a: "b", b: "a", a_name: "B", b_name: "A", p_market: 0.5, main: true },
      ],
    },
  ],
} as unknown as PredictorData;

describe("upcoming cards", () => {
  it("drops past cards, puts the main event first and then the biggest fights", () => {
    const cards = upcomingCards(data, "2026-11-02");
    expect(cards.map((c) => c.date)).toEqual(["2026-11-07"]);
    expect(cards[0]!.bouts.map((b) => b.a_name).slice(0, 2)).toEqual(["B", "Champ"]);
  });

  it("shortens event names for the ticker", () => {
    expect(eventShort("UFC 335: Oliveira vs. Lopes")).toBe("UFC 335");
    expect(eventShort("UFC Fight Night: Cortes-Acosta vs. Walker")).toBe("UFC Fight Night");
    expect(eventShort(null)).toBeNull();
  });

  it("has a model probability only when both fighters are known", () => {
    const bouts = upcomingCards(data, "2026-11-02")[0]!.bouts;
    expect(bouts.find((b) => b.b_name === "Debutant")!.pModel).toBeNull();
    expect(bouts.find((b) => b.a_name === "A" && b.b_name === "B")!.pModel).toBeCloseTo(0.5);
  });

  it("keys pairs the same way round in either order", () => {
    expect(pairKey("x", "y")).toBe(pairKey("y", "x"));
  });
});
