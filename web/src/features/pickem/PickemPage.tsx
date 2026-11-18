// Pick'em: pick the winners on the next UFC card (and, for bonus points, how they win) before
// it locks, and see how you stack up against other fans. Everything account-related goes
// through useAuth() and the backend interface; fighter photos and the model's odds come from
// the predictor's data.

import "./Pickem.css";

import { Alert, Anchor, Avatar, Badge, Button, Center, Collapse, Grid, Group, Paper, SegmentedControl, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useIsMutating } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { LogoLoader, PageLoader } from "../../components/LogoLoader";
import { NewCards } from "../collection/NewCards";
import { PacksBanner } from "../collection/Packs";
import { guestStarters, useStarterBadges } from "../profile/starter";
import { StarterToast } from "../profile/StarterToast";
import { useClaimGuestPicks, useGuestPicks } from "./guestPicks";
import { Leagues, ModelTag, playerPath } from "./Leagues";
import { boutPoints, isUnderdog, marketChance, METHOD_LABEL, MODEL_PLAYER, places, POINTS, pointsFor, scores } from "./scoring";
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
  usePickSaves,
  usePickSplit,
  type SaveState,
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
  return <span className="pickem-clock">{timeLeft(new Date(until).getTime() - now)}</span>;
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
  const saves = usePickSaves();
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
  if (events.isPending || authLoading || (eventId && event.isPending)) return <PageLoader />;
  const failed = events.error ?? event.error;
  if (failed) return <Alert color="red" title="Couldn't load the card">{failed.message}</Alert>;
  if (!event.data) return <Alert title="No card yet">The next UFC card shows up here once it's announced.</Alert>;

  const { event: card, bouts } = event.data;
  const switching = event.isPlaceholderData;
  const lockIn = new Date(card.locksAt).getTime() - now;
  const open = lockIn > 0;
  // Signed out, picks live in this browser until there's an account to save them to.
  const mine = new Map((user ? (picks.data ?? []) : guest.picks).map((p) => [p.boutId, p]));
  // Being fought: locked, not all results in, and still fight day (or the night after).
  const live = !open && !card.scoredAt && now - new Date(card.locksAt).getTime() < 20 * 3600e3;
  const mainBouts = bouts.filter(scores);
  const prelims = bouts.filter((b) => !scores(b));
  const picked = mainBouts.filter((b) => mine.has(b.id)).length;
  const earned = bouts.reduce((n, b) => n + (boutPoints(b, mine.get(b.id)) ?? 0), 0);
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
        save={user ? saves.get(bout.id) : undefined}
        onPick={(winner, method) => (user ? pick.mutate({ boutId: bout.id, winner, method }) : guest.pick(bout.id, winner, method))}
      />
    );
  };

  return (
    <Stack gap={0} maw={1180} mx="auto" pt={4}>
      {/* The other cards, as tabs. */}
      {(events.data?.length ?? 0) > 1 && <CardTabs events={events.data!} chosen={eventId!} now={now} onChoose={choose} />}

      <Stack gap="md" className="pickem-banners">
        <StarterToast earned={user ? (profile ? starters.data : undefined) : guestStarters(guest.picks, mainBouts.map((b) => b.id))} guest={!user} />
        <NewCards />
        <PacksBanner />
        <InstallBar />
      </Stack>

      {/* While the next card loads, this one stays, dimmed, with the loader over it. */}
      <div className="pickem-sheet" data-loading={switching || undefined} aria-busy={switching}>
        {switching && (
          <div className="pickem-switching">
            <LogoLoader size={48} label="Loading the card" />
          </div>
        )}
        <Stack gap="lg">
          {/* The card's head, two lines: the name and the clock, then who's playing and how far
              they've got. */}
          <header className="pickem-form-head">
            <div style={{ minWidth: 0 }}>
              <h1>{card.name}</h1>
              <Text c="dimmed" size="sm">
                {dateLabel(card.startsOn)}, {bouts.length} fights
              </Text>
            </div>
            <div className="pickem-clock-box">
              {open ? (
                <>
                  <Countdown until={card.locksAt} card={card.name} />
                  <Text size="xs" c="dimmed">
                    until picks close, {lockLabel(card.locksAt)}
                  </Text>
                </>
              ) : live ? (
                <Badge size="lg" variant="filled" color="red" className="pickem-live">
                  ● Live
                </Badge>
              ) : (
                <>
                  <span className="pickem-clock" data-done>
                    {card.scoredAt ? "Results are in" : "Picks are locked"}
                  </span>
                  <Text size="xs" c="dimmed">
                    Closed {lockLabel(card.locksAt)}
                  </Text>
                </>
              )}
            </div>
            <div className="pickem-signed">
              <b>{profile?.displayName ?? "Not signed in"}</b>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {card.scoredAt ? `${earned} pts from ${picked} picks` : `${picked} of ${mainBouts.length} picked`}
              </span>
              {open && picked > 0 && user && <span className="pickem-saved">{saving ? "Saving…" : "Saved"}</span>}
            </div>
          </header>
          <nav className="pickem-form-links" aria-label="More on this card">
            <Link to={cardPage ? `/${cardPage}/` : "/cards/"}>{cardPage ? "Full card predictions" : "Upcoming card predictions"}</Link>
            <Link to="/fighters/">All fighters</Link>
          </nav>

          {/* Phones: the fights or the leagues, a tap apart, kept in reach while scrolling. */}
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
            <div className="pickem-notice">
              {live
                ? "The fights are on: results show up here as each one ends (this page checks every minute). Points and the final ranking come once the whole card is done."
                : "Picks are locked: no more changes. Points and the final ranking come in once the results are in, usually the morning after the fights."}
            </div>
          )}
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

          <Grid gap={40} className="pickem-columns" data-view={view}>
            <Grid.Col span={{ base: 12, md: 7 }} className="pickem-col-fights">
              <Stack gap="xl">
                <div>
                  <div className="pickem-segment">{prelims.length > 0 ? "Main card" : "The fights"}</div>
                  {mainBouts.map(renderBout)}
                </div>
                {prelims.length > 0 && (
                  // The prelims fold away: they're worth little, and a full card is a long scroll.
                  <div>
                    <UnstyledButton className="pickem-prelims-toggle" w="100%" onClick={() => setPrelimsOpen((o) => !o)} aria-expanded={prelimsOpen}>
                      <span>
                        <b>Prelims</b>, {prelims.length} {prelims.length === 1 ? "fight" : "fights"}, {POINTS.prelim} point each
                      </span>
                      <span className="pickem-chevron" data-open={prelimsOpen || undefined} aria-hidden>
                        ▾
                      </span>
                    </UnstyledButton>
                    <Collapse expanded={prelimsOpen}>
                      <Stack gap="lg" pt="sm">
                        {PRELIMS.map(({ key, label }) => {
                          const segment = prelims.filter((b) => b.segment === key);
                          if (!segment.length) return null;
                          return (
                            <div key={key}>
                              {key === "early" && <div className="pickem-segment">{label}</div>}
                              {segment.map(renderBout)}
                            </div>
                          );
                        })}
                      </Stack>
                    </Collapse>
                  </div>
                )}
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 5 }} className="pickem-col-board">
              <Stack gap="xl">
                <Leagues selected={league} setSelected={setLeague} />
                <Rules />
              </Stack>
            </Grid.Col>
          </Grid>

          {!user && open && guest.picks.length > 0 && (
            <Paper className="pickem-guest-bar">
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
      </div>
    </Stack>
  );
}

