// Pick'em: pick the winners on the next UFC card, before it locks, and see how you stack up
// against the model and other fans. Everything account-related goes through useAuth() and the
// backend interface; fighter photos and the model's odds come from the predictor's data.

import "./Pickem.css";

import { Alert, Avatar, Badge, Button, Center, Grid, Group, Loader, Paper, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { SignInModal } from "../../auth/SignInModal";
import type { PickemBout } from "../../backend";
import { usePredictor } from "../../data/client";
import type { PredictorData, PredictorFighter } from "../../data/types";
import { winProb } from "../predictor/model";
import { useCurrentEvent, useLeaderboard, useMyPicks, usePick } from "./usePickem";

/** The current time, ticking every ``ms``: for the lock countdown. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "2d 4h", "3h 12m", "45m": time left until the card locks. */
function timeLeft(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${Math.max(1, m)}m`;
}

const dateLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** The model's P(A wins) for a bout, when both fighters are in the predictor's data. */
function modelChance(data: PredictorData | undefined, byId: Map<string, PredictorFighter>, bout: PickemBout): number | null {
  const a = byId.get(bout.fighterA);
  const b = byId.get(bout.fighterB);
  return data && a && b ? winProb(data.win_model, a, b) : null;
}

export default function PickemPage() {
  const { enabled, user, loading: authLoading } = useAuth();
  const { data: predictor } = usePredictor();
  const event = useCurrentEvent();
  const picks = useMyPicks(event.data?.event.id);
  const pick = usePick(event.data?.event.id);
  const now = useNow(30_000);
  const [signingIn, setSigningIn] = useState(false);
  const byId = useMemo(() => new Map(predictor?.fighters.map((f) => [f.id, f])), [predictor]);

  if (!enabled) return <Alert title="Pick'em isn't available here">Accounts are switched off on this site.</Alert>;
  if (event.isPending || authLoading) return <Center h="60vh"><Loader /></Center>;
  if (event.error) return <Alert color="red" title="Couldn't load the card">{event.error.message}</Alert>;
  if (!event.data) return <Alert title="No card yet">The next UFC card shows up here once it's announced.</Alert>;

  const { event: card, bouts } = event.data;
  const lockIn = new Date(card.locksAt).getTime() - now;
  const open = lockIn > 0;
  const mine = new Map((picks.data ?? []).map((p) => [p.boutId, p.winner]));
  const picked = bouts.filter((b) => mine.has(b.id)).length;

  return (
    <Stack gap="lg" maw={1100} mx="auto" pt={4}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Text size="xs" fw={800} c="red.4" tt="uppercase" style={{ letterSpacing: "0.12em" }}>
            Pick'em
          </Text>
          <Title order={1} fz={{ base: 26, md: 32 }} lh={1.15}>
            {card.name}
          </Title>
          <Text c="dimmed" size="sm">
            {dateLabel(card.startsOn)} · {bouts.length} fights
          </Text>
        </div>
        <Stack gap={4} align="flex-end">
          {open ? (
            <Badge size="lg" variant="light" color="red">
              Picks close in {timeLeft(lockIn)}
            </Badge>
          ) : (
            <Badge size="lg" variant="light" color="gray">
              {card.scoredAt ? "Results are in" : "Picks are locked"}
            </Badge>
          )}
          {user && (
            <Text size="sm" c="dimmed">
              You've picked {picked} of {bouts.length}
            </Text>
          )}
        </Stack>
      </Group>

      {!user && (
        <Paper p="md" radius="md" className="pickem-cta">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text>Sign in to make your picks and get on the leaderboard.</Text>
            <Button onClick={() => setSigningIn(true)}>Sign in</Button>
          </Group>
          <SignInModal opened={signingIn} onClose={() => setSigningIn(false)} />
        </Paper>
      )}
      {pick.error && (
        <Alert color="red" withCloseButton onClose={() => pick.reset()}>
          {pick.error.message}
        </Alert>
      )}

      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="sm">
            {bouts.map((bout) => {
              const choice = mine.get(bout.id) ?? null;
              const p = modelChance(predictor, byId, bout);
              const choose = (id: string) => pick.mutate({ boutId: bout.id, winner: choice === id ? null : id });
              return (
                <Paper key={bout.id} p="sm" radius="md" className="pickem-bout">
                  {bout.position === 1 && (
                    <Text size="xs" fw={800} c="dimmed" tt="uppercase" mb={6} style={{ letterSpacing: "0.1em" }}>
                      Main event
                    </Text>
                  )}
                  <Group wrap="nowrap" gap="sm" align="stretch">
                    <Side
                      id={bout.fighterA}
                      name={bout.aName}
                      fighter={byId.get(bout.fighterA)}
                      chance={p}
                      chosen={choice === bout.fighterA}
                      winner={bout.winner}
                      disabled={!user || !open}
                      onPick={choose}
                    />
                    <Center>
                      <Text fw={900} fs="italic" c="dimmed">
                        vs
                      </Text>
                    </Center>
                    <Side
                      id={bout.fighterB}
                      name={bout.bName}
                      fighter={byId.get(bout.fighterB)}
                      chance={p === null ? null : 1 - p}
                      chosen={choice === bout.fighterB}
                      winner={bout.winner}
                      disabled={!user || !open}
                      onPick={choose}
                    />
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Leaderboard />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

interface SideProps {
  id: string;
  name: string;
  fighter: PredictorFighter | undefined;
  chance: number | null; // the model's win chance for this fighter
  chosen: boolean;
  winner: string | null; // the result, once in
  disabled: boolean;
  onPick: (id: string) => void;
}

/** One fighter in a bout: tap to pick them. After the event: a tick or a cross on your pick. */
function Side({ id, name, fighter, chance, chosen, winner, disabled, onPick }: SideProps) {
  const result = winner === null ? null : winner === id;
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <UnstyledButton
      className="pickem-side"
      data-chosen={chosen || undefined}
      data-won={result === true || undefined}
      data-lost={result === false || undefined}
      disabled={disabled}
      onClick={() => onPick(id)}
      aria-pressed={chosen}
      style={{ flex: 1, minWidth: 0 }}
    >
      <Group gap="sm" wrap="nowrap">
        <Avatar src={fighter?.image?.url} size={46} radius="xl" color="gray">
          {initials}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <Text fw={700} lineClamp={2} lh={1.2}>
            {name}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {chance !== null ? `Model ${Math.round(chance * 100)}%` : fighter ? fighter.weight_class : "UFC debut"}
          </Text>
        </div>
        {chosen && (
          // On phones the outline alone marks the pick, so the name keeps the room.
          <Text ml="auto" fw={800} size="sm" className="pickem-mark" visibleFrom={result === null ? "sm" : undefined}>
            {result === null ? "Your pick" : result ? "✓" : "✗"}
          </Text>
        )}
      </Group>
    </UnstyledButton>
  );
}

function Leaderboard() {
  const board = useLeaderboard();
  const { profile } = useAuth();
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Title order={4} mb="xs">
        Leaderboard
      </Title>
      {board.isPending ? (
        <Loader size="sm" />
      ) : !board.data?.length ? (
        <Text size="sm" c="dimmed">
          No scores yet. Picks are scored after each event: get yours in and be first on the board.
        </Text>
      ) : (
        <Stack gap={6}>
          {board.data.map((row, i) => (
            <Group key={row.displayName} justify="space-between" wrap="nowrap" className="pickem-row" data-me={row.displayName === profile?.displayName || undefined}>
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <Text size="sm" c="dimmed" w={20} ta="right">
                  {i + 1}
                </Text>
                <Text size="sm" fw={600} truncate>
                  {row.displayName}
                </Text>
              </Group>
              <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                {row.correct}/{row.picked} · <b>{row.points}</b>
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
