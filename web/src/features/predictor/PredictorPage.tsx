import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Center,
  Container,
  Grid,
  Group,
  Loader,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { lazy, type ReactNode, Suspense, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { useMmaMath, usePredictor, useStyleMap } from "../../data/client";
import type { MmaMathData, PredictorData, PredictorFighter } from "../../data/types";
import { FighterTradingCard } from "./FighterTradingCard";
import { styleLabel } from "./TradingCard";
import { commonOpponents, contributions, headToHead, outcomes, sharedRecord, winProb } from "./model";
import { canFight, defaultOpponent } from "./matchup";
import { OutcomeReveal } from "./OutcomeReveal";
import { useCountUp } from "./useCountUp";
import "./Chapters.css";
import "./Verdict.css";

// Loaded only on wide screens: the physics engine is the biggest download on the site.
const HeavyBag = lazy(() => import("../heavy-bag/HeavyBag"));
const BAG_STRIP = 160; // px kept free on each side of the fight for a bag

const DEFAULT = ["islam-makhachev", "ilia-topuria"];
const A_COLOR = "red.6";
const B_COLOR = "blue.6";

// Tale of the tape rows: feature, label, formatter, which direction is better (if any).
const TAPE: [string, string, (v: number) => string, "high" | "low" | null][] = [
  ["elo", "Elo rating", (v) => String(v), "high"],
  ["ufc_fights", "UFC fights", (v) => String(v), null],
  ["win_streak", "Win streak", (v) => String(v), "high"],
  ["age", "Age", (v) => v.toFixed(1), null],
  ["height", "Height", (v) => `${Math.round(v)} cm`, null],
  ["reach", "Reach", (v) => `${Math.round(v)} cm`, "high"],
  ["slpm", "Strikes landed / min", (v) => v.toFixed(2), "high"],
  ["sapm", "Strikes absorbed / min", (v) => v.toFixed(2), "low"],
  ["str_def", "Strike defence", (v) => `${Math.round(v * 100)}%`, "high"],
  ["td15", "Takedowns / 15 min", (v) => v.toFixed(2), "high"],
  ["td_def", "Takedown defence", (v) => `${Math.round(v * 100)}%`, "high"],
  ["sub15", "Sub attempts / 15 min", (v) => v.toFixed(2), "high"],
  ["kd15", "Knockdowns / 15 min", (v) => v.toFixed(2), "high"],
  ["finished_rate", "Gets finished", (v) => `${Math.round(v * 100)}%`, "low"],
  ["layoff_years", "Time since last fight", (v) => `${v.toFixed(1)} y`, "low"],
];

export default function PredictorPage() {
  const { data, error, isPending } = usePredictor();
  const mma = useMmaMath().data;
  const [params, setParams] = useSearchParams();
  const fightRef = useRef<HTMLDivElement>(null);
  // The bag needs free space beside the cards; skip it (and its download) on smaller screens.
  const wide = useMediaQuery("(min-width: 75em)");
  // With the bags, the fight narrows to leave a strip on each side (the cards scale down to
  // fit); a bag hangs in the middle of each strip.
  const { width: viewportWidth } = useViewportSize();
  const fightWidth = wide && viewportWidth ? Math.min(1140, viewportWidth - 2 * BAG_STRIP) : undefined;
  const bagAt = fightWidth ? 1 - (viewportWidth - fightWidth) / 4 / viewportWidth : 0.9;

  const byId = useMemo(() => new Map(data?.fighters.map((f) => [f.id, f])), [data]);
  // Champions and ranked fighters first, then by Elo, so the lists open on names people know.
  const sorted = useMemo(
    () => [...(data?.fighters ?? [])].sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99) || y.elo - x.elo),
    [data],
  );
  const toOption = (f: PredictorFighter) => ({ value: f.id, label: f.name });

  if (isPending) return <Center h="60vh"><Loader /></Center>;
  if (error) return <Alert color="red" title="Could not load the predictor">{error.message}</Alert>;

  const aId = params.get("a") ?? DEFAULT[0]!;
  const a = byId.get(aId);
  // B must be a realistic opponent for A (see matchup.ts); otherwise suggest one.
  const asked = byId.get(params.get("b") ?? DEFAULT[1]!);
  const b =
    a && (!asked || !canFight(a.weight_class, asked.weight_class)) ? (defaultOpponent(a, sorted) ?? asked) : asked;
  const bId = b?.id ?? "";
  const options = sorted.map(toOption);
  // A can be anyone; B only lists realistic opponents for A (same gender, at most one
  // division apart). If A changes to someone B can't fight, B switches to a fitting opponent.
  const allowed = a ? sorted.filter((f) => f.id !== a.id && canFight(a.weight_class, f.weight_class)) : [];
  // Nobody fits (a fighter with no known division): don't leave the list empty.
  const bOptions = allowed.length ? allowed.map(toOption) : options;
  const set = (side: "a" | "b", id: string | null) => {
    const picked = id ? byId.get(id) : undefined;
    if (!picked) return;
    if (side === "b") {
      setParams({ a: aId, b: picked.id }, { replace: true });
      return;
    }
    const fits = b && b.id !== picked.id && canFight(picked.weight_class, b.weight_class);
    const opponent = fits ? b : defaultOpponent(picked, sorted);
    setParams({ a: picked.id, b: opponent?.id ?? bId }, { replace: true });
  };

  const matchup = a && b && a.id !== b.id;
  const next = (id: string, label: string) => (
    <Button
      className="chapter-next"
      variant="subtle"
      color="gray"
      size="compact-sm"
      rightSection="↓"
      onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
    >
      {label}
    </Button>
  );

  // Two chapters revealed by scrolling (see Chapters.css): the fight, then the analysis.
  return (
    <>
      <Box component="section" className="chapter" pos="relative" ref={fightRef}>
        {/* Punchable heavy bags in the empty space either side of the fight (wide screens only). */}
        {wide && (
          <Suspense fallback={null}>
            <HeavyBag eventSource={fightRef} at={[1 - bagAt, bagAt]} />
          </Suspense>
        )}
        <Container size={fightWidth ?? "lg"} w="100%" pos="relative" style={{ zIndex: 1 }}>
        <Stack gap="md" className={matchup ? "chapter-leave" : undefined}>
          <Title order={2} data-content style={{ alignSelf: "flex-start" }}>Fight predictor</Title>
          <Grid align="stretch">
            <Grid.Col span={{ base: 12, md: 3.75 }}>
              <FighterCard fighter={a} options={options} value={aId} onChange={(v) => set("a", v)} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4.5 }}>
              <Stack h="100%" justify="center" gap="md" py="md" data-content>
                {matchup && <Verdict key={`${a.id}-${b.id}`} data={data} a={a} b={b} />}
                <Center>
                  <Tooltip label="Swap corners" withArrow>
                    <ActionIcon variant="light" size="lg" onClick={() => setParams({ a: bId, b: aId }, { replace: true })} aria-label="Swap fighters">
                      ⇄
                    </ActionIcon>
                  </Tooltip>
                </Center>
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3.75 }}>
              <FighterCard fighter={b} options={bOptions} value={bId} onChange={(v) => set("b", v)} />
            </Grid.Col>
          </Grid>
          {matchup ? (
            <Center>
              <Box data-content>{next("analysis", "Breakdown")}</Box>
            </Center>
          ) : (
            <Text c="dimmed">Pick two different fighters.</Text>
          )}
        </Stack>
        </Container>
      </Box>

      {matchup && (
        // Wider than the fight above, so three panels fit side by side.
        <Container size="xl" component="section" className="chapter" id="analysis">
          <Stack gap="lg" className="chapter-arrive">
            <Grid align="stretch">
              <Grid.Col span={{ base: 12, md: 6, lg: 4 }} className="from-left">
                <Breakdown data={data} a={a} b={b} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 4 }} order={{ base: 3, lg: 2 }}>
                <TaleOfTheTape data={data} a={a} b={b} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6, lg: 4 }} order={{ base: 2, lg: 3 }} className="from-right">
                <Notes data={data} mma={mma} a={a} b={b} />
              </Grid.Col>
            </Grid>
            <Text size="xs" c="dimmed" ta="center" maw={760} mx="auto">
              Logistic regression on pre-fight stats and ratings, trained on fights up to {data.trained_until};
              fighter stats as of {data.fights_until}. Opponents are limited to the same gender and at most one
              division apart: the UFC has never had bigger gaps, so the model has nothing to go on there. On
              2022–23 fights it picked {Math.round((data.validation.logistic?.accuracy ?? 0) * 100)}% of winners
              (betting market: {Math.round((data.validation.market?.accuracy ?? 0) * 100)}%). Just for fun, not
              betting advice.
            </Text>
          </Stack>
        </Container>
      )}
    </>
  );
}

