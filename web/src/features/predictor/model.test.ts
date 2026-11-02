import { describe, expect, it } from "vitest";

import type { MmaMathData, PredictorData, PredictorFighter } from "../../data/types";
import { commonOpponents, headToHead, methodProbs, outcomes, winProb } from "./model";

const fighter = (id: string, x: number[], weight_class = "Lightweight"): PredictorFighter => ({
  id,
  name: id.toUpperCase(),
  weight_class,
  last_fight: "2026-01-01",
  record: { wins: 10, losses: 2, draws: 0 },
  rank: null,
  champion: null,
  image: null,
  elo: 1600,
  x,
});

const data = {
  win_model: { inputs: ["slpm", "td15"], weights: [0.5, -0.2], scale: [1, 2] },
  method_model: {
    classes: ["KO/TKO", "SUB", "DEC"],
    winner_inputs: ["slpm"],
    loser_inputs: ["td15"],
    extra_inputs: ["weight_lbs", "women"],
    mean: [0, 0, 150, 0],
    scale: [1, 1, 30, 1],
    coef: [
      [0.3, 0, 0.5, 0],
      [0, 0.2, 0, 0],
      [0, 0, -0.5, 0],
    ],
    intercept: [0, -0.5, 0.2],
  },
} as unknown as PredictorData;

const a = fighter("a", [5, 1]);
const b = fighter("b", [3, 4], "Welterweight");

describe("predictor model", () => {
  it("win probability is antisymmetric and favours the better fighter", () => {
    const p = winProb(data.win_model, a, b);
    expect(p + winProb(data.win_model, b, a)).toBeCloseTo(1);
    // 0.5 * (5 - 3) / 1 - 0.2 * (1 - 4) / 2 = 1.3 -> sigmoid(1.3)
    expect(p).toBeCloseTo(1 / (1 + Math.exp(-1.3)));
  });

  it("method probabilities sum to 1 and the six outcomes cover every result", () => {
    const m = methodProbs(data.method_model, data.win_model.inputs, a, b);
    expect(m.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    const all = outcomes(data, a, b);
    expect(all).toHaveLength(6);
    expect(all.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1);
    expect(all[0]!.p).toBeGreaterThanOrEqual(all[5]!.p);
  });
});

describe("matchup notes", () => {
  // a beat b, b beat c, a beat c, c beat a
  const mma = {
    fighters: ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase() })),
    fights: [
      [0, 1, "2020-01-01", "KO/TKO", 1, false, null, "Lightweight"],
      [1, 2, "2021-01-01", "SUB", 2, false, null, "Lightweight"],
      [0, 2, "2022-01-01", "U-DEC", 3, false, null, "Lightweight"],
    ],
  } as unknown as MmaMathData;

  it("finds earlier fights between the two", () => {
    expect(headToHead(mma, "b", "a")).toEqual([{ winnerId: "a", date: "2020-01-01", method: "KO/TKO", round: 1 }]);
  });

  it("finds common opponents with both results", () => {
    expect(commonOpponents(mma, "a", "b")).toEqual([{ name: "C", a: "W", b: "W" }]);
  });
});
