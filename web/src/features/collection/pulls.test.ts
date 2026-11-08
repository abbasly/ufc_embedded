import { describe, expect, it } from "vitest";

import type { OwnedCard, Rarity } from "../../backend";
import { byRarityThenElo, RARITIES, revealOrder } from "./pulls";

const owned = (fighterId: string, rarity: Rarity): OwnedCard => ({ fighterId, name: fighterId, rarity, copies: 1 });

describe("packs", () => {
  it("has odds that add up to 100%", () => {
    expect(RARITIES.reduce((n, r) => n + parseFloat(r.odds), 0)).toBeCloseTo(100);
  });

  it("turns the best card over last", () => {
    const cards = [
      { slot: 1, fighterId: "a", name: "a", rarity: "legendary" as const },
      { slot: 2, fighterId: "b", name: "b", rarity: "common" as const },
      { slot: 3, fighterId: "c", name: "c", rarity: "rare" as const },
    ];
    expect(revealOrder(cards).map((c) => c.rarity)).toEqual(["common", "rare", "legendary"]);
  });

  it("sorts a collection by rarity, then rating, with unrated fighters last", () => {
    const cards = [owned("low", "rare"), owned("champ", "legendary"), owned("gone", "rare"), owned("high", "rare")];
    const elo = (id: string) => ({ low: 1500, high: 1900, champ: 1400 })[id];
    expect(byRarityThenElo(cards, elo).map((c) => c.fighterId)).toEqual(["champ", "high", "low", "gone"]);
  });
});
