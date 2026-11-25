import { describe, expect, it } from "vitest";

import type { Fighter } from "../../data/types";
import { answerFor, answerPool, closeness, dayOf, inPlay, puzzleNumber, warmth, weightHint } from "./daily";

const fighter = (id: string, rank: number | null, emb: number[]): Fighter =>
  ({ id, name: id, weight_class: "Lightweight", rank, champion: null, emb }) as unknown as Fighter;

const fighters = [
  fighter("a", 0, [0, 0]),
  fighter("b", 3, [1, 0]),
  fighter("c", 3, [3, 0]),
  fighter("d", 4, [0.5, 0]), // ranked 4th: not an answer
  fighter("e", null, [2, 0]), // unranked: not an answer
];

describe("the daily fighter", () => {
  it("is a champion or a top-3 fighter", () => {
    expect(answerPool(fighters).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("is the same for everyone on a day, and the day's rounds differ", () => {
    for (const day of ["2026-11-26", "2026-11-27", "2027-03-01"]) {
      const first = answerFor(fighters, day, 0)!;
      expect(answerFor(fighters, day, 0)!.id).toBe(first.id);
      expect(answerFor(fighters, day, 1)!.id).not.toBe(first.id);
    }
  });

  it("changes day at midnight in Berlin and counts puzzles from launch", () => {
    expect(dayOf(new Date("2026-11-26T22:59:00Z"))).toBe("2026-11-26"); // 23:59 in Berlin
    expect(dayOf(new Date("2026-11-26T23:01:00Z"))).toBe("2026-11-27"); // 00:01 in Berlin
    expect(puzzleNumber("2026-11-26")).toBe(1);
    expect(puzzleNumber("2026-12-26")).toBe(31);
  });

  it("leaves out the women's divisions", () => {
    const w = { ...fighters[0]!, id: "w", weight_class: "Women's Bantamweight" } as Fighter;
    expect(inPlay([...fighters, w]).map((f) => f.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ranks every fighter by closeness, the answer first", () => {
    const places = closeness(fighters, fighters[0]!);
    expect([...places.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id)).toEqual(["a", "d", "b", "e", "c"]);
    expect(warmth(1, 723)).toBe(1);
    expect(warmth(723, 723)).toBe(0);
    expect(warmth(10, 723)).toBeGreaterThan(warmth(100, 723));
  });

  it("ranks weight first: the answer's division before the divisions next to it", () => {
    const at = (id: string, weight_class: string, x: number) => ({ ...fighter(id, null, [x, 0]), weight_class }) as Fighter;
    const answer = at("x", "Lightweight", 0);
    const field = [answer, at("twin", "Welterweight", 0), at("far", "Lightweight", 9), at("fly", "Flyweight", 0)];
    const places = closeness(field, answer);
    expect([...places.entries()].sort((p, q) => p[1] - q[1]).map(([id]) => id)).toEqual(["x", "far", "twin", "fly"]);
    expect(weightHint(field[3]!, answer)).toBe("heavier");
    expect(weightHint(field[1]!, answer)).toBe("lighter");
    expect(weightHint(field[2]!, answer)).toBe("same");
  });
});
