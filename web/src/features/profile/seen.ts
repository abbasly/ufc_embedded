// What the signed-in player has already been shown (opened cards, announced badges), kept with
// their account so a new browser or cleared site data doesn't show it all again. Items look like
// 'card:<fighter>', 'card:<fighter>:shiny' or 'badge:<key>'.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAuth } from "../../auth/AuthProvider";

export function useSeen() {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["seen", user?.id],
    queryFn: () => backend!.seen.list(),
    enabled: !!backend && !!user,
    staleTime: Infinity,
    retry: 1,
  });
}

/** The items under a prefix, without it: ``withPrefix(items, "badge:")`` -> ['first-pick', ...]. */
export const withPrefix = (items: string[] | undefined, prefix: string) =>
  (items ?? []).filter((i) => i.startsWith(prefix)).map((i) => i.slice(prefix.length));

/** Marks items seen: at once on the page, and saved in the background. */
export function useMarkSeen() {
  const { backend, user } = useAuth();
  const client = useQueryClient();
  return useCallback(
    (items: string[]) => {
      if (!backend || !user || !items.length) return;
      client.setQueryData<string[]>(["seen", user.id], (old = []) => [...new Set([...old, ...items])]);
      // Not saved (offline, say): this browser still remembers, and it's tried again next time.
      void backend.seen.add(items).catch(() => {});
    },
    [backend, user, client],
  );
}
