// Pick'em data for the page: the current card, the signed-in user's picks and the leaderboard,
// through the backend interface (src/backend) with TanStack Query. Picks update optimistically:
// the tap shows at once, and rolls back if the database refuses it (e.g. the card just locked).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import type { Method, Pick } from "../../backend";

export function useCurrentEvent() {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["pickem", "event"],
    queryFn: () => backend!.pickem.currentEvent(),
    enabled: !!backend,
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

export function useLeagues() {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["leagues", user?.id],
    queryFn: () => backend!.leagues.mine(),
    enabled: !!backend && !!user,
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
