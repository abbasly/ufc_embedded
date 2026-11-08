// A player's Pick'em record, for your own profile and for anyone's player page: totals with
// their place on the overall leaderboard, and their scored cards. Built from scores, which are
// public like the leaderboard (picks themselves stay private).

import { Anchor, Collapse, Group, Loader, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { EventScore, PastPick } from "../../backend";
import { boutPoints, METHOD_LABEL, placeOf } from "../pickem/scoring";
import { useLeaderboard } from "../pickem/usePickem";

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Points, right picks, cards played and overall rank. */
export function Stats({ scores, displayName }: { scores: EventScore[] | undefined; displayName: string }) {
  const board = useLeaderboard();
  const rows = scores ?? [];
  const points = rows.reduce((n, r) => n + r.points, 0);
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  const picked = rows.reduce((n, r) => n + r.picked, 0);
  const rank = placeOf(board.data ?? [], displayName);

  const tiles = [
    { key: "points", label: "Points", value: String(points) },
    { key: "right", label: "Right picks", value: picked ? `${correct}/${picked}` : "–", note: picked ? `${Math.round((100 * correct) / picked)}%` : undefined },
    { key: "cards", label: "Cards played", value: String(rows.length) },
    { key: "rank", label: "Rank", value: rank ? `#${rank}` : "–", note: rank ? "overall" : undefined },
  ];
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
      {tiles.map((t) => (
        <Paper key={t.key} p="md" radius="md" className="pickem-board stat-tile" data-stat={t.key}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: "0.08em" }}>
            {t.label}
          </Text>
          <Group gap={6} align="baseline">
            <Text fz={26} fw={800} className="stat-value">
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

/** Scored cards, latest first; tap one to see its picks (where they're visible: your own,
 * friends', league-mates', the model's). ``own``: the empty state nudges you to make picks. */
export function History({ scores, loading, own, history }: { scores: EventScore[] | undefined; loading: boolean; own?: boolean; history?: PastPick[] }) {
  const [open, setOpen] = useState<string | null>(null);
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
        <Stack gap={4}>
          {scores.map((s) => {
            const picks = (history ?? []).filter((p) => p.bout.eventId === s.eventId).sort((a, b) => a.bout.position - b.bout.position);
            const isOpen = open === s.eventId;
            return (
              <div key={s.eventId}>
                <UnstyledButton className="history-row" onClick={() => setOpen(isOpen ? null : s.eventId)} disabled={!picks.length} aria-expanded={isOpen}>
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>
                        {s.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {day(s.startsOn)} · {s.correct}/{s.picked} right{picks.length > 0 && (isOpen ? " · hide picks" : " · see picks")}
                      </Text>
                    </div>
                    <Text fw={800} style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {s.points} pts
                    </Text>
                  </Group>
                </UnstyledButton>
                <Collapse expanded={isOpen}>
                  <Stack gap={4} px={8} pb={8}>
                    {picks.map((p) => (
                      <PickLine key={p.bout.id} p={p} />
                    ))}
                  </Stack>
                </Collapse>
              </div>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}

/** One past pick: the fight, whom they picked (and how), right or wrong, points. */
function PickLine({ p }: { p: PastPick }) {
  const name = (id: string | null) => (id === p.bout.fighterA ? p.bout.aName : p.bout.bName).split(" ").at(-1);
  const result = p.bout.outcome === "win" ? p.pick.winner === p.bout.winner : null;
  const pts = boutPoints(p.bout, p.pick);
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <div style={{ minWidth: 0 }}>
        <Text size="xs" c="dimmed" truncate>
          {p.bout.aName} vs {p.bout.bName}
          {p.bout.segment !== "main" && " · prelim"}
        </Text>
        <Text size="sm" truncate>
          <Text span c={result === null ? "dimmed" : result ? "green.4" : "red.4"} fw={800}>
            {result === null ? "–" : result ? "✓" : "✗"}
          </Text>{" "}
          {name(p.pick.winner)}
          {p.pick.method && ` by ${METHOD_LABEL[p.pick.method]}`}
          {result === false && p.bout.winner && (
            <Text span c="dimmed" size="xs">
              {" "}
              (it was {name(p.bout.winner)})
            </Text>
          )}
        </Text>
      </div>
      <Text size="sm" fw={700} c={pts ? "green.4" : "dimmed"} style={{ whiteSpace: "nowrap" }}>
        {pts === null ? "" : pts ? `+${pts}` : "0"}
      </Text>
    </Group>
  );
}