function value(data: PredictorData, f: PredictorFighter, feature: string): number {
  // Elo is shown on the cards and the ladder; the win model may use a different rating.
  if (feature === "elo") return f.elo;
  return f.x[data.win_model.inputs.indexOf(feature)] ?? 0;
}

interface CardProps {
  fighter?: PredictorFighter;
  options: { value: string; label: string }[];
  value: string;
  onChange: (id: string | null) => void;
}

function FighterCard({ fighter, options, value: id, onChange }: CardProps) {
  return (
    <Stack gap="sm" maw={320} mx="auto" w="100%" data-content>
      <Select searchable limit={200} data={options} value={id} onChange={onChange} placeholder="Pick a fighter" />
      {fighter && <FighterTradingCard id={fighter.id} />}
    </Stack>
  );
}

const methodName = (m: string) => ({ "KO/TKO": "KO/TKO", SUB: "submission", DEC: "decision" })[m] ?? m;

/** The headline, between the two cards: win probabilities and the single most likely outcome. */
const FILL_MS = 1100;

function Verdict({ data, a, b }: { data: PredictorData; a: PredictorFighter; b: PredictorFighter }) {
  const pA = winProb(data.win_model, a, b);
  const best = outcomes(data, a, b)[0]!;
  const bestColor = best.winner.id === a.id ? A_COLOR : B_COLOR;
  // Both sides count up from 0 and the bar fills in from each end until they meet.
  const t = useCountUp(`${a.id}-${b.id}`, FILL_MS);
  return (
    // A size container: the numbers and the outcome box scale with the column (cqw units).
    <Stack gap="sm" style={{ containerType: "inline-size" }}>
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Text fw={800} lh={1} c={A_COLOR} style={{ fontVariantNumeric: "tabular-nums", fontSize: "clamp(26px, 11cqw, 40px)" }}>
          {Math.round(pA * 100 * t)}%
        </Text>
        <Text size="xs" tt="uppercase" fw={700} c="dimmed" ta="center" style={{ letterSpacing: 1, whiteSpace: "nowrap" }}>
          Win chance
        </Text>
        <Text fw={800} lh={1} c={B_COLOR} style={{ fontVariantNumeric: "tabular-nums", fontSize: "clamp(26px, 11cqw, 40px)" }}>
          {Math.round((1 - pA) * 100 * t)}%
        </Text>
      </Group>
      <Progress.Root size={12} transitionDuration={0}>
        <Progress.Section value={pA * 100 * t} color={A_COLOR} />
        <Progress.Section value={100 * (1 - t)} color="transparent" />
        <Progress.Section value={(1 - pA) * 100 * t} color={B_COLOR} />
      </Progress.Root>
      <OutcomeReveal
        key={best.method + best.winner.id}
        method={best.method}
        name={best.winner.name}
        p={best.p}
        color={`var(--mantine-color-${bestColor.replace(".", "-")})`}
        delayMs={FILL_MS * 0.8}
      />
    </Stack>
  );
}

