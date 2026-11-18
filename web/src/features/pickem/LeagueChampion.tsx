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
        {/* The holder: their face in a gold ring, the crown on it, the card they won it on. */}
        <Group gap={12} wrap="nowrap">
          <Group gap={-10} wrap="nowrap" style={{ flexShrink: 0 }} className="champion-faces">
            {current.slice(0, 3).map((c) => (
              <PlayerAvatar key={c.displayName} name={c.displayName} avatar={c.avatar} size={46} />
            ))}
          </Group>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Group gap={5} wrap="nowrap">
              <svg className="champion-crown" viewBox="0 0 24 18" aria-hidden>
                <path d="M2.5 16.5h19L23 4l-6.3 4.6L12 1 7.3 8.6 1 4Z" />
              </svg>
              <span className="champion-label">{current.length > 1 ? "League champions" : "League champion"}</span>
            </Group>
            <Text fw={850} fz={19} truncate lh={1.2}>
              {current.map((c) => c.displayName).join(" & ")}
            </Text>
          </div>
          <div className="champion-won">
            <span>{first.points}</span>
            <small>pts on {first.eventName.split(":")[0]}</small>
          </div>
        </Group>
        {/* Every title in the league so far, as a tally. */}
        {rows.length > current.length && (
          <div className="champion-titles">
            <span className="champion-titles-head">Titles</span>
            {counts.slice(0, 4).map((c) => (
              <span key={c.displayName} className="champion-tally">
                {c.displayName} <b>{c.titles}</b>
              </span>
            ))}
          </div>
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
