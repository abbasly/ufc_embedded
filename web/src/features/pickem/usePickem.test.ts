import { describe, expect, it } from "vitest";

import { pickemTag } from "./usePickem";

const H = 3600e3;
const NOW = Date.parse("2026-11-15T12:00:00Z");
const event = (locksIn: number, scored = false) => ({ id: String(locksIn), name: "", startsOn: "", locksAt: new Date(NOW + locksIn * H).toISOString(), scoredAt: scored ? "x" : null });

describe("the Pick'em tab's tag", () => {
  it("says LIVE while a card is being fought", () => {
    expect(pickemTag([event(-2), event(100)], NOW)).toEqual({ text: "LIVE", live: true });
  });
  it("counts down to the next card in its last week", () => {
    expect(pickemTag([event(-48, true), event(53)], NOW)).toEqual({ text: "2D LEFT", live: false });
    expect(pickemTag([event(5.5)], NOW)).toEqual({ text: "5H LEFT", live: false });
    expect(pickemTag([event(0.2)], NOW)?.text).toBe("1H LEFT");
  });
  it("stays quiet with nothing soon", () => {
    expect(pickemTag([event(-48, true), event(24 * 9)], NOW)).toBeNull();
    expect(pickemTag([], NOW)).toBeNull();
  });
});
