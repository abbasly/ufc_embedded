// The starter badges: quick ones for getting going, earned by playing rather than by results.
// With an account they come from the database (public.starter_badges). Before signing up they're
// worked out from the picks in this browser, so a visitor's very first tap can earn one. What's
// been announced is kept in this browser (so signing up doesn't announce the same badges twice)
// and, once signed in, with the account too (seen.ts).

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import type { Pick } from "../../backend";
import type { Badge } from "./record";

export const STARTERS = [
  { key: "first-pick", name: "First pick", how: "Pick a fighter on any card" },
  { key: "called-method", name: "Called the finish", how: "Say how your fighter will win" },
  { key: "full-card", name: "Full card", how: "Pick every main-card fight on a card" },
  { key: "signed-up", name: "Made it official", how: "Create your account" },
  { key: "in-league", name: "Squad up", how: "Start or join a league" },
];

/** A card needs this many main-card fights for "Full card" to mean something. */
export const FULL_CARD_MIN = 3;

export function starterBadges(earned: readonly string[]): Badge[] {
  return STARTERS.map(({ key, name, how }) => {
    const done = earned.includes(key);
    return { key, name, how, earned: done, progress: done ? "Done" : "To do", fraction: done ? 1 : 0 };
  });
}

/** What a visitor's picks on the card in front of them have earned. */
export function guestStarters(picks: Pick[], mainBoutIds: string[]): string[] {
  const picked = new Set(picks.map((p) => p.boutId));
  return [
    ...(picks.length ? ["first-pick"] : []),
    ...(picks.some((p) => p.method) ? ["called-method"] : []),
    ...(mainBoutIds.length >= FULL_CARD_MIN && mainBoutIds.every((id) => picked.has(id)) ? ["full-card"] : []),
  ];
}

export function useStarterBadges(userId: string | undefined) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["pickem", "starter", userId],
    queryFn: () => backend!.pickem.starterBadges(userId!),
    enabled: !!backend && !!userId,
    staleTime: 60_000,
  });
}

const ANNOUNCED = "starter-badges-announced";

export function readAnnounced(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ANNOUNCED) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function writeAnnounced(keys: Set<string>) {
  try {
    localStorage.setItem(ANNOUNCED, JSON.stringify([...keys]));
  } catch {
    // private window: it may be announced again next time
  }
}
