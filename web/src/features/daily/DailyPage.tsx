// The daily fighter: guess today's hidden fighter. Every guess shows its place by closeness in
// the style embedding, #1 being the fighter; keep guessing until #1. Two a day, the same for
// everyone; progress is kept in this browser.

import "./Daily.css";

import { Alert, Avatar, Button, Group, Select, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { PageLoader } from "../../components/LogoLoader";
import { useStyleMap } from "../../data/client";
import type { Fighter } from "../../data/types";
import { FighterTradingCard } from "../predictor/FighterTradingCard";
import { answerFor, closeness, dayOf, inPlay, over, puzzleNumber, ROUNDS, type RoundState, solved, warmth, weightHint } from "./daily";

const STYLE_HINT_AFTER = 10;
// v4: men's champions and top 3, weight-first places (older rounds came from earlier versions)
const key = (day: string, round: number) => `daily:v4:${day}:${round}`;

function load(day: string, round: number): RoundState | null {
  try {
    const raw = localStorage.getItem(key(day, round));
    return raw ? (JSON.parse(raw) as RoundState) : null;
  } catch {
    return null;
  }
}
function save(day: string, round: number, s: RoundState) {
  try {
    localStorage.setItem(key(day, round), JSON.stringify(s));
  } catch {
    // private mode: the round just isn't kept
  }
}

const dateLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function DailyPage() {
  const { data, error, isPending } = useStyleMap();
  const day = useMemo(() => dayOf(), []);
  const [round, setRound] = useState(() => (load(day, 0) && over(load(day, 0)!) ? 1 : 0));
  const [, saved] = useState(0); // a round saved its progress: redraw the rounds' ticks
  const fighters = useMemo(() => (data ? inPlay(data.fighters) : []), [data]);

  if (isPending) return <PageLoader />;
  if (error || !data) return <Alert color="red" title="Couldn't load today's fighter">{error?.message}</Alert>;

  return (
    <Stack gap="md" maw={560} mx="auto" pt={4} pb="xl" className="daily">
      <div>
        <Title order={2} lh={1.1}>
          Daily fighter
        </Title>
        <Text size="sm" c="dimmed" mt={2}>
          #{puzzleNumber(day)} · {dateLabel(day)} · new fighters at midnight (Berlin)
        </Text>
      </div>
      <Group gap={0} className="daily-rounds" role="tablist">
        {Array.from({ length: ROUNDS }, (_, r) => {
          const s = load(day, r);
          return (
            <UnstyledButton key={r} className="daily-round" data-on={round === r || undefined} onClick={() => setRound(r)} role="tab" aria-selected={round === r}>
              Fighter {r + 1}
              {s && solved(s) && <span className="daily-round-done"> ✓</span>}
            </UnstyledButton>
          );
        })}
      </Group>
      <Round
        key={`${day}-${round}`}
        fighters={fighters}
        clusters={data.clusters}
        day={day}
        round={round}
        onSaved={() => saved((n) => n + 1)}
        onNext={round + 1 < ROUNDS ? () => setRound(round + 1) : undefined}
      />
    </Stack>
  );
}

function Round({ fighters, clusters, day, round, onSaved, onNext }: { fighters: Fighter[]; clusters: { id: number; name: string }[]; day: string; round: number; onSaved: () => void; onNext?: () => void }) {
  const byId = useMemo(() => new Map(fighters.map((f) => [f.id, f])), [fighters]);
  const [state, setState] = useState<RoundState | null>(() => {
    const kept = load(day, round);
    if (kept && byId.has(kept.answer)) return kept;
    const answer = answerFor(fighters, day, round);
    return answer ? { answer: answer.id, guesses: [], hints: [], gaveUp: false } : null;
  });
  useEffect(() => {
    if (!state) return;
    save(day, round, state);
    onSaved();
  }, [state, day, round]);
  const answer = state ? byId.get(state.answer) : undefined;
  const places = useMemo(() => (answer ? closeness(fighters, answer) : new Map<string, number>()), [fighters, answer]);
  const options = useMemo(
    () =>
      [...fighters]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({ value: f.id, label: f.name, disabled: !!state?.guesses.includes(f.id) })),
    [fighters, state?.guesses],
  );
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState(""); // cleared after each guess, ready for the next
  const [open, setOpen] = useState<string | null>(null); // the guess whose card is showing
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  if (!state || !answer) return <Text c="dimmed">No fighter today: the map's data is missing its rankings.</Text>;

  const total = fighters.length;
  const done = over(state);
  const found = solved(state);
  const guesses = state.guesses.filter((id) => byId.has(id));
  const last = guesses.at(-1);
  const ranked = [...guesses].sort((a, b) => places.get(a)! - places.get(b)!);
  const best = ranked[0];
  const style = clusters.find((c) => c.id === answer.cluster)?.name;
  const update = (s: Partial<RoundState>) => setState({ ...state, ...s });
  const guess = (id: string | null) => {
    setSearch("");
    if (id && !state.guesses.includes(id)) update({ guesses: [...state.guesses, id] });
  };
  const hint = (h: "division" | "style") => !state.hints.includes(h) && update({ hints: [...state.hints, h] });

  const share = async () => {
    const text =
      `UFC Embedded daily fighter #${puzzleNumber(day)}, fighter ${round + 1}: ` +
      (found ? `found in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}` : `gave up after ${guesses.length}`) +
      (state.hints.length ? ` (${state.hints.length} ${state.hints.length === 1 ? "hint" : "hints"})` : "") +
      `\n${window.location.origin}${import.meta.env.BASE_URL}daily`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // closed the share sheet
    }
  };

  return (
    <Stack gap="md">
      {done ? (
        <div className="daily-reveal">
          <div className="daily-reveal-card">
            <FighterTradingCard id={answer.id} fallback={<Avatar src={answer.image?.url} size={120} radius="sm" />} />
          </div>
          <Stack gap={6} className="daily-reveal-text">
            <Text size="sm" c="dimmed">
              {found ? "Found it" : "It was"}
            </Text>
            <Title order={3} lh={1.1}>
              {answer.name}
            </Title>
            <Text size="sm" c="dimmed">
              {answer.champion ? `${answer.champion} champion` : `#${answer.rank} ${answer.weight_class}`} · {style}
            </Text>
            <Text fw={700} mt={4}>
              {found ? `${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}` : `Gave up after ${guesses.length}`}
              {state.hints.length > 0 && <Text span c="dimmed" fw={400}> · {state.hints.length} {state.hints.length === 1 ? "hint" : "hints"}</Text>}
            </Text>
            <Group gap="xs" mt={6}>
              <Button size="xs" onClick={share}>
                {copied ? "Copied" : "Share result"}
              </Button>
              {onNext && (
                <Button size="xs" variant="default" onClick={onNext}>
                  Next fighter
                </Button>
              )}
            </Group>
          </Stack>
        </div>
      ) : (
        <>
          {guesses.length === 0 && (
            <Text size="sm" c="dimmed">
              Guess today's hidden fighter, a champion or top-3 fighter from the men's divisions. Every guess gets a place, #1 being the fighter: weight first (the right division is always closer), then fighting style. The arrow says whether the fighter is heavier or lighter.
            </Text>
          )}
          <Select
            size="md"
            radius="sm"
            searchable
            placeholder="Guess a fighter"
            data={options}
            value={null}
            onChange={guess}
            searchValue={search}
            onSearchChange={setSearch}
            limit={40}
            nothingFoundMessage="No fighter by that name"
            renderOption={({ option }) => (
              <Group gap={8} wrap="nowrap">
                <Avatar src={byId.get(option.value)?.image?.url} size={24} radius="xl" />
                <span>{option.label}</span>
              </Group>
            )}
            aria-label="Guess a fighter"
            spellCheck={false}
          />
        </>
      )}

      {(guesses.length > 0 || state.hints.length > 0) && (
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Text size="sm" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
            {guesses.length} {guesses.length === 1 ? "guess" : "guesses"}
            {best && !found && <> · closest #{places.get(best)}</>}
          </Text>
          {!done && (
            <Group gap="md">
              {!state.hints.includes("style") && (
                <UnstyledButton className="daily-link" disabled={guesses.length < STYLE_HINT_AFTER} onClick={() => hint("style")}>
                  Style hint{guesses.length < STYLE_HINT_AFTER ? ` in ${STYLE_HINT_AFTER - guesses.length}` : ""}
                </UnstyledButton>
              )}
              {guesses.length > 0 && (
                <UnstyledButton className="daily-link" onClick={() => update({ gaveUp: true })}>
                  Give up
                </UnstyledButton>
              )}
            </Group>
          )}
        </Group>
      )}

      {!done && state.hints.length > 0 && (
        <Group gap="xs">
          {state.hints.includes("division") && <span className="daily-hint">Division: {answer.weight_class}</span>}
          {state.hints.includes("style") && <span className="daily-hint">Style: {style}</span>}
        </Group>
      )}

      {guesses.length > 0 && (
        <div className="daily-guesses">
          {/* The latest guess on top while playing, so you see what it just scored. */}
          {!done && last && last !== best && (
            <>
              <Guess fighter={byId.get(last)!} answer={answer} place={places.get(last)!} total={total} latest open={open === `last:${last}`} onToggle={() => toggle(`last:${last}`)} />
              <div className="daily-rule" />
            </>
          )}
          {ranked.map((id) => (
            <Guess key={id} fighter={byId.get(id)!} answer={answer} place={places.get(id)!} total={total} latest={id === last && !done} open={open === id} onToggle={() => toggle(id)} />
          ))}
        </div>
      )}
    </Stack>
  );
}

