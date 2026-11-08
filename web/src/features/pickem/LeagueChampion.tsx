// The reigning champion above a league's standings: who won its latest finished card, and who
// has the most titles. The champion can share it.

import { Group, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import { PlayerAvatar } from "../../auth/PlayerAvatar";
import type { League, LeagueChampion as Champion } from "../../backend";
import { usePredictor } from "../../data/client";
import { championImage } from "../share/championImage";
import { ShareButton } from "../share/ShareButton";

export function useLeagueChampions(leagueId: string | null) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["leagues", "champions", leagueId],
    queryFn: () => backend!.leagues.champions(leagueId!),
    enabled: !!backend && !!leagueId,
    staleTime: 60_000,
  });
}

/** Titles per player, most first; a shared title counts for each. */
export function titleCounts(rows: Champion[]): { displayName: string; titles: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.displayName, (counts.get(r.displayName) ?? 0) + 1);
  return [...counts].map(([displayName, titles]) => ({ displayName, titles })).sort((a, b) => b.titles - a.titles || a.displayName.localeCompare(b.displayName));
}

/** The people who won the league's latest finished card (more than one after a tie). */
export const reigning = (rows: Champion[]) => rows.filter((r) => r.eventId === rows[0]?.eventId);

export function LeagueChampion({ league, rows, me }: { league: League; rows: Champion[]; me?: string }) {
  const current = reigning(rows);
  const mine = current.find((c) => c.displayName === me);
  const { data: predictor } = usePredictor(!!mine?.avatar);
  if (!current.length) return null;
  const counts = titleCounts(rows);
  const first = current[0]!;
  return (
    <div className="champion-strip">
      <Stack gap={6}>
        <Group gap={6} wrap="nowrap">
          <svg className="champion-crown" viewBox="0 0 24 18" aria-hidden>
            <path d="M2.5 16.5h19L23 4l-6.3 4.6L12 1 7.3 8.6 1 4Z" />
          </svg>
          <Text size="xs" fw={800} c="yellow.5" tt="uppercase" style={{ letterSpacing: "0.1em" }}>
            {current.length > 1 ? "Reigning champions" : "Reigning champion"}
          </Text>
        </Group>
        <Group gap={8} wrap="nowrap">
          <Group gap={-8} wrap="nowrap" style={{ flexShrink: 0 }}>
            {current.slice(0, 3).map((c) => (
              <PlayerAvatar key={c.displayName} name={c.displayName} avatar={c.avatar} size={36} />
            ))}
          </Group>
          <div style={{ minWidth: 0 }}>
            <Text fw={800} truncate lh={1.25}>
              {current.map((c) => c.displayName).join(" & ")}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              Won {first.eventName.split(":")[0]} with {first.points} pts
            </Text>
          </div>
        </Group>
        {rows.length > current.length && (
          <Text size="xs" c="dimmed">
            Titles: {counts.slice(0, 4).map((c) => `${c.displayName} ${c.titles}`).join(" · ")}
          </Text>
        )}
        {mine && (
          <ShareButton
            label="Share my title"
            fullWidth
            fileName={`champion-${league.name}`}
            text={`I won ${league.name} on ${first.eventName.split(":")[0]}. Think you can take the crown?`}
            url={`${window.location.origin}${import.meta.env.BASE_URL}`}
            make={() =>
              championImage({
                name: mine.displayName,
                photo: predictor?.fighters.find((f) => f.id === mine.avatar)?.image?.url,
                league: league.name,
                event: first.eventName,
                points: first.points,
                titles: counts.find((c) => c.displayName === mine.displayName)?.titles ?? 1,
              })
            }
          />
        )}
      </Stack>
    </div>
  );
}
