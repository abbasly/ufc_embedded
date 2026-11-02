import { describe, expect, it } from "vitest";

import type { FightRow } from "../../data/types";
import { ordinal } from "../style-map/model";
import { fighterOptions, notablePool, shortestChain, toFight, winsByFighter } from "./graph";

// 0 beat 1, 1 beat 2, 2 beat 0 (a loop), 2 beat 3; 3 never beat anyone.
const rows: FightRow[] = [
  [0, 1, "2020-01-01", "KO/TKO", 1, false, -200, "Lightweight"],
  [1, 2, "2021-01-01", "SUB", 2, false, 150, "Lightweight"],
  [2, 0, "2022-01-01", "U-DEC", 3, true, -110, "Lightweight"],
  [2, 3, "2023-01-01", "U-DEC", 3, false, null, "Lightweight"],
];
const adj = winsByFighter(rows.map(toFight));
const path = (from: number, to: number) =>
  shortestChain(adj, from, to)?.map((f) => [f.winner, f.loser]) ?? null;

describe("shortestChain", () => {
  it("finds a direct win", () => {
    expect(path(0, 1)).toEqual([[0, 1]]);
  });

  it("goes around the loop so the loser 'beats' the winner", () => {
    expect(path(1, 0)).toEqual([
      [1, 2],
      [2, 0],
    ]);
  });

  it("returns null when no chain exists", () => {
    expect(path(3, 0)).toBeNull();
  });
});

describe("ordinal", () => {
  it("uses the right English suffix", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 92, 100].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "92nd", "100th",
    ]);
  });
});

describe("fighterOptions", () => {
  it("puts champions first, then fighters with more UFC fights", () => {
    const fighters = [
      { name: "Aaron", champion: null }, // 1 fight
      { name: "Busy", champion: null }, // 3 fights
      { name: "Champ", champion: "Lightweight" }, // 2 fights
      { name: "Dave", champion: null }, // 2 fights
    ];
    const pairs: [number, number][] = [[1, 0], [1, 2], [2, 3], [3, 1]]; // [winner, loser]
    const fights = pairs.map(([w, l], k) =>
      toFight([w, l, "2020-01-01", "U-DEC", 3, false, null, "Lightweight"], k),
    );
    expect(fighterOptions(fighters, fights).map((o) => o.label)).toEqual(["Champ", "Busy", "Dave", "Aaron"]);
  });
});

describe("notablePool", () => {
  it("includes ranked fighters, champions and the busiest veterans, once each", () => {
    const fighters = [
      { rank: null, champion: null }, // 0: unranked, 3 fights
      { rank: 7, champion: null }, // 1: ranked, 1 fight
      { rank: null, champion: "Flyweight" }, // 2: champion
      { rank: null, champion: null }, // 3: unranked, 1 fight
    ];
    const pairs: [number, number][] = [[0, 1], [0, 3], [0, 2]];
    const fights = pairs.map(([w, l], k) => toFight([w, l, "2020-01-01", "SUB", 1, false, null, "Flyweight"], k));
    expect(notablePool(fighters, fights, 1).sort()).toEqual([0, 1, 2]);
  });
});
