// A player's trophy shelf: the league cards they've won. Public, like scores, but a league's
// name only shows to its members.

import "../collection/Collection.css";

import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function LeagueTitles({ userId }: { userId: string }) {
  const { backend } = useAuth();
  const titles = useQuery({
    queryKey: ["leagues", "titles", userId],
    queryFn: () => backend!.leagues.titlesOf(userId),
    enabled: !!backend,
    staleTime: 60_000,
  });
  const rows = titles.data ?? [];
  if (!rows.length) return null;
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Group wrap="nowrap" gap="md" align="flex-start">
        <svg className="titles-trophy" viewBox="0 0 24 24" aria-hidden>
          <path d="M7 2h10v2h4v4a5 5 0 0 1-5 5h-.4A5 5 0 0 1 13 15.9V19h3v3H8v-3h3v-3.1A5 5 0 0 1 8.4 13H8a5 5 0 0 1-5-5V4h4V2Zm0 4H5v2a3 3 0 0 0 2 2.8V6Zm10 0v4.8A3 3 0 0 0 19 8V6h-2Z" />
        </svg>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Title order={4} mb={4}>
            {rows.length} league {rows.length === 1 ? "title" : "titles"}
          </Title>
          <Stack gap={2}>
            {rows.slice(0, 8).map((t) => (
              <Text key={`${t.eventId}-${t.leagueName ?? ""}-${t.points}`} size="sm" c="dimmed">
                <Text span c="yellow.4" fw={700} inherit>
                  {t.leagueName ?? "A private league"}
                </Text>{" "}
                · {t.eventName.split(":")[0]}, {day(t.startsOn)} · {t.points} pts
              </Text>
            ))}
          </Stack>
        </div>
      </Group>
    </Paper>
  );
}
