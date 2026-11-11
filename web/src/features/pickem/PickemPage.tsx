// Pick'em: pick the winners on the next UFC card (and, for bonus points, how they win) before
// it locks, and see how you stack up against other fans. Everything account-related goes
// through useAuth() and the backend interface; fighter photos and the model's odds come from
// the predictor's data.

import "./Pickem.css";

import { Alert, Anchor, Avatar, Badge, Button, Center, Collapse, Grid, Group, Loader, Paper, SegmentedControl, Stack, Text, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { PlayerAvatar } from "../../auth/PlayerAvatar";
import { SignInModal } from "../../auth/SignInModal";
import { type LeaderboardRow, type MatePick, type MateWhoPicked, METHODS, type Method, type Pick, type PickemBout, type PickemEvent, type PickSplit, type Segment } from "../../backend";
import { usePredictor } from "../../data/client";
import type { PredictorData, PredictorFighter } from "../../data/types";
import { winProb } from "../predictor/model";
import { cardPath } from "../seo/content";
import { InstallBar } from "../../app/install";
import { NewCards } from "../collection/NewCards";
import { PacksBanner } from "../collection/Packs";
import { guestStarters, useStarterBadges } from "../profile/starter";
import { StarterToast } from "../profile/StarterToast";
import { useClaimGuestPicks, useGuestPicks } from "./guestPicks";
import { Leagues, ModelTag, playerPath } from "./Leagues";
import { boutPoints, isUnderdog, marketChance, METHOD_LABEL, MODEL_PLAYER, places, POINTS, scores } from "./scoring";
import {
  EVERYONE,
  FRIENDS,
  PICK_MUTATION,
  useCard,
  useEventLeaderboard,
  useEvents,
  useLeagueChoice,
  useLeagueMembers,
  useLeagues,
  useMatesPicks,
  useMatesWhoPicked,
  useMyPicks,
  usePick,
  usePickSplit,
} from "./usePickem";

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
function Countdown({ until, card }: { until: string; card: string }) {
  const now = useNow(1000);
  const left = new Date(until).getTime() - now;
  // In the last hour the browser tab counts down too: a reminder in every other tab.
  const lastHour = left > 0 && left < 3600e3;
  const tab = lastHour ? `⏰ ${Math.ceil(left / 60_000)}m left · ${card.split(":")[0]} Pick'em` : null;
  useEffect(() => {
    if (!tab) return;
    const before = document.title;
    document.title = tab;
    return () => {
      document.title = before;
    };
  }, [tab]);
  return (
    <Badge size="lg" variant="light" color="red" style={{ fontVariantNumeric: "tabular-nums" }}>
      Picks close in {timeLeft(new Date(until).getTime() - now)}
    </Badge>
  );
}

/** "Sat 7 Nov, 17:00" in the visitor's own time zone. */
const lockLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Whether a card is being fought right now (locked, not scored, still fight day). */
const isLive = (e: PickemEvent, now: number) => !e.scoredAt && Date.parse(e.locksAt) <= now && now - Date.parse(e.locksAt) < 20 * 3600e3;

/** "UFC 334 · 14 Nov": a short name for the event switcher. */
const shortName = (e: PickemEvent) =>
  `${e.name.split(":")[0]} · ${new Date(`${e.startsOn}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

/** A numbered event ("UFC 334"), the big ones, as opposed to a Fight Night. */
export const isNumbered = (e: PickemEvent) => /^UFC \d+\b/.test(e.name);

/** How long a just-scored card stays the one shown first, so everyone sees how they did. */
const RESULTS_SHOWN_MS = 36 * 3600e3;

/** The card to show first: one scored in the last day and a half (the results), else the
 * earliest one not scored yet (the one being fought, or the next one), else the most recent. */
function defaultEvent(events: PickemEvent[]): PickemEvent | undefined {
  const fresh = events.filter((e) => e.scoredAt && Date.now() - Date.parse(e.scoredAt) < RESULTS_SHOWN_MS).at(-1);
  return fresh ?? events.find((e) => !e.scoredAt) ?? events.at(-1);
}

const dateLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

const PRELIMS: { key: Segment; label: string }[] = [
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
  const guest = useGuestPicks(eventId);
  useClaimGuestPicks();
  const starters = useStarterBadges(profile ? user?.id : undefined);
  const saving = useIsMutating({ mutationKey: PICK_MUTATION }) > 0;
  const now = useNow(15_000); // the countdown badge ticks by itself, every second
  const locked = !!event.data && new Date(event.data.event.locksAt).getTime() <= now;
  const mates = useMatesPicks(eventId, locked);
  const split = usePickSplit(eventId, locked);
  const whoPicked = useMatesWhoPicked(eventId, !locked);
  // Friends' faces come from the league open on the leaderboard, never a mix of leagues.
  const [league, setLeague] = useLeagueChoice();
  const members = useLeagueMembers(league);
  const leagues = useLeagues();
  const leagueName = league === FRIENDS ? "Friends" : (leagues.data?.find((l) => l.id === league)?.name ?? "");
  const inLeague = useMemo(() => new Set(league === EVERYONE ? [] : (members.data ?? [])), [league, members.data]);
  // Phones show the fights or the leaderboard (a tap apart); wider screens show both.
  // Coming from an invite or a "my leagues" link, the leagues are what you came for.
  const [view, setView] = useState<"fights" | "board">(() => (params.has("join") || params.has("league") ? "board" : "fights"));
  const [prelimsOpen, setPrelimsOpen] = useState(false);
  const results = useEventLeaderboard(eventId, !!event.data?.event.scoredAt);
  const [signingIn, setSigningIn] = useState(false);
  // Signed in (with email and password, the window stays put otherwise): close it.
  useEffect(() => {
    if (user) setSigningIn(false);
  }, [user]);
  const byId = useMemo(() => new Map(predictor?.fighters.map((f) => [f.id, f])), [predictor]);

  if (!enabled) return <Alert title="Pick'em isn't available here">Accounts are switched off on this site.</Alert>;
  if (events.isPending || authLoading || (eventId && event.isPending)) return <Center h="60vh"><Loader /></Center>;
  const failed = events.error ?? event.error;
  if (failed) return <Alert color="red" title="Couldn't load the card">{failed.message}</Alert>;
  if (!event.data) return <Alert title="No card yet">The next UFC card shows up here once it's announced.</Alert>;

  const { event: card, bouts } = event.data;
  const lockIn = new Date(card.locksAt).getTime() - now;
  const open = lockIn > 0;
  // Signed out, picks live in this browser until there's an account to save them to.
  const mine = new Map((user ? (picks.data ?? []) : guest.picks).map((p) => [p.boutId, p]));
  // Being fought: locked, not all results in, and still fight day (or the night after).
  const live = !open && !card.scoredAt && now - new Date(card.locksAt).getTime() < 20 * 3600e3;
  const mainBouts = bouts.filter(scores);
  const prelims = bouts.filter((b) => !scores(b));
  const picked = mainBouts.filter((b) => mine.has(b.id)).length;
  const earned = mainBouts.reduce((n, b) => n + (boutPoints(b, mine.get(b.id)) ?? 0), 0);
  // This card's page of predictions, when it's one of the upcoming cards that have one.
  const upcomingCard = predictor?.upcoming?.find((c) => c.name === card.name);
  const cardPage = upcomingCard ? cardPath(upcomingCard) : null;
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
        canPick={open}
        mates={(mates.data ?? []).filter((m) => m.boutId === bout.id && inLeague.has(m.displayName))}
        // Before the lock only: after it, the faces sit under the fighter each friend picked.
        pickedBy={locked ? [] : (whoPicked.data ?? []).filter((m) => m.boutId === bout.id && inLeague.has(m.displayName))}
        split={split.data?.[bout.id]}
        leagueName={leagueName}
        onPick={(winner, method) => (user ? pick.mutate({ boutId: bout.id, winner, method }) : guest.pick(bout.id, winner, method))}
      />
    );
  };

  return (
    <Stack gap="lg" maw={1100} mx="auto" pt={4}>
      {(events.data?.length ?? 0) > 1 && (
        <Group gap={6} wrap="wrap">
          {events.data!.map((e) => (
            <UnstyledButton key={e.id} className="pickem-method" data-chosen={e.id === card.id || undefined} data-numbered={isNumbered(e) || undefined} onClick={() => choose(e.id)}>
              {isLive(e, now) && <span className="pickem-live-dot" aria-label="live" />}
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
          <Group gap="md" mt={4}>
            <Anchor component={Link} to={cardPage ? `/${cardPage}/` : "/cards/"} size="sm">
              {cardPage ? "Full card predictions" : "Upcoming card predictions"} →
            </Anchor>
            <Anchor component={Link} to="/fighters/" size="sm">
              All fighters →
            </Anchor>
          </Group>
        </div>
        <Stack gap={4} align="flex-end">
          {open ? (
            <Countdown until={card.locksAt} card={card.name} />
          ) : (
            <Badge size="lg" variant={live ? "filled" : "light"} color={live ? "red" : "gray"} className={live ? "pickem-live" : undefined}>
              {card.scoredAt ? "Results are in" : live ? "● Live" : "Picks are locked"}
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            {open ? "Closes" : "Closed"} {lockLabel(card.locksAt)}
          </Text>
          {(user || picked > 0) && (
            <Text size="sm" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
              {card.scoredAt ? `${earned} points from ` : "You've picked "}
              {picked} of {mainBouts.length}
              {prelims.length > 0 && " main-card fights"}
              {open && picked > 0 && user && <span className="pickem-saved"> · {saving ? "Saving…" : "✓ Saved"}</span>}
            </Text>
          )}
        </Stack>
      </Group>

      {/* Phones: the fights or the leagues, a tap apart, right under the title and kept in reach
          while scrolling. */}
      <SegmentedControl
        hiddenFrom="md"
        fullWidth
        size="md"
        className="pickem-view-switch"
        value={view}
        onChange={(v) => setView(v as "fights" | "board")}
        data={[
          { value: "fights", label: "Fights" },
          { value: "board", label: "Leagues" },
        ]}
      />

      {card.scoredAt && results.data && <Results rows={results.data} me={profile?.displayName} />}
      {!open && !card.scoredAt && (
        <Paper p="sm" radius="md" className="pickem-board">
          <Text size="sm">
            {live
              ? "The fights are on: results show up here as each one ends (this page checks every minute). Points and the final ranking come once the whole card is done."
              : "Picks are locked: no more changes. Points and the final ranking come in once the results are in, usually the morning after the fights."}
          </Text>
        </Paper>
      )}

      <StarterToast earned={user ? (profile ? starters.data : undefined) : guestStarters(guest.picks, mainBouts.map((b) => b.id))} guest={!user} />
      <NewCards />
      <PacksBanner />
      <InstallBar />
      {!user && open && guest.picks.length === 0 && (
        <Text size="sm" c="dimmed">
          Tap a fighter to start picking. No account needed until you want to save them.
        </Text>
      )}
      <SignInModal opened={signingIn} onClose={() => setSigningIn(false)} />
      {pick.error && (
        <Alert color="red" withCloseButton onClose={() => pick.reset()}>
          {pick.error.message}
        </Alert>
      )}

      <Grid gap="xl" className="pickem-columns" data-view={view}>
        <Grid.Col span={{ base: 12, md: 7 }} className="pickem-col-fights">
          <Stack gap="lg">
            <Stack gap="sm">
              {/* A single list (no Wikipedia card yet) needs no heading. */}
              {prelims.length > 0 && (
                <Text size="xs" fw={800} c="dimmed" tt="uppercase" className="pickem-segment">
                  Main card
                </Text>
              )}
              {mainBouts.map(renderBout)}
            </Stack>
            {prelims.length > 0 && (
              // The prelims fold away: they don't score, and a full card is a long scroll.
              <Stack gap="sm">
                <UnstyledButton className="pickem-prelims-toggle" onClick={() => setPrelimsOpen((o) => !o)} aria-expanded={prelimsOpen}>
                  <span>
                    <b>Prelims</b> · {prelims.length} {prelims.length === 1 ? "fight" : "fights"} · for fun, no points
                  </span>
                  <span className="pickem-chevron" data-open={prelimsOpen || undefined} aria-hidden>
                    ▾
                  </span>
                </UnstyledButton>
                <Collapse expanded={prelimsOpen}>
                  <Stack gap="sm">
                    {PRELIMS.map(({ key, label }) => {
                      const segment = prelims.filter((b) => b.segment === key);
                      if (!segment.length) return null;
                      return (
                        <Stack key={key} gap="sm">
                          {key === "early" && (
                            <Text size="xs" fw={800} c="dimmed" tt="uppercase" className="pickem-segment">
                              {label}
                            </Text>
                          )}
                          {segment.map(renderBout)}
                        </Stack>
                      );
                    })}
                  </Stack>
                </Collapse>
              </Stack>
            )}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }} className="pickem-col-board">
          <Stack gap="md">
            <Leagues selected={league} setSelected={setLeague} />
            <Rules />
          </Stack>
        </Grid.Col>
      </Grid>

      {!user && open && guest.picks.length > 0 && (
        <Paper p="sm" radius="md" className="pickem-guest-bar">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Text fw={700} lh={1.25} style={{ fontVariantNumeric: "tabular-nums" }}>
                {picked} of {mainBouts.length} picked
              </Text>
              <Text size="xs" c="dimmed">
                They're only on this device until you save them.
              </Text>
            </div>
            <Button onClick={() => setSigningIn(true)} style={{ flexShrink: 0 }}>
              Save my picks
            </Button>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}

/** After the event: the top three, and where you finished. */
function Results({ rows, me }: { rows: LeaderboardRow[]; me?: string }) {
  if (!rows.length) return null;
  const myRank = rows.findIndex((r) => r.displayName === me);
  const place = places(rows);
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
                · you finished <b style={{ color: "var(--mantine-color-white)" }}>#{place[myRank]}</b> with {rows[myRank]?.points} points
              </>
            )}
          </Text>
        </div>
        <Group gap="lg" wrap="wrap">
          {rows.slice(0, 3).map((r, i) => (
            <Group key={r.displayName} gap={8} wrap="nowrap" className="pickem-podium" renderRoot={(props) => <Link {...props} to={playerPath(r.displayName)} />}>
              <div style={{ position: "relative" }}>
                <PlayerAvatar name={r.displayName} avatar={r.avatar} size={i === 0 ? 48 : 40} style={{ border: `2px solid ${medals[place[i]! - 1]}` }} />
              </div>
              <div>
                <Text size="sm" fw={700} lh={1.2}>
                  {place[i]}. {r.displayName}
                  {r.displayName === MODEL_PLAYER && <ModelTag />}
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
          <b>+{POINTS.underdog}</b> if your winner was the bookies' underdog (under 50% in the odds, whatever our model says)
        </Text>
      </Stack>
      <Text size="sm" mt={8}>
        <b>Earn the card:</b> call a winner and you unlock their trading card. Call an underdog and it's <span className="shiny-text">shiny</span>.
      </Text>
      <Text size="sm" mt={4}>
        <b>Win packs:</b> finish in the top 3 on a card, or win a league of 3 or more, for a free pack of 3 random fighters. One per card.
      </Text>
      <Text size="xs" c="dimmed" mt={6}>
        Main card only: prelims are for fun. Picks save as you tap; change them until the card locks.
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
  pickedBy: MateWhoPicked[]; // league-mates who have picked (before the lock; not whom)
  split: PickSplit[string] | undefined; // how everyone picked (after the lock)
  leagueName: string; // whose faces these are
  onPick: (winner: string | null, method: Method | null) => void;
}

function Bout({ bout, label, choice, byId, chance, canPick, mates, pickedBy, split, leagueName, onPick }: BoutProps) {
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
            underdog={isUnderdog(bout, id) ? marketChance(bout, id) : null}
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
      <BoutFooter bout={bout} known={byId.has(bout.fighterA) && byId.has(bout.fighterB)} pickedBy={pickedBy} leagueName={leagueName} />
    </Paper>
  );
}

interface SideProps {
  id: string;
  name: string;
  fighter: PredictorFighter | undefined;
  chance: number | null; // the model's win chance for this fighter
  underdog: number | null; // the bookies' chance, when they have this fighter as the underdog
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
        {/* A row; on small phones the photo sits above the name, so names have the full width. */}
        <div className="pickem-side-body">
          <Avatar src={fighter?.image?.url} size={46} radius="xl" color="gray">
            {initials}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Text fw={700} lineClamp={2} lh={1.2}>
              {name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {chance !== null ? `Model ${Math.round(chance * 100)}%` : fighter ? fighter.weight_class : "UFC newcomer"}
              {underdog !== null && (
                <>
                  {" · "}
                  {/* The model's number and the bookies' can disagree: say whose underdog this is. */}
                  <Tooltip label={`Bookies give them ${Math.round(underdog * 100)}%: a win is worth +${POINTS.underdog}`} withArrow events={{ hover: true, focus: false, touch: true }}>
                    <span className="pickem-bonus">underdog</span>
                  </Tooltip>
                </>
              )}
            </Text>
          </div>
          {chosen && (
            // On phones the outline alone marks the pick, so the name keeps the room.
            <Text ml="auto" fw={800} size="sm" className="pickem-mark" visibleFrom={result === null ? "sm" : undefined}>
              {result === null ? "Your pick" : result ? "✓" : "✗"}
            </Text>
          )}
        </div>
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
    const how = new Map(backers.map((m) => [m.displayName, m.method]));
    return (
      <div className="pickem-faces">
        <Faces
          people={backers}
          tip={(name) => `${name}: ${surname(fighter)}${how.get(name) ? ` by ${METHOD_LABEL[how.get(name)!]}` : ""}`}
        />
      </div>
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

/** Up to four faces, then "+n"; each with its own tooltip. */
function Faces({ people, tip }: { people: { displayName: string; avatar: string | null }[]; tip: (name: string) => string }) {
  const shown = people.slice(0, 4);
  return (
    <Avatar.Group spacing={8}>
      {shown.map((m) => (
        <Tooltip key={m.displayName} label={tip(m.displayName)} withArrow events={{ hover: true, focus: false, touch: true }}>
          <PlayerAvatar name={m.displayName} avatar={m.avatar} size={24} />
        </Tooltip>
      ))}
      {people.length > shown.length && (
        <Tooltip label={people.slice(4).map((m) => m.displayName).join(", ")} withArrow events={{ hover: true, focus: false, touch: true }}>
          <Avatar size={24} radius="xl">
            +{people.length - shown.length}
          </Avatar>
        </Tooltip>
      )}
    </Avatar.Group>
  );
}

/** Under each bout: links to the site's deeper looks at the matchup, and (before the lock)
 * which league-mates have already picked it. */
function BoutFooter({ bout, known, pickedBy, leagueName }: { bout: PickemBout; known: boolean; pickedBy: MateWhoPicked[]; leagueName: string }) {
  if (!known && !pickedBy.length) return null;
  return (
    <Group gap="md" wrap="wrap" px={4} align="center">
      {known && (
        <>
          <Anchor component={Link} to={`/predictor?a=${bout.fighterA}&b=${bout.fighterB}`} size="xs" c="dimmed">
            Full prediction →
          </Anchor>
          <Anchor component={Link} to={`/mma-math?winner=${bout.fighterA}&loser=${bout.fighterB}`} size="xs" c="dimmed">
            MMA math →
          </Anchor>
        </>
      )}
      {pickedBy.length > 0 && (
        <Group gap={6} ml="auto" wrap="nowrap">
          <Text size="xs" c="dimmed" truncate maw={140}>
            {leagueName} picked
          </Text>
          <Faces people={pickedBy} tip={(name) => `${name} has picked: you'll see whom when the card locks`} />
        </Group>
      )}
    </Group>
  );
}
