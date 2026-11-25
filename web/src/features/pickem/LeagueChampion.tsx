// A league's champions: who won each of its finished cards. The standings crown the current
// champion.

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import type { LeagueChampion as Champion } from "../../backend";

export function useLeagueChampions(leagueId: string | null) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["leagues", "champions", leagueId],
    queryFn: () => backend!.leagues.champions(leagueId!),
    enabled: !!backend && !!leagueId,
    staleTime: 60_000,
  });
}

/** The people who won the league's latest finished card (more than one after a tie). */
export const reigning = (rows: Champion[]) => rows.filter((r) => r.eventId === rows[0]?.eventId);
