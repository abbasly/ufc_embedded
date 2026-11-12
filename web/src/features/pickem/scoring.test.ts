import { describe, expect, it } from "vitest";

import type { Pick, PickemBout } from "../../backend";
import { boutPoints, placeOf, places } from "./scoring";

describe("places on a board", () => {
  it("lets equal points share a place, and the next one skip", () => {
    expect(places([{ points: 120 }, { points: 120 }, { points: 95 }, { points: 95 }, { points: 10 }])).toEqual([1, 1, 3, 3, 5]);
    expect(places([])).toEqual([]);
  });
  it("finds one player's place", () => {
    const rows = [{ displayName: "a", points: 30 }, { displayName: "b", points: 30 }, { displayName: "c", points: 5 }];
    expect(placeOf(rows, "b")).toBe(1);
    expect(placeOf(rows, "c")).toBe(3);
    expect(placeOf(rows, "nobody")).toBeNull();
  });
});

describe("points for a pick", () => {
  const bout = (segment: string, marketPA = 0.7) =>
    ({ segment, outcome: "win", winner: "b", method: "SUB", fighterA: "a", fighterB: "b", marketPA }) as unknown as PickemBout;
  it("gives the main card its bonuses", () => {
    expect(boutPoints(bout("main"), { boutId: "x", winner: "b", method: "SUB" } as Pick)).toBe(20);
    expect(boutPoints(bout("main"), { boutId: "x", winner: "a", method: null } as Pick)).toBe(0);
  });
  it("gives a prelim 1 point for the winner and nothing more", () => {
    expect(boutPoints(bout("prelims"), { boutId: "x", winner: "b", method: "SUB" } as Pick)).toBe(1);
    expect(boutPoints(bout("early"), { boutId: "x", winner: "a", method: null } as Pick)).toBe(0);
  });
});