const WEIGHT = { heavier: ["↑", "Heavier"], lighter: ["↓", "Lighter"], same: ["=", "Same division"] } as const;

function Guess({ fighter, answer, place, total, latest, open, onToggle }: { fighter: Fighter; answer: Fighter; place: number; total: number; latest?: boolean; open: boolean; onToggle: () => void }) {
  const dir = weightHint(fighter, answer);
  const heat = place === 1 ? "found" : place <= 10 ? "hot" : place <= 100 ? "warm" : "cold";
  return (
    <>
      <UnstyledButton className="daily-guess" data-heat={heat} data-latest={latest || undefined} data-open={open || undefined} onClick={onToggle} aria-expanded={open} title={open ? undefined : `${fighter.name}: show card`}>
        <span className="daily-place">#{place}</span>
        <Avatar src={fighter.image?.url} size={28} radius="xl">
          {fighter.name[0]}
        </Avatar>
        <span className="daily-name">{fighter.name}</span>
        {place === 1 ? (
          <span />
        ) : (
          <span className="daily-weight" data-dir={dir} title={WEIGHT[dir][1]}>
            {WEIGHT[dir][0]} <span className="daily-weight-label">{WEIGHT[dir][1].toLowerCase()}</span>
          </span>
        )}
        <span className="daily-bar" aria-hidden>
          <span style={{ width: `${Math.max(3, warmth(place, total) * 100)}%` }} />
        </span>
      </UnstyledButton>
      {open && (
        <div className="daily-guess-card">
          <div className="daily-guess-card-inner">
            <FighterTradingCard id={fighter.id} fallback={<Text size="sm" c="dimmed">No card: {fighter.name} has no fight in the last five years.</Text>} />
          </div>
        </div>
      )}
    </>
  );
}
