import { describe, expect, it } from "vitest";

import type { PastPick, PickemBout } from "../../backend";
import { cardDuel, historyDuel, marketPick, modelPick } from "./market";

let n = 0;
function bout(opts: Partial<PickemBout> & { winner?: string | null }): PickemBout {
  return {
    id: `b${n++}`,
    eventId: "e1",
    position: 1,
    fighterA: "a",
    fighterB: "b",
    aName: "Alex Pereira",
    bName: "Bo Nickal",
    modelPA: 0.6,
    marketPA: 0.6,
    segment: "main",
    title: false,
    outcome: "win",
    method: "DEC",
    ...opts,
    winner: opts.winner === undefined ? "a" : opts.winner,
  };
}

const past = (b: PickemBout, winner: string, event = "e1", day = "2026-10-01"): PastPick => ({
  pick: { boutId: b.id, winner, method: null },
  bout: { ...b, eventId: event },
  eventName: event,
  startsOn: day,
});

describe("model vs market", () => {
  it("picks the favourite of each", () => {
    expect(marketPick(bout({ marketPA: 0.4 }))).toBe("b");
    expect(marketPick(bout({ marketPA: null }))).toBeNull();
    expect(modelPick(bout({ modelPA: 0.3, marketPA: 0.7 }))).toBe("b");
    // Without its own chance the model plays the bookmakers' favourite, as its account does.
    expect(modelPick(bout({ modelPA: null, marketPA: 0.7 }))).toBe("a");
  });

  it("counts right winners on decided fights both called", () => {
    const d = cardDuel([
      bout({ modelPA: 0.6, marketPA: 0.6, winner: "a" }), // both right
      bout({ modelPA: 0.6, marketPA: 0.4, winner: "a" }), // they disagree, the model is right
      bout({ modelPA: 0.6, marketPA: 0.4, winner: "b" }), // they disagree, the market is right
      bout({ outcome: null, winner: null }), // not fought yet
      bout({ outcome: "draw", winner: null }), // a draw counts for neither
      bout({ marketPA: null }), // no odds: no market pick
    ]);
    expect(d).toEqual({ fights: 3, model: 2, market: 2, disagreed: 2 });
  });

  it("uses the model's actual picks, card by card, newest first", () => {
    const { total, cards } = historyDuel([
      past(bout({ marketPA: 0.7, winner: "b" }), "b", "old", "2026-09-01"), // model right, market wrong
      past(bout({ marketPA: 0.7, winner: "a" }), "a", "new", "2026-10-01"), // both right
    ]);
    expect(total).toEqual({ fights: 2, model: 2, market: 1, disagreed: 1 });
    expect(cards.map((c) => [c.eventId, c.model, c.market])).toEqual([["new", 1, 1], ["old", 1, 0]]);
  });
});
