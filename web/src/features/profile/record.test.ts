import { describe, expect, it } from "vitest";

import type { EventScore, Method, PastPick } from "../../backend";
import { badges, bestCall, decided, headToHead, methodRecord, perfectCards, pointsOverTime, streaks } from "./record";

let n = 0;
/** A main-card pick on a fought bout: a beat b (by `method`), the bookies gave a `market`. */
function pick(opts: { event?: string; day?: string; position?: number; market?: number; won: boolean; called?: Method | null; method?: Method }): PastPick {
  const id = `b${n++}`;
  const method = opts.method ?? "KO/TKO";
  return {
    pick: { boutId: id, winner: opts.won ? "a" : "b", method: opts.called === undefined ? method : opts.called },
    bout: {
      id,
      eventId: opts.event ?? "e1",
      position: opts.position ?? 1,
      fighterA: "a",
      fighterB: "b",
      aName: "Alex Pereira",
      bName: "Bo Nickal",
      modelPA: null,
      marketPA: opts.market ?? 0.6,
      segment: "main",
      title: false,
      outcome: "win",
      winner: "a",
      method,
    },
    eventName: opts.event ?? "e1",
    startsOn: opts.day ?? "2026-10-01",
  };
}

describe("player insights", () => {
  it("orders fights oldest card first, first fight to main event", () => {
    const main = pick({ won: true, position: 1, day: "2026-10-02" });
    const opener = pick({ won: true, position: 5, day: "2026-10-02" });
    const older = pick({ won: true, day: "2026-10-01" });
    expect(decided([main, opener, older])).toEqual([older, opener, main]);
  });

  it("finds the boldest right call, ignoring wrong ones", () => {
    const call = bestCall([pick({ won: true, market: 0.3 }), pick({ won: true, market: 0.45 }), pick({ won: false, market: 0.1 })]);
    expect(call?.fighter).toBe("Pereira");
    expect(call?.chance).toBeCloseTo(0.3);
    expect(call?.points).toBe(10 + 5 + 5); // winner, method, underdog
    expect(bestCall([])).toBeNull();
  });

  it("counts a method call right only with the right winner", () => {
    const record = methodRecord([pick({ won: true, called: "SUB", method: "SUB" }), pick({ won: false, called: "SUB", method: "SUB" }), pick({ won: true, called: null })]);
    expect(record.find((r) => r.method === "SUB")).toEqual({ method: "SUB", right: 1, total: 2 });
  });

  it("tracks streaks and perfect cards", () => {
    const picks = [pick({ won: true, event: "c1" }), pick({ won: true, event: "c1" }), pick({ won: true, event: "c1" }), pick({ won: false, event: "c2", day: "2026-10-09" }), pick({ won: true, event: "c2", day: "2026-10-09" })];
    expect(streaks(picks)).toEqual({ longest: 3, current: 1 });
    expect(perfectCards(picks)).toEqual(["c1"]);
  });

  it("compares two players card by card", () => {
    const s = (eventId: string, points: number): EventScore => ({ eventId, name: eventId, startsOn: "2026-10-01", points, correct: 0, picked: 0 });
    expect(headToHead([s("a", 30), s("b", 10), s("c", 20)], [s("a", 20), s("b", 15)])).toEqual({ wins: 1, losses: 1, draws: 0, mine: 40, theirs: 35 });
  });

  it("adds points up over time", () => {
    const s = (startsOn: string, points: number): EventScore => ({ eventId: startsOn, name: startsOn, startsOn, points, correct: 0, picked: 0 });
    expect(pointsOverTime([s("2026-10-08", 20), s("2026-10-01", 30)]).map((p) => p.total)).toEqual([30, 50]);
  });

  it("awards badges with progress for the rest", () => {
    const picks = Array.from({ length: 6 }, () => pick({ won: true, market: 0.4 }));
    const earned = Object.fromEntries(badges(picks, { wins: 0, losses: 1, draws: 0, mine: 0, theirs: 0 }).map((b) => [b.key, b.earned]));
    expect(earned).toEqual({ perfect: true, underdog: true, streak: false, model: false });
  });
});
