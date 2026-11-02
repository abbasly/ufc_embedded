import { describe, expect, it } from "vitest";

import { canFight, defaultOpponent } from "./matchup";

describe("matchups", () => {
  it("allows the same division and one either side", () => {
    expect(canFight("Lightweight", "Lightweight")).toBe(true);
    expect(canFight("Lightweight", "Welterweight")).toBe(true);
    expect(canFight("Featherweight", "Lightweight")).toBe(true);
    expect(canFight("Lightweight", "Middleweight")).toBe(false);
    expect(canFight("Flyweight", "Heavyweight")).toBe(false);
  });

  it("never pairs men with women", () => {
    expect(canFight("Flyweight", "Women's Flyweight")).toBe(false);
    expect(canFight("Women's Strawweight", "Women's Flyweight")).toBe(true);
    expect(canFight("Women's Bantamweight", "Bantamweight")).toBe(false);
  });

  it("keeps fighters without a known division apart from everyone else", () => {
    expect(canFight("Catch Weight", "Women's Flyweight")).toBe(false);
    expect(canFight("Lightweight", "Catch Weight")).toBe(false);
    expect(canFight("Catch Weight", "Catch Weight")).toBe(true);
  });

  it("picks an opponent from the same division first", () => {
    const pool = [
      { id: "hw", weight_class: "Heavyweight" },
      { id: "ww", weight_class: "Welterweight" },
      { id: "lw", weight_class: "Lightweight" },
      { id: "lw2", weight_class: "Lightweight" },
    ];
    expect(defaultOpponent(pool[2]!, pool)?.id).toBe("lw2");
    expect(defaultOpponent({ id: "x", weight_class: "Middleweight" }, pool)?.id).toBe("ww");
    expect(defaultOpponent({ id: "x", weight_class: "Women's Flyweight" }, pool)).toBeUndefined();
  });
});