/** The cards as tabs, a red underline sliding to the chosen one (as in the menu bar). */
function CardTabs({ events, chosen, now, onChoose }: { events: PickemEvent[]; chosen: string; now: number; onChoose: (id: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const el = row.current?.querySelector<HTMLElement>("[data-chosen]");
      setBar(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    const id = requestAnimationFrame(() => setReady(true));
    const observer = new ResizeObserver(measure);
    if (row.current) observer.observe(row.current);
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
    };
  }, [chosen]);
  return (
    <div className="pickem-cards" ref={row}>
      {events.map((e) => (
        <UnstyledButton key={e.id} className="pickem-card-tab" data-chosen={e.id === chosen || undefined} data-numbered={isNumbered(e) || undefined} onClick={() => onChoose(e.id)}>
          {isLive(e, now) && <span className="pickem-live-dot" aria-label="live" />}
          {shortName(e)}
        </UnstyledButton>
      ))}
      {bar && <span className="pickem-cards-bar" data-ready={ready || undefined} style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} aria-hidden />}
    </div>
  );
}

/** Your pick, circled in pen. Drawn a little off and overshooting where it started, the way a
 * hand draws it, and drawn in front of you: the pen goes round in a third of a second. */
function Ring() {
  const path = useRef<SVGPathElement>(null);
  // How long the line is on screen. The ring stretches to fit the name, and its stroke keeps an
  // even width (non-scaling), so the dash that draws it is measured in screen pixels: walk the
  // path and scale each step to the ring's size.
  const [length, setLength] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  useLayoutEffect(() => {
    const p = path.current;
    const box = p?.ownerSVGElement?.getBoundingClientRect();
    if (!p || !box) return;
    const sx = box.width / 100;
    const sy = box.height / 40;
    const total = p.getTotalLength();
    let sum = 0;
    let last = p.getPointAtLength(0);
    for (let i = 1; i <= 64; i++) {
      const pt = p.getPointAtLength((total * i) / 64);
      sum += Math.hypot((pt.x - last.x) * sx, (pt.y - last.y) * sy);
      last = pt;
    }
    setLength(Math.ceil(sum) + 2);
  }, []);
  const drawing = length !== null && !drawn;
  return (
    <svg className="pickem-ring" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <path
        ref={path}
        vectorEffect="non-scaling-stroke"
        data-drawing={drawing || undefined}
        data-measuring={length === null || undefined}
        style={drawing ? ({ "--len": length } as CSSProperties) : undefined}
        onAnimationEnd={() => setDrawn(true)}
        d="M10 24C5 12 34 3 62 3.5 88 4 99 13 97 24 95 35 62 39 36 38 13 37 1 29 7 17 11 9 22 6 31 5"
      />
    </svg>
  );
}

