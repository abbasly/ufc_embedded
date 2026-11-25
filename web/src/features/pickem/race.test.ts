import { describe, expect, it } from "vitest";

import type { RaceScore } from "../../backend";
import { race } from "./race";

const s = (displayName: string, eventId: string, startsOn: string, points: number, correct = points / 10): RaceScore => ({
  eventId,
  eventName: eventId.toUpperCase(),
  startsOn,
  displayName,
  avatar: null,
  points,
  correct,
});

describe("the race over cards", () => {
  const scores = [
    s("ann", "e1", "2026-10-01", 50),
    s("bob", "e1", "2026-10-01", 30),
    s("cat", "e1", "2026-10-01", 40),
    s("bob", "e2", "2026-10-08", 60),
    s("ann", "e2", "2026-10-08", 10),
    s("cat", "e2", "2026-10-08", 20),
  ];

  it("ranks everyone by total after each card, oldest card first", () => {
    const r = race(scores);
    expect(r.cards.map((c) => c.eventId)).toEqual(["e1", "e2"]);
    const bob = r.lines.find((l) => l.displayName === "bob")!;
    expect(bob.steps.map((x) => [x.total, x.gained, x.position])).toEqual([
      [30, 30, 3],
      [90, 60, 1],
    ]);
    // The lines come leader first.
    expect(r.lines.map((l) => l.displayName)).toEqual(["bob", "ann", "cat"]); // ann and cat: 60 pts, 6 right each; the name decides
  });

  it("shares places on equal totals but keeps the lines apart", () => {
    const r = race([s("ann", "e1", "2026-10-01", 40, 4), s("bob", "e1", "2026-10-01", 40, 3), s("cat", "e1", "2026-10-01", 10)]);
    const step = (n: string) => r.lines.find((l) => l.displayName === n)!.steps[0]!;
    expect([step("ann").place, step("bob").place, step("cat").place]).toEqual([1, 1, 3]);
    expect([step("ann").position, step("bob").position]).toEqual([1, 2]); // more right picks first
    expect([step("ann").tied, step("bob").tied, step("cat").tied]).toEqual([true, true, false]);
  });

  it("keeps a board's players, even on cards they skipped", () => {
    const r = race(scores, { players: ["ann", "cat", "dan"] });
    expect(r.players).toBe(3);
    expect(r.lines.map((l) => l.displayName)).toEqual(["ann", "cat", "dan"]);
    const dan = r.lines.find((l) => l.displayName === "dan")!;
    expect(dan.steps.map((x) => [x.total, x.position])).toEqual([
      [0, 3],
      [0, 3],
    ]);
  });

  it("draws the top few, plus anyone asked for below them", () => {
    const r = race(scores, { top: 1, always: ["ann", "nobody"] });
    expect(r.lines.map((l) => l.displayName)).toEqual(["bob", "ann"]);
  });
});
