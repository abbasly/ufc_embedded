// Pick'em: pick the winners on the next UFC card (and, for bonus points, how they win) before
// it locks, and see how you stack up against other fans. Everything account-related goes
// through useAuth() and the backend interface; fighter photos and the model's odds come from
// the predictor's data.

import "./Pickem.css";

import { Alert, Anchor, Avatar, Badge, Button, Center, Grid, Group, Loader, Paper, Stack, Text, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { PlayerAvatar } from "../../auth/PlayerAvatar";
import { SignInModal } from "../../auth/SignInModal";
import { type LeaderboardRow, type MatePick, METHODS, type Method, type Pick, type PickemBout, type PickemEvent, type PickSplit, type Segment } from "../../backend";
import { usePredictor } from "../../data/client";
import type { PredictorData, PredictorFighter } from "../../data/types";
import { winProb } from "../predictor/model";
import { Leagues } from "./Leagues";
import { boutPoints, isUnderdog, METHOD_LABEL, POINTS } from "./scoring";
import { PICK_MUTATION, useCard, useEventLeaderboard, useEvents, useMatesPicks, useMyPicks, usePick, usePickSplit } from "./usePickem";

/** The current time, ticking every ``ms``: for the lock countdown. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "2d 04h 13m 09s": time left until the card locks. */
function timeLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hms = `${pad(Math.floor((total % 86400) / 3600))}h ${pad(Math.floor((total % 3600) / 60))}m ${pad(total % 60)}s`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

/** The lock countdown, ticking every second (on its own, so the page doesn't re-render). */
function Countdown({ until }: { until: string }) {
  const now = useNow(1000);
  return (
    <Badge size="lg" variant="light" color="red" style={{ fontVariantNumeric: "tabular-nums" }}>
      Picks close in {timeLeft(new Date(until).getTime() - now)}
    </Badge>
  );
}

/** "Sat 7 Nov, 17:00" in the visitor's own time zone. */
const lockLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "UFC 334 · 14 Nov": a short name for the event switcher. */
const shortName = (e: PickemEvent) =>
  `${e.name.split(":")[0]} · ${new Date(`${e.startsOn}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

/** The card to show first: the earliest one not scored yet (the one being fought, or the next
 * one), else the most recent. */
function defaultEvent(events: PickemEvent[]): PickemEvent | undefined {
  return events.find((e) => !e.scoredAt) ?? events.at(-1);
}

const dateLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "main", label: "Main card" },
  { key: "prelims", label: "Prelims" },
  { key: "early", label: "Early prelims" },
];

/** The model's P(A wins) for a bout, when both fighters are in the predictor's data. */
function modelChance(data: PredictorData | undefined, byId: Map<string, PredictorFighter>, bout: PickemBout): number | null {
  const a = byId.get(bout.fighterA);
  const b = byId.get(bout.fighterB);
  return data && a && b ? winProb(data.win_model, a, b) : null;
}