/** Details below the cards: every outcome and the stats behind the call. */
function Breakdown({ data, a, b }: { data: PredictorData; a: PredictorFighter; b: PredictorFighter }) {
  const all = outcomes(data, a, b);
  const labels = data.feature_labels;
  const contrib = contributions(data.win_model, a, b).map((c, i) => ({ c, label: labels[data.win_model.inputs[i]!] ?? "" }));
  const edges = (sign: 1 | -1) =>
    contrib
      .filter((x) => x.c * sign > 0.03)
      .sort((x, y) => y.c * sign - x.c * sign)
      .slice(0, 3)
      .map((x) => x.label);

  return (
    <Paper withBorder p="lg" h="100%">
      <Stack gap="md">
        <Title order={4}>Breakdown</Title>
        <Grid>
          <Grid.Col span={{ base: 12, xl: 6 }}>
            <Stack gap={6}>
              {all.map((o) => (
                <div key={`${o.winner.id}-${o.method}`}>
                  <Group justify="space-between">
                    <Text size="sm">
                      {o.winner.name} by {methodName(o.method)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {Math.round(o.p * 100)}%
                    </Text>
                  </Group>
                  <Progress value={o.p * 100} color={o.winner.id === a.id ? A_COLOR : B_COLOR} size="sm" />
                </div>
              ))}
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, xl: 6 }}>
            <Stack gap="xs">
              <Text fw={600} size="sm">
                What drives the call
              </Text>
              {[
                [a, edges(1), A_COLOR],
                [b, edges(-1), B_COLOR],
              ].map(([f, list, color]) => (
                <Box key={(f as PredictorFighter).id}>
                  <Text size="sm" c={color as string} fw={600}>
                    {(f as PredictorFighter).name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {(list as string[]).length ? (list as string[]).join(", ") : "No clear edges"}
                  </Text>
                </Box>
              ))}
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Paper>
  );
}

