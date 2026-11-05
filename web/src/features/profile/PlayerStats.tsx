// A player's Pick'em record, for your own profile and for anyone's player page: totals with
// their place on the overall leaderboard, and their scored cards. Built from scores, which are
// public like the leaderboard (picks themselves stay private).

import { Anchor, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

import type { EventScore } from "../../backend";
import { useLeaderboard } from "../pickem/usePickem";

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Points, right picks, cards played and overall rank. */
export function Stats({ scores, displayName }: { scores: EventScore[] | undefined; displayName: string }) {
  const board = useLeaderboard();
  const rows = scores ?? [];
  const points = rows.reduce((n, r) => n + r.points, 0);
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  const picked = rows.reduce((n, r) => n + r.picked, 0);
  const rank = board.data?.findIndex((r) => r.displayName === displayName) ?? -1;

  const tiles = [
    { label: "Points", value: String(points) },
    { label: "Right picks", value: picked ? `${correct}/${picked}` : "–", note: picked ? `${Math.round((100 * correct) / picked)}%` : undefined },
    { label: "Cards played", value: String(rows.length) },
    { label: "Rank", value: rank >= 0 ? `#${rank + 1}` : "–", note: rank >= 0 ? "overall" : undefined },
  ];
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
      {tiles.map((t) => (
        <Paper key={t.label} p="md" radius="md" className="pickem-board">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: "0.08em" }}>
            {t.label}
          </Text>
          <Group gap={6} align="baseline">
            <Text fz={26} fw={800} style={{ fontVariantNumeric: "tabular-nums" }}>
              {t.value}
            </Text>
            {t.note && (
              <Text size="sm" c="dimmed">
                {t.note}
              </Text>
            )}
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

/** Scored cards, latest first. ``own``: the empty state nudges you to make picks. */
export function History({ scores, loading, own }: { scores: EventScore[] | undefined; loading: boolean; own?: boolean }) {
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Title order={4} mb="sm">
        Past cards
      </Title>
      {loading ? (
        <Loader size="sm" />
      ) : !scores?.length ? (
        <Text size="sm" c="dimmed">
          No scored cards yet. Cards are scored once the results are in.
          {own && (
            <>
              {" "}
              <Anchor component={Link} to="/">
                Make your picks →
              </Anchor>
            </>
          )}
        </Text>
      ) : (
        <Stack gap={8}>
          {scores.map((s) => (
            <Group key={s.eventId} justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {s.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {day(s.startsOn)} · {s.correct}/{s.picked} right
                </Text>
              </div>
              <Text fw={800} style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {s.points} pts
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
