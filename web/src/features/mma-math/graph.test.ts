import { describe, expect, it } from "vitest";

import type { FightRow } from "../../data/types";
import { ordinal } from "../style-map/model";
import { shortestChain, toFight, winsByFighter } from "./graph";

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
