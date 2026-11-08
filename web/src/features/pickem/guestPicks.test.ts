import { describe, expect, it } from "vitest";

import { applyPick } from "./guestPicks";

describe("applyPick", () => {
  const first = { boutId: "b1", winner: "a", method: null };

  it("adds a pick and replaces the one on the same bout", () => {
    expect(applyPick([], "b1", "a", null)).toEqual([first]);
    expect(applyPick([first], "b1", "c", "DEC")).toEqual([{ boutId: "b1", winner: "c", method: "DEC" }]);
  });

  it("takes a pick back without touching the others", () => {
    const other = { boutId: "b2", winner: "x", method: null };
    expect(applyPick([first, other], "b1", null, null)).toEqual([other]);
  });
});
