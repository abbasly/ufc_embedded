// The card collection: call a winner on the main card and you earn that fighter's trading card;
// call them as the bookies' underdog and it's shiny. Worked out from a player's pick history, so
// there's nothing extra to store. Only which cards you've already opened is kept, in this browser.

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import type { PastPick } from "../../backend";
import { isUnderdog, marketChance } from "../pickem/scoring";
import { decided, isRight } from "../profile/record";

export interface EarnedCard {
  fighter: string; // id
  name: string;
  shiny: boolean;
  times: number; // how often you've called them right
  chance: number | null; // the bookies' chance on the call that earned it (shiny: the boldest)
  eventName: string; // the card that call was on
  startsOn: string;
}

/** Everything a pick history has earned: shiny first, then the newest. */
export function earnedCards(history: PastPick[]): EarnedCard[] {
  const cards = new Map<string, EarnedCard>();
  for (const p of decided(history).filter(isRight)) {
    const id = p.pick.winner;
    const underdog = isUnderdog(p.bout, id);
    const chance = marketChance(p.bout, id);
    const old = cards.get(id);
    const name = id === p.bout.fighterA ? p.bout.aName : p.bout.bName;
    // A shiny call stays the card's story until a bolder one comes along.
    const replaces = !old || (underdog && (!old.shiny || (chance ?? 1) < (old.chance ?? 1))) || (!underdog && !old.shiny);
    cards.set(id, {
      fighter: id,
      name,
      shiny: !!old?.shiny || underdog,
      times: (old?.times ?? 0) + 1,
      chance: replaces ? chance : old.chance,
      eventName: replaces ? p.eventName : old.eventName,
      startsOn: replaces ? p.startsOn : old.startsOn,
    });
  }
  return [...cards.values()].sort(
    (a, b) => Number(b.shiny) - Number(a.shiny) || b.startsOn.localeCompare(a.startsOn) || a.name.localeCompare(b.name),
  );
}

/** A plain card and its shiny upgrade count as two things to open. */
export const cardKey = (c: Pick<EarnedCard, "fighter" | "shiny">) => `${c.fighter}${c.shiny ? ":shiny" : ""}`;

const seenKey = (userId: string) => `cards-opened-${userId}`;

export function readOpened(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey(userId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function writeOpened(userId: string, opened: Set<string>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...opened]));
  } catch {
    // private window: the cards are simply there to open again next time
  }
}

export const unopened = (cards: EarnedCard[], opened: Set<string>) => cards.filter((c) => !opened.has(cardKey(c)));

/** The signed-in player's pick history. */
export function useMyHistory() {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["pickem", "history", user?.id],
    queryFn: () => backend!.pickem.pickHistory(user!.id),
    enabled: !!backend && !!user,
  });
}
