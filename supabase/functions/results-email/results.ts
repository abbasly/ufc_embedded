// How a player did on a scored card, and the email that tells them. Pure: no database, so it
// can be checked on its own. Scoring rules as in public.score_event (main card only: 10 for the
// winner, +5 method, +5 underdog).

import { escape, layout, SITE } from "../_shared/layout.ts";

export interface Bout {
  id: string;
  position: number;
  segment: string;
  fighter_a: string;
  fighter_b: string;
  a_name: string;
  b_name: string;
  market_p_a: number | null;
  outcome: string | null;
  winner: string | null;
  method: string | null;
}

export interface Pick {
  bout_id: string;
  winner: string;
  method: string | null;
}

export interface CardResult {
  name: string;
  points: number;
  correct: number;
  picked: number;
  rank: number;
  players: number;
  model: number | null; // the model's points on this card, if it played
  lines: { fight: string; call: string; right: boolean | null; actual: string | null; points: number | null }[];
  best: { fighter: string; chance: number; points: number } | null;
}

const METHOD: Record<string, string> = { "KO/TKO": "KO/TKO", SUB: "Submission", DEC: "Decision" };
const surname = (name: string) => name.split(" ").at(-1)!;

/** The bookies' chance for the fighter picked. */
const chance = (b: Bout, fighter: string) => (b.market_p_a === null ? null : fighter === b.fighter_a ? b.market_p_a : 1 - b.market_p_a);

/** Points for one pick (decided bouts only; null otherwise). A prelim is 1, no bonuses. */
export function pickPoints(b: Bout, p: Pick): number | null {
  if (b.outcome !== "win") return null;
  if (p.winner !== b.winner) return 0;
  if (b.segment !== "main") return 1;
  return 10 + (p.method && p.method === b.method ? 5 : 0) + ((chance(b, p.winner) ?? 1) < 0.5 ? 5 : 0);
}

/** One player's card: their picks with ✓/✗ (main card, running order), their best call. */
export function cardLines(bouts: Bout[], picks: Pick[]): { lines: CardResult["lines"]; best: CardResult["best"] } {
  const byBout = new Map(picks.map((p) => [p.bout_id, p]));
  const name = (b: Bout, id: string | null) => (id === b.fighter_a ? b.a_name : b.b_name);
  const main = bouts.filter((b) => b.segment === "main").sort((a, b) => a.position - b.position);
  const lines = main
    .filter((b) => byBout.has(b.id))
    .map((b) => {
      const p = byBout.get(b.id)!;
      const right = b.outcome === "win" ? p.winner === b.winner : null;
      return {
        fight: `${b.a_name} vs ${b.b_name}`,
        call: `${surname(name(b, p.winner))}${p.method ? ` by ${METHOD[p.method] ?? p.method}` : ""}`,
        right,
        actual: right === false && b.winner ? surname(name(b, b.winner)) : b.outcome === "draw" ? "draw" : b.outcome === "nc" ? "no contest" : null,
        points: pickPoints(b, p),
      };
    });
  let best: CardResult["best"] = null;
  for (const b of main) {
    const p = byBout.get(b.id);
    const c = p ? chance(b, p.winner) : null;
    if (!p || c === null || b.outcome !== "win" || p.winner !== b.winner) continue;
    if (!best || c < best.chance) best = { fighter: surname(name(b, p.winner)), chance: c, points: pickPoints(b, p) ?? 0 };
  }
  return { lines, best };
}

/** The email for one player. */
export function resultsEmail(r: CardResult, eventId: string): { subject: string; html: string; text: string } {
  const card = escape(r.name.split(":")[0]!);
  const results = `${SITE}/pickem?event=${encodeURIComponent(eventId)}`;
  const vsModel =
    r.model === null
      ? ""
      : r.points > r.model
        ? `You <b>beat the model</b> (${r.points} to ${r.model}).`
        : r.points === r.model
          ? `Dead level with the model (${r.points} each).`
          : `The model got this one (${r.model} to ${r.points}).`;
  const rows = r.lines
    .map(
      (l) => `<tr>
        <td style="padding:6px 0;border-top:1px solid #eee;font-size:14px;">
          <span style="font-weight:800;color:${l.right === null ? "#8a8b90" : l.right ? "#2f9e44" : "#e03131"};">${l.right === null ? "–" : l.right ? "✓" : "✗"}</span>
          ${escape(l.call)}${l.actual ? ` <span style="color:#8a8b90;">(${l.right === false ? "it was " : ""}${escape(l.actual)})</span>` : ""}
          <div style="font-size:12px;color:#8a8b90;">${escape(l.fight)}</div>
        </td>
        <td align="right" style="padding:6px 0;border-top:1px solid #eee;font-size:14px;font-weight:700;color:${l.points ? "#2f9e44" : "#8a8b90"};">${l.points === null ? "" : l.points ? `+${l.points}` : "0"}</td>
      </tr>`,
    )
    .join("");
  const body = `
    <p style="margin:0 0 12px;"><b>${r.correct} of ${r.picked}</b> right, <b>#${r.rank}</b> of ${r.players} ${r.players === 1 ? "player" : "players"}.
    ${r.best ? `Best call: <b>${escape(r.best.fighter)}</b> at ${Math.round(r.best.chance * 100)}% with the bookies (+${r.best.points}).` : ""}
    ${vsModel}</p>
    ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` : ""}`;
  const html = layout({
    preheader: `${r.points} points on ${card}: #${r.rank} of ${r.players}.`,
    heading: `You scored ${r.points} points on ${card}`,
    body,
    button: { label: "See the full results", href: results },
    small: `Your badges and season so far are on <a href="${SITE}/me" style="color:#6b6c72;">your profile</a>. Don't want these emails? Turn them off there.`,
  });
  const text = [
    `You scored ${r.points} points on ${r.name.split(":")[0]}: ${r.correct} of ${r.picked} right, #${r.rank} of ${r.players}.`,
    r.best ? `Best call: ${r.best.fighter} at ${Math.round(r.best.chance * 100)}% (+${r.best.points}).` : "",
    vsModel.replace(/<\/?b>/g, ""),
    "",
    ...r.lines.map((l) => `${l.right === null ? "-" : l.right ? "✓" : "✗"} ${l.call}${l.actual ? ` (${l.right === false ? "it was " : ""}${l.actual})` : ""}${l.points ? ` +${l.points}` : ""}`),
    "",
    `Full results: ${results}`,
    `Your profile (and to turn these emails off): ${SITE}/me`,
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
  return { subject: `${r.points} points on ${r.name.split(":")[0]}: #${r.rank} of ${r.players}`, html, text };
}