export default function PickemPage() {
  const { enabled, user, profile, loading: authLoading } = useAuth();
  const { data: predictor } = usePredictor();
  const [params, setParams] = useSearchParams();
  const events = useEvents();
  const eventId = params.get("event") ?? defaultEvent(events.data ?? [])?.id;
  const event = useCard(eventId);
  const picks = useMyPicks(eventId);
  const pick = usePick(eventId);
  const saving = useIsMutating({ mutationKey: PICK_MUTATION }) > 0;
  const now = useNow(15_000); // the countdown badge ticks by itself, every second
  const locked = !!event.data && new Date(event.data.event.locksAt).getTime() <= now;
  const mates = useMatesPicks(eventId, locked);
  const split = usePickSplit(eventId, locked);
  const results = useEventLeaderboard(eventId, !!event.data?.event.scoredAt);
  const [signingIn, setSigningIn] = useState(false);
  const byId = useMemo(() => new Map(predictor?.fighters.map((f) => [f.id, f])), [predictor]);

  if (!enabled) return <Alert title="Pick'em isn't available here">Accounts are switched off on this site.</Alert>;
  if (events.isPending || authLoading || (eventId && event.isPending)) return <Center h="60vh"><Loader /></Center>;
  const failed = events.error ?? event.error;
  if (failed) return <Alert color="red" title="Couldn't load the card">{failed.message}</Alert>;
  if (!event.data) return <Alert title="No card yet">The next UFC card shows up here once it's announced.</Alert>;

  const { event: card, bouts } = event.data;
  const lockIn = new Date(card.locksAt).getTime() - now;
  const open = lockIn > 0;
  const mine = new Map((picks.data ?? []).map((p) => [p.boutId, p]));
  const picked = bouts.filter((b) => mine.has(b.id)).length;
  const earned = bouts.reduce((n, b) => n + (boutPoints(b, mine.get(b.id)) ?? 0), 0);
  const mainBouts = bouts.filter((b) => b.segment === "main");
  const choose = (id: string) => setParams((p) => (p.set("event", id), p), { replace: true });

  const renderBout = (bout: PickemBout) => {
    const choice = mine.get(bout.id);
    const rank = mainBouts.indexOf(bout); // 0: main event, 1: co-main
    return (
      <Bout
        key={bout.id}
        bout={bout}
        label={rank === 0 ? "Main event" : rank === 1 ? "Co-main event" : null}
        choice={choice}
        byId={byId}
        chance={modelChance(predictor, byId, bout)}
        canPick={!!user && open}
        mates={(mates.data ?? []).filter((m) => m.boutId === bout.id)}
        split={split.data?.[bout.id]}
        onPick={(winner, method) => pick.mutate({ boutId: bout.id, winner, method })}
      />
    );
  };

  return (
    <Stack gap="lg" maw={1100} mx="auto" pt={4}>
      {(events.data?.length ?? 0) > 1 && (
        <Group gap={6} wrap="wrap">
          {events.data!.map((e) => (
            <UnstyledButton key={e.id} className="pickem-method" data-chosen={e.id === card.id || undefined} onClick={() => choose(e.id)}>
              {shortName(e)}
            </UnstyledButton>
          ))}
        </Group>
      )}
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
            <Countdown until={card.locksAt} />
          ) : (
            <Badge size="lg" variant="light" color="gray">
              {card.scoredAt ? "Results are in" : "Picks are locked"}
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            {open ? "Closes" : "Closed"} {lockLabel(card.locksAt)}
          </Text>
          {user && (
            <Text size="sm" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
              {card.scoredAt ? `${earned} points from ` : "You've picked "}
              {picked} of {bouts.length}
              {open && picked > 0 && <span className="pickem-saved"> · {saving ? "Saving…" : "✓ Saved"}</span>}
            </Text>
          )}
        </Stack>
      </Group>

      {card.scoredAt && results.data && <Results rows={results.data} me={profile?.displayName} />}
      {!open && !card.scoredAt && (
        <Paper p="sm" radius="md" className="pickem-board">
          <Text size="sm">
            Picks are locked: no more changes. Points and the final ranking come in once the results are in, usually the
            morning after the fights.
          </Text>
        </Paper>
      )}

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
          <Stack gap="lg">
            {SEGMENTS.map(({ key, label }) => {
              const segment = bouts.filter((b) => b.segment === key);
              if (!segment.length) return null;
              return (
                <Stack key={key} gap="sm">
                  {/* A single list (no Wikipedia card yet) needs no heading. */}
                  {segment.length !== bouts.length && (
                    <Text size="xs" fw={800} c="dimmed" tt="uppercase" className="pickem-segment">
                      {label}
                    </Text>
                  )}
                  {segment.map(renderBout)}
                </Stack>
              );
            })}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            <Rules />
            <Leagues />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

/** After the event: the top three, and where you finished. */
function Results({ rows, me }: { rows: LeaderboardRow[]; me?: string }) {
  if (!rows.length) return null;
  const myRank = rows.findIndex((r) => r.displayName === me);
  const medals = ["#f4c430", "#c0c6cf", "#cd7f32"];
  return (
    <Paper p="md" radius="md" className="pickem-board pickem-results">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <Text size="xs" fw={800} c="yellow.5" tt="uppercase" style={{ letterSpacing: "0.12em" }}>
            Final standings
          </Text>
          <Text size="sm" c="dimmed">
            {rows.length} {rows.length === 1 ? "player" : "players"}
            {myRank >= 0 && (
              <>
                {" "}
                · you finished <b style={{ color: "var(--mantine-color-white)" }}>#{myRank + 1}</b> with {rows[myRank]?.points} points
              </>
            )}
          </Text>
        </div>
        <Group gap="lg" wrap="wrap">
          {rows.slice(0, 3).map((r, i) => (
            <Group key={r.displayName} gap={8} wrap="nowrap">
              <div style={{ position: "relative" }}>
                <PlayerAvatar name={r.displayName} avatar={r.avatar} size={i === 0 ? 48 : 40} style={{ border: `2px solid ${medals[i]}` }} />
              </div>
              <div>
                <Text size="sm" fw={700} lh={1.2}>
                  {i + 1}. {r.displayName}
                </Text>
                <Text size="xs" c="dimmed">
                  {r.points} pts · {r.correct}/{r.picked}
                </Text>
              </div>
            </Group>
          ))}
        </Group>
      </Group>
    </Paper>
  );
}

function Rules() {
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Text size="xs" fw={800} c="dimmed" tt="uppercase" mb={6} style={{ letterSpacing: "0.1em" }}>
        Scoring
      </Text>
      <Stack gap={2}>
        <Text size="sm">
          <b>{POINTS.winner}</b> for the right winner
        </Text>
        <Text size="sm">
          <b>+{POINTS.method}</b> if you also call how: KO/TKO, submission or decision
        </Text>
        <Text size="sm">
          <b>+{POINTS.underdog}</b> if your winner was the bookies' underdog
        </Text>
      </Stack>
      <Text size="xs" c="dimmed" mt={6}>
        Picks save as you tap. Change them until the card locks.
      </Text>
    </Paper>
  );
}

interface BoutProps {
  bout: PickemBout;
  label: string | null; // "Main event", "Co-main event"
  choice: Pick | undefined;
  byId: Map<string, PredictorFighter>;
  chance: number | null; // the model's P(A wins)
  canPick: boolean;
  mates: MatePick[]; // league-mates' picks (after the lock)
  split: PickSplit[string] | undefined; // how everyone picked (after the lock)
  onPick: (winner: string | null, method: Method | null) => void;
}

function Bout({ bout, label, choice, byId, chance, canPick, mates, split, onPick }: BoutProps) {
  const choose = (id: string) => (choice?.winner === id ? onPick(null, null) : onPick(id, choice?.method ?? null));
  const points = boutPoints(bout, choice);
  const surname = (id: string) => (id === bout.fighterA ? bout.aName : bout.bName).split(" ").at(-1);
  return (
    <Paper p="sm" radius="md" className="pickem-bout" data-headline={label === "Main event" || undefined}>
      {(label || bout.title) && (
        <Group gap={8} mb={6}>
          {label && (
            <Text size="xs" fw={800} tt="uppercase" c={label === "Main event" ? "red.4" : "dimmed"} style={{ letterSpacing: "0.1em" }}>
              {label}
            </Text>
          )}
          {bout.title && (
            <Badge size="xs" variant="light" color="yellow">
              Title fight
            </Badge>
          )}
        </Group>
      )}
      <Group wrap="nowrap" gap="sm" align="stretch" mb={6}>
        {[bout.fighterA, bout.fighterB].map((id, i) => (
          <Side
            key={id}
            id={id}
            name={i === 0 ? bout.aName : bout.bName}
            fighter={byId.get(id)}
            chance={chance === null ? null : i === 0 ? chance : 1 - chance}
            underdog={isUnderdog(bout, id)}
            chosen={choice?.winner === id}
            winner={bout.outcome === "win" ? bout.winner : null}
            disabled={!canPick}
            onPick={choose}
            vs={i === 0}
          />
        ))}
      </Group>
      <Crowd bout={bout} mates={mates} split={split} surname={surname} />

      {choice && canPick && (
        <Group gap={6} px={4} mb={6} wrap="wrap">
          <Text size="xs" c="dimmed">
            How does {surname(choice.winner)} win? <span className="pickem-bonus">+{POINTS.method}</span>
          </Text>
          {METHODS.map((m) => (
            <UnstyledButton
              key={m}
              className="pickem-method"
              data-chosen={choice.method === m || undefined}
              aria-pressed={choice.method === m}
              onClick={() => onPick(choice.winner, choice.method === m ? null : m)}
            >
              {METHOD_LABEL[m]}
            </UnstyledButton>
          ))}
        </Group>
      )}
      {choice?.method && !canPick && bout.outcome === null && (
        <Text size="xs" c="dimmed" px={4} mb={6}>
          Your call: {surname(choice.winner)} by {METHOD_LABEL[choice.method]}
        </Text>
      )}
      {bout.outcome && (
        <Group gap="xs" px={4} mb={6}>
          <Text size="xs" fw={700}>
            {bout.outcome === "win" && bout.winner
              ? `${surname(bout.winner)} by ${bout.method ? METHOD_LABEL[bout.method] : "other"}`
              : bout.outcome === "draw"
                ? "Draw: no points either way"
                : "No contest: no points either way"}
          </Text>
          {points !== null && (
            <Text size="xs" fw={800} c={points ? "green.4" : "dimmed"}>
              {points ? `+${points}` : "0"}
            </Text>
          )}
        </Group>
      )}
      <BoutFooter bout={bout} known={byId.has(bout.fighterA) && byId.has(bout.fighterB)} />
    </Paper>
  );
}

interface SideProps {
  id: string;
  name: string;
  fighter: PredictorFighter | undefined;
  chance: number | null; // the model's win chance for this fighter
  underdog: boolean;
  chosen: boolean;
  winner: string | null; // the result, once in
  disabled: boolean;
  onPick: (id: string) => void;
  vs: boolean; // draw "vs" after this side
}

/** One fighter in a bout: tap to pick them. After the event: a tick or a cross on your pick. */
function Side({ id, name, fighter, chance, underdog, chosen, winner, disabled, onPick, vs }: SideProps) {
  const result = winner === null ? null : winner === id;
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <>
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
              {chance !== null ? `Model ${Math.round(chance * 100)}%` : fighter ? fighter.weight_class : "UFC newcomer"}
              {underdog && <span className="pickem-bonus"> · underdog</span>}
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
      {vs && (
        <Center>
          <Text fw={900} fs="italic" c="dimmed">
            vs
          </Text>
        </Center>
      )}
    </>
  );
}

