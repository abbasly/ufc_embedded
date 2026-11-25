import { describe, expect, it } from "vitest";

import type { PickemBout, VisiblePick } from "../../backend";
import { hitRate, pickStyles, underdogShare } from "./risk";

let n = 0;
function bout(opts: Partial<PickemBout> = {}): PickemBout {
  return {
    id: `b${n++}`,
    eventId: "e1",
    position: 1,
    fighterA: "a",
    fighterB: "b",
    aName: "Alex Pereira",
    bName: "Bo Nickal",
    modelPA: null,
    marketPA: 0.6,
    segment: "main",
    title: false,
    outcome: "win",
    winner: "a",
    method: "KO/TKO",
    ...opts,
  };
}

describe("pick styles", () => {
  const vp = (name: string, b: PickemBout, winner: string): VisiblePick => ({ displayName: name, avatar: null, pick: { boutId: b.id, winner, method: null }, bout: b });

  it("counts underdog picks and hit rate on decided fights with odds", () => {
    const picks = [
      vp("ann", bout({ marketPA: 0.3, winner: "a" }), "a"), // underdog, right
      vp("ann", bout({ marketPA: 0.7, winner: "a" }), "a"), // favourite, right
      vp("ann", bout({ marketPA: 0.7, winner: "b" }), "a"), // favourite, wrong
      vp("ann", bout({ marketPA: 0.6, winner: "b" }), "b"), // underdog (b at 40%), right
      vp("ann", bout({ marketPA: null }), "a"), // no odds: left out
      vp("ann", bout({ outcome: "draw", winner: null }), "a"), // draw: left out
    ];
    const [ann] = pickStyles(picks, 1);
    expect(ann).toMatchObject({ picks: 4, underdogs: 2, right: 3, underdogsRight: 2 });
    expect(underdogShare(ann!)).toBe(0.5);
    expect(hitRate(ann!)).toBe(0.75);
  });

  it("leaves out players with too few picks", () => {
    expect(pickStyles([vp("bob", bout(), "a")], 2)).toEqual([]);
  });
});
