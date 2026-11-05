// Pick'em data for the page: the current card, the signed-in user's picks and the leaderboard,
// through the backend interface (src/backend) with TanStack Query. Picks update optimistically:
// the tap shows at once, and rolls back if the database refuses it (e.g. the card just locked).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import type { Method, Pick } from "../../backend";

export function useEvents() {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["pickem", "events"],
    queryFn: () => backend!.pickem.events(),
    enabled: !!backend,
    staleTime: 60_000,
  });
}

export function useCard(eventId: string | undefined) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["pickem", "card", eventId],
    queryFn: () => backend!.pickem.card(eventId!),
    enabled: !!backend && !!eventId,
    staleTime: 60_000,
  });
}

/** Everyone's points on a scored event. */
export function useEventLeaderboard(eventId: string | undefined, scored: boolean) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["pickem", "event-leaderboard", eventId],
    queryFn: () => backend!.pickem.eventLeaderboard(eventId!, 100),
    enabled: !!backend && !!eventId && scored,
    staleTime: 60_000,
  });
}

export function useMyPicks(eventId: string | undefined) {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["pickem", "picks", eventId, user?.id],
    queryFn: () => backend!.pickem.myPicks(eventId!),
    enabled: !!backend && !!user && !!eventId,
  });
}

export function useLeaderboard() {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["pickem", "leaderboard"],
    queryFn: () => backend!.pickem.leaderboard(100),
    enabled: !!backend,
    staleTime: 60_000,
  });
}

export const PICK_MUTATION = ["pickem", "pick"];

/** Pick a fighter (and optionally how they win), or take the pick back (winner: null). Saved
 * straight away: there's no separate save step. */
export function usePick(eventId: string | undefined) {
  const { backend, user } = useAuth();
  const client = useQueryClient();
  const key = ["pickem", "picks", eventId, user?.id];
  return useMutation({
    mutationKey: PICK_MUTATION,
    mutationFn: ({ boutId, winner, method = null }: { boutId: string; winner: string | null; method?: Method | null }) =>
      winner ? backend!.pickem.pick({ boutId, winner, method }) : backend!.pickem.unpick(boutId),
    onMutate: async ({ boutId, winner, method = null }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<Pick[]>(key) ?? [];
      const rest = before.filter((p) => p.boutId !== boutId);
      client.setQueryData<Pick[]>(key, winner ? [...rest, { boutId, winner, method }] : rest);
      return { before };
    },
    onError: (_error, _vars, context) => client.setQueryData(key, context?.before),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

/** League-mates' picks on the event: empty until the card locks. */
export function useMatesPicks(eventId: string | undefined, locked: boolean) {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["pickem", "mates", eventId, user?.id],
    queryFn: () => backend!.pickem.matesPicks(eventId!),
    enabled: !!backend && !!user && !!eventId && locked,
  });
}

/** Which league-mates have picked each bout (not whom). */
export function useMatesWhoPicked(eventId: string | undefined, enabled: boolean) {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["pickem", "mates-who-picked", eventId, user?.id],
    queryFn: () => backend!.pickem.matesWhoPicked(eventId!),
    enabled: !!backend && !!user && !!eventId && enabled,
    staleTime: 30_000,
  });
}

/** How everyone picked (counts per fighter): empty until the card locks. */
export function usePickSplit(eventId: string | undefined, locked: boolean) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["pickem", "split", eventId],
    queryFn: () => backend!.pickem.pickSplit(eventId!),
    enabled: !!backend && !!eventId && locked,
    staleTime: 60_000,
  });
}

export function useLeagues() {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["leagues", user?.id],
    queryFn: () => backend!.leagues.mine(),
    enabled: !!backend && !!user,
  });
}

export const EVERYONE = "everyone";

/** The league open on the leaderboard (or EVERYONE). Until someone picks one, it's the one in
 * the address (?league=..., from the profile page) or their first league, so friends' faces
 * show from the start. */
export function useLeagueChoice() {
  const leagues = useLeagues();
  const [params] = useSearchParams();
  const [chosen, setChosen] = useState<string | null>(() => params.get("league"));
  const ids = leagues.data?.map((l) => l.id) ?? [];
  const selected = chosen && (chosen === EVERYONE || ids.includes(chosen)) ? chosen : (ids[0] ?? EVERYONE);
  return [selected, setChosen] as const;
}

/** The display names of a league's members (empty for EVERYONE). */
export function useLeagueMembers(leagueId: string) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["leagues", "members", leagueId],
    queryFn: () => backend!.leagues.members(leagueId),
    enabled: !!backend && leagueId !== EVERYONE,
    staleTime: 60_000,
  });
}

export function useStandings(leagueId: string | null) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["leagues", "standings", leagueId],
    queryFn: () => backend!.leagues.standings(leagueId!),
    enabled: !!backend && !!leagueId,
  });
}

/** Create, join and leave leagues; each refreshes the list of leagues. */
export function useLeagueActions() {
  const { backend } = useAuth();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["leagues"] });
  return {
    create: useMutation({ mutationFn: (name: string) => backend!.leagues.create(name), onSuccess: refresh }),
    join: useMutation({ mutationFn: (code: string) => backend!.leagues.join(code), onSuccess: refresh }),
    leave: useMutation({ mutationFn: (id: string) => backend!.leagues.leave(id), onSuccess: refresh }),
  };
}