/** After the event: the top three, and where you finished. */
function Results({ rows, me }: { rows: LeaderboardRow[]; me?: string }) {
  if (!rows.length) return null;
  const myRank = rows.findIndex((r) => r.displayName === me);
  const place = places(rows);
  const medals = ["#b07d0b", "#6f7884", "#a3542a"];
  return (
    <section className="pickem-results">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <h2 className="pickem-section-title">Final standings</h2>
          <Text size="sm" c="dimmed">
            {rows.length} {rows.length === 1 ? "player" : "players"}
            {myRank >= 0 && (
              <>
                {" "}
                · you finished <b>#{place[myRank]}</b> with {rows[myRank]?.points} points
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
                  {r.points} pts, {r.correct}/{r.picked} right
                </Text>
              </div>
            </Group>
          ))}
        </Group>
      </Group>
    </section>
  );
}

function Rules() {
  return (
    <section>
      <h2 className="pickem-section-title">Scoring</h2>
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
        Prelims: {POINTS.prelim} point for the right winner, no bonuses. Picks save as you tap; change them until the card locks.
      </Text>
    </section>
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
  save: SaveState | undefined; // this bout's latest save (signed in)
  onPick: (winner: string | null, method: Method | null) => void;
}

function Bout({ bout, label, choice, byId, chance, canPick, mates, pickedBy, split, leagueName, save, onPick }: BoutProps) {
  const choose = (id: string) => (choice?.winner === id ? onPick(null, null) : onPick(id, choice?.method ?? null));
  const points = boutPoints(bout, choice);
  const surname = (id: string) => (id === bout.fighterA ? bout.aName : bout.bName).split(" ").at(-1);
  return (
    <div className="pickem-bout" data-headline={label === "Main event" || undefined}>
      <SaveMark save={save} />
      {(label || bout.title) && (
        <Group gap={8} mb={6}>
          {label && <span className="pickem-bout-label">{label}</span>}
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
            bonus={scores(bout)}
            chosen={choice?.winner === id}
            winner={bout.outcome === "win" ? bout.winner : null}
            disabled={!canPick}
            onPick={choose}
            vs={i === 0}
          />
        ))}
      </Group>
      <Crowd bout={bout} mates={mates} split={split} surname={surname} />

      {choice && canPick && scores(bout) && (
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
      {bout.outcome && <Verdict bout={bout} choice={choice} points={points} surname={surname} />}
      <BoutFooter bout={bout} known={byId.has(bout.fighterA) && byId.has(bout.fighterB)} pickedBy={pickedBy} leagueName={leagueName} />
    </div>
  );
}

/** A pick's save, in the bout's top corner: "Saving…", then "Saved" for a moment, fading out.
 * A failed save stays until the next tap, since the pick was put back as it was. */
function SaveMark({ save }: { save: SaveState | undefined }) {
  if (!save) return null;
  // A save from a while ago (back on the page later) has nothing to say.
  if (save.state === "saved" && Date.now() - save.at > 4000) return null;
  return (
    <span key={`${save.state}-${save.at}`} className="pickem-save" data-state={save.state} role="status" aria-live="polite">
      {save.state === "saving" ? "Saving…" : save.state === "saved" ? "✓ Saved" : "Not saved. Check your connection and tap again."}
    </span>
  );
}

/** Once a fight is decided: who won and how, what you picked, and what it earned, in words. */
function Verdict({ bout, choice, points, surname }: { bout: PickemBout; choice: Pick | undefined; points: number | null; surname: (id: string) => string | undefined }) {
  const how = (method: Method | null) => (method ? METHOD_LABEL[method] : "other");
  if (bout.outcome !== "win" || !bout.winner) {
    return (
      <Text size="xs" fw={700} px={4} mb={6}>
        {bout.outcome === "draw" ? "Draw" : "No contest"}: no points either way
      </Text>
    );
  }
  const won = `${surname(bout.winner)} won by ${how(bout.method)}`;
  const right = choice?.winner === bout.winner;
  // On the main card your method counts too: say how yours compared.
  const yourHow = choice?.method && scores(bout) ? (choice.method === bout.method ? "method right" : `you said ${how(choice.method)}`) : null;
  return (
    <Group gap="xs" px={4} mb={6} wrap="nowrap" justify="space-between" className="pickem-verdict" data-right={choice ? right : undefined}>
      <Text size="xs" style={{ minWidth: 0 }}>
        {!choice ? (
          <b>{won}</b>
        ) : right ? (
          <>
            <b>✓ You called it:</b> {won}
            {yourHow && ` · ${yourHow}`}
          </>
        ) : (
          <>
            <b>✗ You picked {surname(choice.winner)}</b>
            {choice.method && ` by ${how(choice.method)}`}. {won}.
          </>
        )}
      </Text>
      {choice && points !== null && (
        <Text size="xs" fw={800} c={points ? "var(--good)" : "dimmed"} style={{ whiteSpace: "nowrap" }} title={pointsFor(bout, choice).join(" + ")}>
          {points ? `+${points}` : "0 pts"}
          {points > 0 && (
            <Text span size="xs" fw={500} c="dimmed">
              {" "}
              {pointsFor(bout, choice).join(" + ")}
            </Text>
          )}
        </Text>
      )}
    </Group>
  );
}

interface SideProps {
  id: string;
  name: string;
  fighter: PredictorFighter | undefined;
  chance: number | null; // the model's win chance for this fighter
  underdog: number | null; // the bookies' chance, when they have this fighter as the underdog
  bonus: boolean; // a win as the underdog earns the bonus (main card only)
  chosen: boolean;
  winner: string | null; // the result, once in
  disabled: boolean;
  onPick: (id: string) => void;
  vs: boolean; // draw "vs" after this side
}

/** One fighter in a bout: tap to pick them. After the event: a tick or a cross on your pick. */
function Side({ id, name, fighter, chance, underdog, bonus, chosen, winner, disabled, onPick, vs }: SideProps) {
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
          {chosen && <Ring />}
          <Avatar src={fighter?.image?.url} size={46} radius="xl" color="gray">
            {initials}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Text className="pickem-name" lineClamp={2}>
              {name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {chance !== null ? `Model ${Math.round(chance * 100)}%` : fighter ? fighter.weight_class : "UFC newcomer"}
              {underdog !== null && (
                <>
                  {" · "}
                  {/* The model's number and the bookies' can disagree: say whose underdog this is. */}
                  <Tooltip label={`Bookies give them ${Math.round(underdog * 100)}%${bonus ? `: a win is worth +${POINTS.underdog}` : ""}`} withArrow events={{ hover: true, focus: false, touch: true }}>
                    <span className="pickem-bonus">underdog</span>
                  </Tooltip>
                </>
              )}
            </Text>
          </div>
          {/* Once decided, each side says what it was: the winner, and your pick (right or not). */}
          {result !== null && (result || chosen) && (
            <div className="pickem-tags">
              {result && <span className="pickem-tag" data-kind="won">Won</span>}
              {chosen && <span className="pickem-tag" data-kind={result ? "right" : "wrong"}>{result ? "✓ your pick" : "✗ your pick"}</span>}
            </div>
          )}
        </div>
      </UnstyledButton>
      {vs && (
        <Center>
          <Text size="sm" c="dimmed">
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
            Full prediction
          </Anchor>
          <Anchor component={Link} to={`/mma-math?winner=${bout.fighterA}&loser=${bout.fighterB}`} size="xs" c="dimmed">
            MMA math
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
