import {
  Anchor,
  Alert,
  Avatar,
  Badge,
  Button,
  Center,
  Container,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { RecordText } from "../../components/RecordText";
import { usePredictor } from "../../data/client";
import type { PredictorFighter } from "../../data/types";
import { FighterTradingCard } from "../predictor/FighterTradingCard";
import { FighterPageButton } from "../seo/FighterPageLink";
import { GOLD, WEIGHT_CLASSES } from "../style-map/model";
import "./Ladder.css";

import { ACTIVE_YEARS, isActive, movers, yearChange } from "./ladder";

const PAGE = 50;

export default function LadderPage() {
  const { data, error, isPending } = usePredictor();
  const [open, setOpen] = useState<PredictorFighter | null>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [scope, setScope] = useState<"active" | "all">("active");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const pool = useMemo(
    () => (data?.fighters ?? []).filter((f) => scope === "all" || isActive(f, data!.fights_until)),
    [data, scope],
  );
  const ranked = useMemo(
    () =>
      pool
        .filter((f) => !division || f.weight_class === division)
        .sort((a, b) => b.elo - a.elo)
        .map((f, i) => ({ f, place: i + 1 })),
    [pool, division],
  );

  if (isPending) return <Center h="60vh"><Loader /></Center>;
  if (error) return <Alert color="red" title="Could not load the ladder">{error.message}</Alert>;

  const q = query.trim().toLowerCase();
  const rows = (q ? ranked.filter(({ f }) => f.name.toLowerCase().includes(q)) : ranked).slice(0, shown);
  const divisions = WEIGHT_CLASSES.filter((wc) => data.fighters.some((f) => f.weight_class === wc));

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={2}>Elo ladder</Title>
          <Text c="dimmed" size="sm" maw={720}>
            A chess-style rating built from every UFC fight since 1994. Everyone starts at 1500; after each
            fight the winner takes points from the loser, and upsets move more points than expected wins. One
            ladder across all divisions.
          </Text>
          <Anchor component={Link} to="/fighters/" size="sm">
            All fighters: records, styles and next fights →
          </Anchor>
        </Stack>

        <Grid>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="sm">
              <Group gap="sm" wrap="wrap">
                <SegmentedControl
                  size="xs"
                  value={scope}
                  onChange={(v) => {
                    setScope(v as "active" | "all");
                    setShown(PAGE);
                  }}
                  data={[
                    { value: "active", label: `Active (${ACTIVE_YEARS} y)` },
                    { value: "all", label: "Last 5 years" },
                  ]}
                />
                <Select
                  size="xs"
                  placeholder="All divisions"
                  clearable
                  data={divisions}
                  value={division}
                  onChange={(v) => {
                    setDivision(v);
                    setShown(PAGE);
                  }}
                  w={200}
                />
                <TextInput size="xs" placeholder="Find a fighter" value={query} onChange={(e) => setQuery(e.currentTarget.value)} w={180} />
              </Group>

              <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                <Table highlightOnHover verticalSpacing={6} fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={44}>#</Table.Th>
                      <Table.Th>Fighter</Table.Th>
                      <Table.Th ta="right">Elo</Table.Th>
                      <Table.Th ta="right" visibleFrom="xs">12 mo</Table.Th>
                      <Table.Th visibleFrom="sm">Record</Table.Th>
                      <Table.Th visibleFrom="sm">UFC rank</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map(({ f, place }) => (
                      <Table.Tr key={f.id} style={{ cursor: "pointer" }} onClick={() => setOpen(f)}>
                        <Table.Td c="dimmed" fw={700}>
                          {place}
                        </Table.Td>
                        <Table.Td>
                          <FighterCell f={f} />
                        </Table.Td>
                        <Table.Td ta="right" fw={800}>
                          {f.elo}
                          <Text span size="xs" c="dimmed" fw={400} hiddenFrom="xs">
                            {" "}
                            <Change f={f} />
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" visibleFrom="xs">
                          <Change f={f} />
                        </Table.Td>
                        <Table.Td visibleFrom="sm">
                          <RecordText record={f.record} size="xs" />
                        </Table.Td>
                        <Table.Td visibleFrom="sm">
                          <OfficialRank f={f} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
              {!q && shown < ranked.length && (
                <Center>
                  <Button variant="subtle" onClick={() => setShown(shown + PAGE)}>
                    Show more ({ranked.length - shown} left)
                  </Button>
                </Center>
              )}
              <Text size="xs" c="dimmed">
                Click a fighter to see their card. Elo as of {data.fights_until}.
              </Text>
            </Stack>
          </Grid.Col>

          {/* The year's movers, set like a markets page. */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="md">
              <Movers title="Top gainers" fighters={movers(pool, 1)} onOpen={setOpen} />
              <Movers title="Top decliners" fighters={movers(pool, -1)} onOpen={setOpen} />
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>

      {/* No focus trap: it would focus the card on open and draw a focus ring around it.
          Escape and clicking outside still close the popup. */}
      <Modal
        opened={open !== null}
        onClose={() => setOpen(null)}
        centered
        size="auto"
        withCloseButton={false}
        trapFocus={false}
        padding={0}
        // Just the card on the dimmed page, with its buttons under it: no box around them.
        overlayProps={{ backgroundOpacity: 0.75, blur: 2 }}
        styles={{ content: { background: "transparent", boxShadow: "none", border: 0 } }}
      >
        {open && (
          <Stack gap="sm" w={320} maw="calc(100vw - 64px)">
            <FighterTradingCard id={open.id} />
            <Group grow>
              <Button component={Link} to={`/predictor?a=${open.id}`} color="red.7">
                Predict
              </Button>
              <FighterPageButton id={open.id}>Fighter page</FighterPageButton>
            </Group>
            <Button variant="subtle" color="gray" onClick={() => setOpen(null)}>
              Close
            </Button>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}

function FighterCell({ f }: { f: PredictorFighter }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Avatar src={f.image?.url} size={32} radius="xl" color="gray" style={{ border: f.champion ? `2px solid ${GOLD}` : undefined }}>
        {f.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
      </Avatar>
      <div>
        <Text size="sm" fw={600} lh={1.2}>
          {f.champion && "🏆 "}
          {f.name}
        </Text>
        <Text size="xs" c="dimmed">
          {f.weight_class}
        </Text>
      </div>
    </Group>
  );
}

function Change({ f }: { f: PredictorFighter }) {
  const d = yearChange(f);
  if (d === null) return <Text span size="xs" c="dimmed">new</Text>;
  if (d === 0) return <Text span size="xs" c="dimmed">–</Text>;
  return (
    <Text span size="xs" fw={700} c={d > 0 ? "green.5" : "red.5"} style={{ whiteSpace: "nowrap" }}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d)}
    </Text>
  );
}

function OfficialRank({ f }: { f: PredictorFighter }) {
  if (f.champion) return <Badge color="yellow" variant="filled" size="sm">Champion</Badge>;
  if (f.rank !== null) return <Badge variant="light" color="gray" size="sm">#{f.rank}</Badge>;
  return <Text span size="xs" c="dimmed">unranked</Text>;
}

interface MoversProps {
  title: string;
  fighters: PredictorFighter[];
  onOpen: (f: PredictorFighter) => void;
}

/** "Light Heavyweight" → "LHW": a division as a short code, the way a markets page shows one. */
const CODES: Record<string, string> = {
  Heavyweight: "HW",
  "Light Heavyweight": "LHW",
  Middleweight: "MW",
  Welterweight: "WW",
  Lightweight: "LW",
  Featherweight: "FW",
  Bantamweight: "BW",
  Flyweight: "FLW",
  Strawweight: "SW",
};
const divisionCode = (wc: string) => {
  const women = wc.startsWith("Women's ");
  const base = wc.replace("Women's ", "");
  return `${women ? "W-" : ""}${CODES[base] ?? base}`;
};

function Movers({ title, fighters, onOpen }: MoversProps) {
  return (
    <Paper withBorder className="movers">
      <div className="movers-head">
        <Text fw={800}>{title}</Text>
        <Text size="xs" c="dimmed">
          Elo, last 12 months
        </Text>
      </div>
      {fighters.map((f) => (
        <MoverRow key={f.id} f={f} onOpen={onOpen} />
      ))}
    </Paper>
  );
}

/** One mover: who, a line from a year ago to now, the rating now, and the change. */
function MoverRow({ f, onOpen }: { f: PredictorFighter; onOpen: (f: PredictorFighter) => void }) {
  const from = f.elo_year_ago!;
  const d = f.elo - from;
  const pct = (100 * d) / from;
  const up = d > 0;
  // The line: a year ago on the left, now on the right, peak as a faint ceiling.
  const lo = Math.min(from, f.elo) - 20;
  const hi = Math.max(f.elo_peak, from, f.elo) + 10;
  const y = (v: number) => 26 - (22 * (v - lo)) / (hi - lo);
  return (
    <UnstyledButton className="mover" data-up={up || undefined} onClick={() => onOpen(f)}>
      <Avatar src={f.image?.url} size={34} radius="xl" color="gray">
        {f.name[0]}
      </Avatar>
      <div className="mover-name">
        <Text fw={700} truncate>
          {f.name}
        </Text>
        <Text size="xs" c="dimmed" className="mover-meta">
          <b>{f.elo}</b> from {from} · {divisionCode(f.weight_class)}
          {f.champion ? " · champ" : f.rank !== null ? ` #${f.rank}` : ""}
        </Text>
      </div>
      <svg className="mover-line" viewBox="0 0 80 28" preserveAspectRatio="none" aria-hidden>
        <line x1="0" x2="80" y1={y(f.elo_peak)} y2={y(f.elo_peak)} className="mover-peak" />
        <path d={`M2 ${y(from)} L78 ${y(f.elo)} L78 28 L2 28 Z`} className="mover-area" />
        <path d={`M2 ${y(from)} L78 ${y(f.elo)}`} className="mover-stroke" />
      </svg>
      <div className="mover-change">
        <span>
          {up ? "+" : "−"}
          {Math.abs(d)}
        </span>
        <span className="mover-pct">
          {up ? "+" : "−"}
          {Math.abs(pct).toFixed(1)}%
        </span>
      </div>
    </UnstyledButton>
  );
}
