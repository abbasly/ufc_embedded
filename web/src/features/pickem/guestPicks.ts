// Picks made before signing up: kept in this browser, so a visitor can play the whole card first.
// Once they have an account they move to it (claimGuestPicks), and the database takes over.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import type { Backend, Method, Pick } from "../../backend";

const KEY = "pickem-guest-picks";

/** Event id -> the picks made on it. */
export type GuestPicks = Record<string, Pick[]>;

export function readGuestPicks(): GuestPicks {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as GuestPicks;
  } catch {
    return {};
  }
}

function writeGuestPicks(all: GuestPicks) {
  try {
    if (Object.keys(all).length) localStorage.setItem(KEY, JSON.stringify(all));
    else localStorage.removeItem(KEY);
  } catch {
    // private window: the picks last until the page closes
  }
}

/** The list after picking a fighter, or taking the pick back (winner: null). */
export function applyPick(picks: Pick[], boutId: string, winner: string | null, method: Method | null): Pick[] {
  const rest = picks.filter((p) => p.boutId !== boutId);
  return winner ? [...rest, { boutId, winner, method }] : rest;
}

/** A visitor's picks on one card, and how to change them. */
export function useGuestPicks(eventId: string | undefined) {
  const [all, setAll] = useState(readGuestPicks);
  const picks = (eventId && all[eventId]) || [];
  const pick = (boutId: string, winner: string | null, method: Method | null) => {
    if (!eventId) return;
    const next = applyPick(picks, boutId, winner, method);
    const { [eventId]: _old, ...others } = all;
    const updated = next.length ? { ...others, [eventId]: next } : others;
    setAll(updated);
    writeGuestPicks(updated);
  };
  return { picks, pick };
}

/** Moves the browser's picks to the account. Picks the account already made win, and cards that
 * have locked are dropped; a pick that fails to save stays here for the next visit. */
export async function claimGuestPicks(backend: Backend): Promise<void> {
  const left: GuestPicks = {};
  for (const [eventId, picks] of Object.entries(readGuestPicks())) {
    try {
      const card = await backend.pickem.card(eventId);
      if (!card || Date.parse(card.event.locksAt) <= Date.now()) continue;
      const taken = new Set((await backend.pickem.myPicks(eventId)).map((p) => p.boutId));
      const bouts = new Set(card.bouts.map((b) => b.id));
      const todo = picks.filter((p) => bouts.has(p.boutId) && !taken.has(p.boutId));
      const saved = await Promise.allSettled(todo.map((p) => backend.pickem.pick(p)));
      const failed = todo.filter((_, i) => saved[i]!.status === "rejected");
      if (failed.length) left[eventId] = failed;
    } catch {
      left[eventId] = picks;
    }
  }
  writeGuestPicks(left);
}

/** Claims the picks as soon as there's an account to put them on (a display name comes first). */
export function useClaimGuestPicks() {
  const { backend, user, profile } = useAuth();
  const client = useQueryClient();
  const busy = useRef(false);
  useEffect(() => {
    if (!backend || !user || !profile || busy.current || !Object.keys(readGuestPicks()).length) return;
    busy.current = true;
    void claimGuestPicks(backend).finally(() => {
      busy.current = false;
      void client.invalidateQueries({ queryKey: ["pickem", "picks"] });
      void client.invalidateQueries({ queryKey: ["pickem", "starter"] });
    });
  }, [backend, user, profile, client]);
}
