// Our model against the betting market, on the fights both called: the market's pick is the
// bookmakers' favourite (their median, margin-free chance, stored with each bout). Winners
// only, every fight of a card (prelims too), since the odds say nothing about the method.

import type { PastPick, PickemBout } from "../../backend";

export interface Duel {
  fights: number; // decided fights both picked
  model: number; // right winners
  market: number;
  disagreed: number; // fights they picked differently on
}

export interface CardDuel extends Duel {
  eventId: string;
  eventName: string;
  startsOn: string;
}

interface Call {
  bout: PickemBout;
  model: string | null; // the fighter each picked
  market: string | null;
}

const favourite = (b: PickemBout, pA: number) => (pA >= 0.5 ? b.fighterA : b.fighterB);

/** The bookmakers' favourite, or null without odds. */
export const marketPick = (b: PickemBout) => (b.marketPA === null ? null : favourite(b, b.marketPA));

/** The model's pick from its own chance; without one (a UFC newcomer) the model's account
 * takes the bookmakers' favourite (src/ufc_embedded/pickem_model.py), so this does too. */
export const modelPick = (b: PickemBout) => (b.modelPA === null ? marketPick(b) : favourite(b, b.modelPA));

function tally(calls: Call[]): Duel {
  const counted = calls.filter((c) => c.bout.outcome === "win" && c.model && c.market);
  return {
    fights: counted.length,
    model: counted.filter((c) => c.model === c.bout.winner).length,
    market: counted.filter((c) => c.market === c.bout.winner).length,
    disagreed: counted.filter((c) => c.model !== c.market).length,
  };
}

/** One card: the model's chances (as on the card) against the market's. */
export function cardDuel(bouts: PickemBout[]): Duel {
  return tally(bouts.map((bout) => ({ bout, model: modelPick(bout), market: marketPick(bout) })));
}

/** The model's account's actual picks against the market, overall and card by card (most
 * recent card first). */
export function historyDuel(history: PastPick[]): { total: Duel; cards: CardDuel[] } {
  const calls = history.map((p) => ({ bout: p.bout, model: p.pick.winner, market: marketPick(p.bout) }));
  const byCard = new Map<string, { name: string; startsOn: string; calls: Call[] }>();
  history.forEach((p, i) => {
    const card = byCard.get(p.bout.eventId) ?? { name: p.eventName, startsOn: p.startsOn, calls: [] };
    card.calls.push(calls[i]!);
    byCard.set(p.bout.eventId, card);
  });
  const cards = [...byCard.entries()]
    .map(([eventId, c]) => ({ eventId, eventName: c.name, startsOn: c.startsOn, ...tally(c.calls) }))
    .filter((c) => c.fights > 0)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  return { total: tally(calls), cards };
}
