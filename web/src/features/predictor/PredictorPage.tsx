import {
  ActionIcon,
  Alert,
  Box,
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
import { type ReactNode, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { useMmaMath, usePredictor } from "../../data/client";
import type { MmaMathData, PredictorData, PredictorFighter } from "../../data/types";
import { FighterTradingCard } from "./FighterTradingCard";
import { commonOpponents, contributions, headToHead, outcomes, winProb } from "./model";
import { canFight, defaultOpponent } from "./matchup";
import { OutcomeReveal } from "./OutcomeReveal";
import { useCountUp } from "./useCountUp";
import "./Verdict.css";

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
  // Anyone can be picked in either corner; if the other corner no longer fits (other gender,
  // or more than one division away), it switches to a fitting opponent.
  const set = (side: "a" | "b", id: string | null) => {
    const picked = id ? byId.get(id) : undefined;
    if (!picked) return;
    const other = side === "a" ? b : a;
    const fits = other && other.id !== picked.id && canFight(picked.weight_class, other.weight_class);
    const opponent = fits ? other : defaultOpponent(picked, sorted);
    const otherId = opponent?.id ?? (side === "a" ? bId : aId);
    setParams(side === "a" ? { a: picked.id, b: otherId } : { a: otherId, b: picked.id }, { replace: true });
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        <Title order={2}>Fight predictor</Title>

        <Grid align="stretch">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <FighterCard fighter={a} options={options} value={aId} onChange={(v) => set("a", v)} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack h="100%" justify="center" gap="md" py="md">
              {a && b && a.id !== b.id && <Verdict key={`${a.id}-${b.id}`} data={data} a={a} b={b} />}
              <Center>
                <Tooltip label="Swap corners" withArrow>
                  <ActionIcon variant="light" size="lg" onClick={() => setParams({ a: bId, b: aId }, { replace: true })} aria-label="Swap fighters">
                    ⇄
                  </ActionIcon>
                </Tooltip>
              </Center>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <FighterCard fighter={b} options={options} value={bId} onChange={(v) => set("b", v)} />
          </Grid.Col>
        </Grid>

        {a && b && a.id !== b.id ? (
          <>
            <Grid align="stretch">
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Breakdown data={data} a={a} b={b} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Notes data={data} mma={mma} a={a} b={b} />
              </Grid.Col>
            </Grid>
            <TaleOfTheTape data={data} a={a} b={b} />
          </>
        ) : (
          <Text c="dimmed">Pick two different fighters.</Text>
        )}

        <Text size="xs" c="dimmed">
          Logistic regression on pre-fight stats and ratings, trained on fights up to {data.trained_until};
          fighter stats as of {data.fights_until}. Opponents are limited to the same gender and at most one
          division apart: the UFC has never had bigger gaps, so the model has nothing to go on there. On 2022–23 fights it picked{" "}
          {Math.round((data.validation.logistic?.accuracy ?? 0) * 100)}% of winners (betting market:{" "}
          {Math.round((data.validation.market?.accuracy ?? 0) * 100)}%). Just for fun, not betting advice.
        </Text>
      </Stack>
    </Container>
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
    <Stack gap="sm" maw={320} mx="auto" w="100%">
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
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Text fw={800} fz={40} lh={1} c={A_COLOR} style={{ fontVariantNumeric: "tabular-nums" }}>
          {Math.round(pA * 100 * t)}%
        </Text>
        <Text size="xs" tt="uppercase" fw={700} c="dimmed" ta="center" style={{ letterSpacing: 1 }}>
          Win chance
        </Text>
        <Text fw={800} fz={40} lh={1} c={B_COLOR} style={{ fontVariantNumeric: "tabular-nums" }}>
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
    <Paper withBorder p="md" maw={620} w="100%" mx="auto">
      <Title order={4} mb="xs" ta="center">
        Tale of the tape
      </Title>
      <Table striped withRowBorders={false} fz="sm">
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
  const last = (f: PredictorFighter) => f.name.split(" ").at(-1) ?? f.name;
  const corner = (f: PredictorFighter) => <Text span inherit fw={700} c={f.id === a.id ? A_COLOR : B_COLOR}>{last(f)}</Text>;
  const byId = (id: string) => (id === a.id ? a : b);
  const meetings = mma ? headToHead(mma, a.id, b.id) : [];
  const common = mma ? commonOpponents(mma, a.id, b.id) : [];

  // Facts as label + value rows, like the notes in a fight programme.
  const rows: [string, ReactNode][] = [];
  if (meetings.length) {
    rows.push([
      "History",
      <Stack gap={2}>
        {meetings.map((f) => (
          <span key={f.date}>
            {f.date.slice(0, 4)} · {corner(byId(f.winnerId))} by {f.method}
            {f.round ? `, R${f.round}` : ""}
          </span>
        ))}
      </Stack>,
    ]);
  }
  for (const f of [a, b]) if (f.champion) rows.push(["Title", <>{corner(f)}, {f.champion} champion</>]);
  if (a.weight_class !== b.weight_class) rows.push(["Divisions", <>{corner(a)} {a.weight_class} · {corner(b)} {b.weight_class}</>]);
  const ageGap = value(data, a, "age") - value(data, b, "age");
  if (Math.abs(ageGap) >= 6) rows.push(["Age", <>{corner(ageGap > 0 ? b : a)} {Math.round(Math.abs(ageGap))} years younger</>]);
  const reachGap = value(data, a, "reach") - value(data, b, "reach");
  if (Math.abs(reachGap) >= 8) rows.push(["Reach", <>{corner(reachGap > 0 ? a : b)} +{Math.round(Math.abs(reachGap))} cm</>]);
  for (const f of [a, b]) {
    const off = value(data, f, "layoff_years");
    if (off >= 1.5) rows.push(["Layoff", <>{corner(f)} out {off.toFixed(1)} years</>]);
  }

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
          First meeting, no common opponents, similar age and reach.
        </Text>
      )}
    </Paper>
  );
}
