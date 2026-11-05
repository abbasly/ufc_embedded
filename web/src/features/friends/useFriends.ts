// Friends data for the pages: your friends and open requests, the friends leaderboard, and the
// actions (ask, accept, remove), each refreshing what depends on friendships.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";

export function useFriends() {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["friends", user?.id],
    queryFn: () => backend!.friends.list(),
    enabled: !!backend && !!user,
    staleTime: 30_000,
  });
}

export function useFriendsStandings(enabled: boolean) {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["friends", "standings", user?.id],
    queryFn: () => backend!.friends.standings(),
    enabled: !!backend && !!user && enabled,
  });
}

/** Ask, accept and remove. Friendships change who you see on the board and on the fights. */
export function useFriendActions() {
  const { backend } = useAuth();
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["friends"] }),
      client.invalidateQueries({ queryKey: ["pickem", "mates"] }),
      client.invalidateQueries({ queryKey: ["pickem", "mates-who-picked"] }),
    ]);
  return {
    request: useMutation({ mutationFn: (id: string) => backend!.friends.request(id), onSuccess: refresh }),
    accept: useMutation({ mutationFn: (id: string) => backend!.friends.accept(id), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => backend!.friends.remove(id), onSuccess: refresh }),
  };
}
