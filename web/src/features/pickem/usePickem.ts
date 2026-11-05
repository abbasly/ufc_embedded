// Pick'em data for the page: the current card, the signed-in user's picks and the leaderboard,
// through the backend interface (src/backend) with TanStack Query. Picks update optimistically:
// the tap shows at once, and rolls back if the database refuses it (e.g. the card just locked).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import type { Pick } from "../../backend";

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
    queryFn: () => backend!.pickem.leaderboard(20),
    enabled: !!backend,
    staleTime: 60_000,
  });
}

/** Pick a fighter, or take the pick back (winner: null). */
export function usePick(eventId: string | undefined) {
  const { backend, user } = useAuth();
  const client = useQueryClient();
  const key = ["pickem", "picks", eventId, user?.id];
  return useMutation({
    mutationFn: ({ boutId, winner }: { boutId: string; winner: string | null }) =>
      winner ? backend!.pickem.pick({ boutId, winner, method: null }) : backend!.pickem.unpick(boutId),
    onMutate: async ({ boutId, winner }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<Pick[]>(key) ?? [];
      const rest = before.filter((p) => p.boutId !== boutId);
      client.setQueryData<Pick[]>(key, winner ? [...rest, { boutId, winner, method: null }] : rest);
      return { before };
    },
    onError: (_error, _vars, context) => client.setQueryData(key, context?.before),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
