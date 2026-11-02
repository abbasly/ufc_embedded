// The exported models, evaluated in the browser, plus fun facts about a matchup.

import type { MmaMathData, PredictorData, PredictorFighter } from "../../data/types";

type WinModel = PredictorData["win_model"];
type MethodModel = PredictorData["method_model"];

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Per-input contribution to the log-odds that A beats B (positive favours A). */
export function contributions(model: WinModel, a: PredictorFighter, b: PredictorFighter): number[] {
  return model.inputs.map((_, i) => (model.weights[i]! * (a.x[i]! - b.x[i]!)) / model.scale[i]!);
}

/** P(A beats B). Antisymmetric by construction: winProb(a, b) + winProb(b, a) = 1. */
export function winProb(model: WinModel, a: PredictorFighter, b: PredictorFighter): number {
  return sigmoid(contributions(model, a, b).reduce((s, c) => s + c, 0));
}

const WEIGHT_LBS: Record<string, number> = {
  "Women's Strawweight": 115,
  Flyweight: 125,
  "Women's Flyweight": 125,
  Bantamweight: 135,
  "Women's Bantamweight": 135,
  Featherweight: 145,
  "Women's Featherweight": 145,
  Lightweight: 155,
  Welterweight: 170,
  Middleweight: 185,
  "Light Heavyweight": 205,
  Heavyweight: 240,
};
const CATCH_WEIGHT_LBS = 160;

export const weightLbs = (wc: string) => WEIGHT_LBS[wc] ?? CATCH_WEIGHT_LBS;

/** P(KO/TKO), P(SUB), P(DEC) given that `winner` beats `loser`, at the heavier fighter's weight. */
export function methodProbs(
  model: MethodModel,
  inputs: string[],
  winner: PredictorFighter,
  loser: PredictorFighter,
): number[] {
  const feat = (f: PredictorFighter, name: string) => f.x[inputs.indexOf(name)] ?? 0;
  const lbs = Math.max(weightLbs(winner.weight_class), weightLbs(loser.weight_class));
  const women = winner.weight_class.startsWith("Women") && loser.weight_class.startsWith("Women") ? 1 : 0;
  const raw = [
    ...model.winner_inputs.map((n) => feat(winner, n)),
    ...model.loser_inputs.map((n) => feat(loser, n)),
    lbs,
    women,
  ];
  const z = raw.map((v, i) => (v - model.mean[i]!) / model.scale[i]!);
  const logits = model.coef.map((row, k) => row.reduce((s, w, i) => s + w * z[i]!, model.intercept[k]!));
  const top = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - top));
  const total = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / total);
}

export interface Outcome {
  winner: PredictorFighter;
  method: string;
  p: number;
}

/** All six outcomes (each fighter x KO/TKO, SUB, DEC), most likely first. */
export function outcomes(data: PredictorData, a: PredictorFighter, b: PredictorFighter): Outcome[] {
  const pA = winProb(data.win_model, a, b);
  const inputs = data.win_model.inputs;
  const mA = methodProbs(data.method_model, inputs, a, b);
  const mB = methodProbs(data.method_model, inputs, b, a);
  return data.method_model.classes
    .flatMap((method, k) => [
      { winner: a, method, p: pA * mA[k]! },
      { winner: b, method, p: (1 - pA) * mB[k]! },
    ])
    .sort((x, y) => y.p - x.p);
}

// ---- Matchup notes --------------------------------------------------------------------

export interface PastFight {
  winnerId: string;
  date: string;
  method: string;
  round: number | null;
}

/** Their previous fights against each other (decisive ones), oldest first. */
export function headToHead(mma: MmaMathData, aId: string, bId: string): PastFight[] {
  const ids = mma.fighters.map((f) => f.id);
  const a = ids.indexOf(aId);
  const b = ids.indexOf(bId);
  if (a < 0 || b < 0) return [];
  return mma.fights
    .filter(([w, l]) => (w === a && l === b) || (w === b && l === a))
    .map(([w, , date, method, round]) => ({ winnerId: ids[w]!, date, method, round }));
}

/** Opponents both have faced, with each fighter's result against them. */
export function commonOpponents(
  mma: MmaMathData,
  aId: string,
  bId: string,
): { name: string; a: "W" | "L"; b: "W" | "L" }[] {
  const ids = mma.fighters.map((f) => f.id);
  const results = (idx: number) => {
    const out = new Map<number, "W" | "L">();
    for (const [w, l] of mma.fights) {
      if (w === idx) out.set(l, "W");
      if (l === idx) out.set(w, "L");
    }
    return out;
  };
  const a = ids.indexOf(aId);
  const b = ids.indexOf(bId);
  if (a < 0 || b < 0) return [];
  const ra = results(a);
  const rb = results(b);
  return [...ra.keys()]
    .filter((o) => rb.has(o) && o !== a && o !== b)
    .map((o) => ({ name: mma.fighters[o]!.name, a: ra.get(o)!, b: rb.get(o)! }));
}
