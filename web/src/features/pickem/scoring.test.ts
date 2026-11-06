import { describe, expect, it } from "vitest";

import { placeOf, places } from "./scoring";

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