/** After the lock: your league-mates' faces under the fighter each picked, and a bar with how
 * everyone picked. */
function Crowd({ bout, mates, split, surname }: { bout: PickemBout; mates: MatePick[]; split: PickSplit[string] | undefined; surname: (id: string) => string | undefined }) {
  const a = split?.[bout.fighterA] ?? 0;
  const b = split?.[bout.fighterB] ?? 0;
  const total = a + b;
  if (!total && !mates.length) return null;
  const pctA = total ? Math.round((100 * a) / total) : 50;
  const faces = (fighter: string) => {
    const backers = mates.filter((m) => m.winner === fighter);
    if (!backers.length) return <div className="pickem-faces" />;
    const shown = backers.slice(0, 4);
    return (
      <Avatar.Group spacing={8} className="pickem-faces">
        {shown.map((m) => (
          <Tooltip key={m.displayName} label={`${m.displayName}: ${surname(m.winner)}${m.method ? ` by ${METHOD_LABEL[m.method]}` : ""}`} withArrow>
            <PlayerAvatar name={m.displayName} avatar={m.avatar} size={24} />
          </Tooltip>
        ))}
        {backers.length > shown.length && (
          <Tooltip label={backers.slice(4).map((m) => m.displayName).join(", ")} withArrow>
            <Avatar size={24} radius="xl">
              +{backers.length - shown.length}
            </Avatar>
          </Tooltip>
        )}
      </Avatar.Group>
    );
  };
  return (
    <Group gap="sm" wrap="nowrap" px={4} mb={6} align="center">
      {faces(bout.fighterA)}
      {total > 0 ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pickem-split" role="img" aria-label={`${pctA}% picked ${surname(bout.fighterA)}, ${100 - pctA}% ${surname(bout.fighterB)}`}>
            <div style={{ width: `${pctA}%` }} />
          </div>
          <Group justify="space-between" gap={4} mt={2}>
            <Text size="xs" fw={700}>
              {pctA}%
            </Text>
            <Text size="xs" c="dimmed">
              {total} {total === 1 ? "pick" : "picks"}
            </Text>
            <Text size="xs" fw={700}>
              {100 - pctA}%
            </Text>
          </Group>
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      {faces(bout.fighterB)}
    </Group>
  );
}

/** Under each bout: links to the site's deeper looks at the matchup. */
function BoutFooter({ bout, known }: { bout: PickemBout; known: boolean }) {
  if (!known) return null;
  return (
    <Group gap="md" wrap="wrap" px={4}>
      <Anchor component={Link} to={`/predictor?a=${bout.fighterA}&b=${bout.fighterB}`} size="xs" c="dimmed">
        Full prediction →
      </Anchor>
      <Anchor component={Link} to={`/mma-math?winner=${bout.fighterA}&loser=${bout.fighterB}`} size="xs" c="dimmed">
        MMA math →
      </Anchor>
    </Group>
  );
}
