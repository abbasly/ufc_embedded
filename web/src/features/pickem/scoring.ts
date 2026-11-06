// How picks score: the same rules as public.score_event() in
// supabase/migrations/20261105000007_main_card_scoring.sql (the database is what counts; this
// is for showing the rules and each bout's points on the page). Only the main card scores.

import type { Method, Pick, PickemBout } from "../../backend";

export const POINTS = { winner: 10, method: 5, underdog: 5 };

/** The model's own Pick'em account: it picks the predictor's favourite, and its most likely
 * method, on every bout it knows both fighters of (src/ufc_embedded/pickem_model.py). */
export const MODEL_PLAYER = "the_model";

export const METHOD_LABEL: Record<Method, string> = { "KO/TKO": "KO/TKO", SUB: "Submission", DEC: "Decision" };

/** Places on a board sorted best first: equal points share a place (120, 120, 95 -> 1, 1, 3). */
export function places(rows: { points: number }[]): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => out.push(i > 0 && r.points === rows[i - 1]!.points ? out[i - 1]! : i + 1));
  return out;
}

/** A player's place on a board sorted best first, or null if they're not on it. */
export function placeOf(rows: { displayName: string; points: number }[], name: string | undefined): number | null {
  const i = rows.findIndex((r) => r.displayName === name);
  return i < 0 ? null : places(rows)[i]!;
}

/** The bookmakers' chance for ``fighter`` in the bout, if they priced it. */
export function marketChance(bout: PickemBout, fighter: string): number | null {
  if (bout.marketPA === null) return null;
  return fighter === bout.fighterA ? bout.marketPA : 1 - bout.marketPA;
}

export const isUnderdog = (bout: PickemBout, fighter: string) => (marketChance(bout, fighter) ?? 1) < 0.5;

/** Whether a bout counts for points (the main card; prelims are for fun). */
export const scores = (bout: PickemBout) => bout.segment === "main";

/** Points for one pick once the bout has a result; null before, for a draw or no contest, or
 * for a prelim. */
export function boutPoints(bout: PickemBout, pick: Pick | undefined): number | null {
  if (bout.outcome !== "win" || !pick || !scores(bout)) return null;
  if (pick.winner !== bout.winner) return 0;
  return (
    POINTS.winner +
    (pick.method && pick.method === bout.method ? POINTS.method : 0) +
    (isUnderdog(bout, pick.winner) ? POINTS.underdog : 0)
  );
}