function TaleOfTheTape({ data, a, b }: { data: PredictorData; a: PredictorFighter; b: PredictorFighter }) {
  const fmtRecord = (f: PredictorFighter) => `${f.record.wins}-${f.record.losses}-${f.record.draws}`;
  return (
    <Paper withBorder p="lg" h="100%">
      <Title order={4} mb="md" ta="center">
        Tale of the tape
      </Title>
      <Table striped withRowBorders={false} fz="sm" horizontalSpacing="xs">
        <Table.Tbody>
          <Table.Tr>
            <Table.Td ta="right" fw={600}>{fmtRecord(a)}</Table.Td>
            <Table.Td ta="center" c="dimmed">Pro record</Table.Td>
            <Table.Td fw={600}>{fmtRecord(b)}</Table.Td>
          </Table.Tr>
          {TAPE.map(([key, label, fmt, better]) => {
            const va = value(data, a, key);
            const vb = value(data, b, key);
            const aBetter = better && va !== vb && (better === "high" ? va > vb : va < vb);
            const bBetter = better && va !== vb && !aBetter;
            return (
              <Table.Tr key={key}>
                <Table.Td ta="right" fw={aBetter ? 700 : 400} c={aBetter ? A_COLOR : undefined}>
                  {fmt(va)}
                </Table.Td>
                <Table.Td ta="center" c="dimmed">
                  {label}
                </Table.Td>
                <Table.Td fw={bBetter ? 700 : 400} c={bBetter ? B_COLOR : undefined}>
                  {fmt(vb)}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

function Notes({ data, mma, a, b }: { data: PredictorData; mma?: MmaMathData; a: PredictorFighter; b: PredictorFighter }) {
  const styleMap = useStyleMap().data;
  const last = (f: PredictorFighter) => f.name.split(" ").at(-1) ?? f.name;
  const corner = (f: PredictorFighter) => <Text span inherit fw={700} c={f.id === a.id ? A_COLOR : B_COLOR}>{last(f)}</Text>;
  const other = (f: PredictorFighter) => (f.id === a.id ? b : a);
  const byId = (id: string) => (id === a.id ? a : b);
  const v = (f: PredictorFighter, k: string) => value(data, f, k);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const division = (f: PredictorFighter) => f.weight_class.replace("Women's ", "").toLowerCase();
  const meetings = mma ? headToHead(mma, a.id, b.id) : [];
  const common = mma ? commonOpponents(mma, a.id, b.id) : [];

  // Facts as label + sentence rows, most telling first. Only notable things get a row.
  const rows: [string, ReactNode][] = [];

  if (meetings.length) {
    const wins = (f: PredictorFighter) => meetings.filter((m) => m.winnerId === f.id).length;
    const leader = wins(a) === wins(b) ? null : wins(a) > wins(b) ? a : b;
    rows.push([
      "History",
      <Stack gap={2}>
        {leader && meetings.length > 1 && (
          <span>
            {corner(leader)} leads the series {wins(leader)}–{wins(other(leader))}.
          </span>
        )}
        {meetings.map((m) => (
          <span key={m.date}>
            {m.date.slice(0, 4)}: {corner(byId(m.winnerId))} won by {m.method}
            {m.round ? ` in round ${m.round}` : ""}.
          </span>
        ))}
      </Stack>,
    ]);
  }

  const champ = [a, b].find((f) => f.champion);
  if (champ) {
    const challenger = other(champ);
    rows.push([
      "Title",
      <>
        {corner(champ)} holds the {champ.champion?.toLowerCase()} belt
        {challenger.champion
          ? <>, {corner(challenger)} the {challenger.champion.toLowerCase()} one: champion vs champion.</>
          : challenger.rank !== null
            ? <>; {corner(challenger)} is ranked #{challenger.rank} at {division(challenger)}.</>
            : "."}
      </>,
    ]);
  } else if (a.rank !== null && b.rank !== null) {
    rows.push(["Rankings", <>{corner(a)} is #{a.rank} at {division(a)}, {corner(b)} #{b.rank} at {division(b)}.</>]);
  }

  if (a.weight_class !== b.weight_class) {
    const order = ["Strawweight", "Flyweight", "Bantamweight", "Featherweight", "Lightweight", "Welterweight", "Middleweight", "Light Heavyweight", "Heavyweight"];
    const rank = (f: PredictorFighter) => order.indexOf(f.weight_class.replace("Women's ", ""));
    const lighter = rank(a) < rank(b) ? a : b;
    rows.push([
      "Divisions",
      <>
        {corner(other(lighter))} fights at {division(other(lighter))}, {corner(lighter)} one division down at{" "}
        {division(lighter)}: {corner(lighter)} would be moving up.
      </>,
    ]);
  }

  const style = (f: PredictorFighter) => {
    const s = styleMap?.fighters.find((x) => x.id === f.id);
    return styleLabel(styleMap?.clusters.find((c) => c.id === s?.cluster)?.name);
  };
  const [sa, sb] = [style(a), style(b)];
  if (sa && sb) {
    rows.push([
      "Styles",
      sa === sb ? (
        <>Both are {sa.toLowerCase()}s on the style map.</>
      ) : (
        <>
          {corner(a)} is a {sa.toLowerCase()}, {corner(b)} a {sb.toLowerCase()} on the style map.
        </>
      ),
    ]);
  }

  const form = [a, b].flatMap((f) => {
    const w = v(f, "win_streak");
    const l = v(f, "loss_streak");
    if (w >= 3) return [<span key={f.id}>{corner(f)} has won {w} in a row.</span>];
    if (l >= 2) return [<span key={f.id}>{corner(f)} has lost {l} in a row.</span>];
    return [];
  });
  if (form.length) rows.push(["Form", <Stack gap={2}>{form}</Stack>]);

  const danger = [a, b].flatMap((f) => {
    const opp = other(f);
    const ko = v(f, "ko_win_rate");
    const sub = v(f, "sub_win_rate");
    const out: ReactNode[] = [];
    if (ko >= 0.35) out.push(<span key={`${f.id}-ko`}>{corner(f)} has won {pct(ko)} of UFC fights by knockout{v(opp, "finished_rate") >= 0.2 ? <>, and {corner(opp)} has been finished in {pct(v(opp, "finished_rate"))}</> : ""}.</span>);
    else if (sub >= 0.25) out.push(<span key={`${f.id}-sub`}>{corner(f)} has won {pct(sub)} of UFC fights by submission.</span>);
    return out;
  });
  if (danger.length) rows.push(["Finishing", <Stack gap={2}>{danger}</Stack>]);

  const expGap = v(a, "ufc_fights") - v(b, "ufc_fights");
  if (Math.abs(expGap) >= 6) {
    const vet = expGap > 0 ? a : b;
    rows.push(["Experience", <>{corner(vet)} has {v(vet, "ufc_fights")} UFC fights to {corner(other(vet))}'s {v(other(vet), "ufc_fights")}.</>]);
  }
  const ageGap = v(a, "age") - v(b, "age");
  if (Math.abs(ageGap) >= 5) {
    const young = ageGap > 0 ? b : a;
    rows.push(["Age", <>{corner(young)} is {Math.round(Math.abs(ageGap))} years younger ({Math.round(v(young, "age"))} vs {Math.round(v(other(young), "age"))}).</>]);
  }
  const reachGap = v(a, "reach") - v(b, "reach");
  if (Math.abs(reachGap) >= 8) rows.push(["Reach", <>{corner(reachGap > 0 ? a : b)} has {Math.round(Math.abs(reachGap))} cm more reach.</>]);
  for (const f of [a, b]) {
    const off = v(f, "layoff_years");
    if (off >= 1.5) rows.push(["Layoff", <>{corner(f)} hasn't fought in {off.toFixed(1)} years.</>]);
  }

  const shared = sharedRecord(common);

  const result = (r: "W" | "L") => (
    <Text span fw={800} c={r === "W" ? "green.5" : "red.5"}>
      {r}
    </Text>
  );

  return (
    <Paper withBorder p="lg" h="100%">
      <Title order={4} mb="md">
        Matchup notes
      </Title>
      {rows.length > 0 && (
        <Stack gap={8}>
          {rows.map(([label, content], i) => (
            <Group key={i} gap="md" wrap="nowrap" align="baseline">
              <Text size="xs" tt="uppercase" fw={700} c="dimmed" w={84} style={{ flexShrink: 0, letterSpacing: "0.06em" }}>
                {label}
              </Text>
              <Text size="sm" component="div">{content}</Text>
            </Group>
          ))}
        </Stack>
      )}
      {common.length > 0 && (
        <Box mt={rows.length ? "lg" : 0}>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={6} style={{ letterSpacing: "0.06em" }}>
            Common opponents
          </Text>
          <Text size="sm" mb={6}>
            Against {common.length} shared opponent{common.length > 1 ? "s" : ""}: {corner(a)} {shared.a[0]}–{shared.a[1]},{" "}
            {corner(b)} {shared.b[0]}–{shared.b[1]}.
            {shared.split.length > 0 && <> Results differ against {shared.split.slice(0, 3).join(", ")}{shared.split.length > 3 ? " and others" : ""}.</>}
          </Text>
          <Table fz="sm" verticalSpacing={4} horizontalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                <Table.Th ta="center" w={90}>{corner(a)}</Table.Th>
                <Table.Th ta="center" w={90}>{corner(b)}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {common.slice(0, 6).map((c) => (
                <Table.Tr key={c.name}>
                  <Table.Td>{c.name}</Table.Td>
                  <Table.Td ta="center">{result(c.a)}</Table.Td>
                  <Table.Td ta="center">{result(c.b)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {common.length > 6 && (
            <Text size="xs" c="dimmed" mt={4}>
              and {common.length - 6} more
            </Text>
          )}
        </Box>
      )}
      {!rows.length && !common.length && (
        <Text size="sm" c="dimmed">
          First meeting and no common opponents; similar age, reach and experience.
        </Text>
      )}
    </Paper>
  );
}
