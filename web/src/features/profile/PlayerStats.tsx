// A player's Pick'em record, for your own profile and for anyone's player page: totals with
// their place on the overall leaderboard, and their scored cards. Built from scores, which are
// public like the leaderboard (picks themselves stay private).

import { Anchor, Collapse, Group, Paper, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { EventScore, PastPick } from "../../backend";
import { boutPoints, METHOD_LABEL, placeOf } from "../pickem/scoring";
import { useLeaderboard } from "../pickem/usePickem";
import { LogoLoader } from "../../components/LogoLoader";
import { useCountUp } from "../predictor/useCountUp";

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Points, right picks, cards played and overall rank: one compact row, each number with a small
 * picture of itself (points per card, the hit rate as a ring, a dot per card, where they stand),
 * counting up once the numbers are in. */
export function Stats({ scores, displayName }: { scores: EventScore[] | undefined; displayName: string }) {
  const board = useLeaderboard();
  const rows = scores ?? [];
  const points = rows.reduce((n, r) => n + r.points, 0);
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  const picked = rows.reduce((n, r) => n + r.picked, 0);
  const rank = placeOf(board.data ?? [], displayName);
  const players = board.data?.length ?? 0;
  const t = useCountUp(`${displayName}-${points}-${picked}-${rank}`, 1100);
  const perCard = [...rows].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).slice(-10);
  const maxCard = Math.max(1, ...perCard.map((r) => r.points));
  const hit = picked ? correct / picked : 0;

  return (
    // One scoreboard: four cells in a single pane, split by rules.
    <Paper withBorder className="scoreboard">
      <div className="stat-tile" data-stat="points">
        <Text size="xs" c="dimmed" fw={600}>
          Points
        </Text>
        <Group gap={12} wrap="nowrap" align="flex-end" justify="space-between">
          <Text fz={{ base: 26, sm: 30 }} fw={850} className="stat-value">
            {Math.round(points * t)}
          </Text>
          {perCard.length > 1 && (
            <div className="stat-bars" aria-label="Points per card, oldest first">
              {perCard.map((r) => (
                <div key={r.eventId} title={`${r.name.split(":")[0]}: ${r.points} pts`} style={{ height: `${Math.max(6, (100 * r.points) / maxCard) * t}%` }} />
              ))}
            </div>
          )}
        </Group>
      </div>

      <div className="stat-tile" data-stat="right">
        <Text size="xs" c="dimmed" fw={600}>
          Right picks
        </Text>
        <Group gap={12} wrap="nowrap" align="center">
          {picked > 0 && (
            <svg viewBox="0 0 44 44" width={40} height={40} className="stat-ring" aria-hidden>
              <circle cx="22" cy="22" r="18" className="stat-ring-track" />
              <circle cx="22" cy="22" r="18" className="stat-ring-fill" strokeDasharray={`${2 * Math.PI * 18 * hit * t} ${2 * Math.PI * 18}`} />
              <text x="22" y="26" textAnchor="middle" className="stat-ring-text">
                {Math.round(100 * hit * t)}%
              </text>
            </svg>
          )}
          <Text fz={{ base: 26, sm: 30 }} fw={850} className="stat-value">
            {picked ? `${Math.round(correct * t)}/${picked}` : "–"}
          </Text>
        </Group>
      </div>

      <div className="stat-tile" data-stat="cards">
        <Text size="xs" c="dimmed" fw={600}>
          Cards played
        </Text>
        <Group gap={12} wrap="nowrap" align="center" justify="space-between">
          <Text fz={{ base: 26, sm: 30 }} fw={850} className="stat-value">
            {Math.round(rows.length * t)}
          </Text>
          <div className="stat-dots" aria-hidden>
            {rows.slice(0, 12).map((r, i) => (
              <span key={r.eventId} data-on={t > (i + 0.5) / Math.min(12, rows.length) || undefined} />
            ))}
          </div>
        </Group>
      </div>

      <div className="stat-tile" data-stat="rank">
        <Text size="xs" c="dimmed" fw={600}>
          Rank
        </Text>
        <Group gap={8} wrap="nowrap" align="baseline">
          <Text fz={{ base: 26, sm: 30 }} fw={850} className="stat-value">
            {rank ? `#${rank}` : "–"}
          </Text>
          {rank && players > 0 && (
            <Text size="sm" c="dimmed">
              of {players}
            </Text>
          )}
        </Group>
        {rank && players > 1 && (
          // Where they stand, last on the left to first on the right; the marker slides into place.
          <div className="stat-track" aria-label={`#${rank} of ${players}`}>
            <span className="stat-track-marker" style={{ left: `${((players - rank) / (players - 1)) * 100 * t}%` }} />
          </div>
        )}
      </div>
    </Paper>
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
        <LogoLoader size={30} />
      ) : !scores?.length ? (
        <Text size="sm" c="dimmed">
          No scored cards yet. Cards are scored once the results are in.
          {own && (
            <>
              {" "}
              <Anchor component={Link} to="/pickem">
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
