import {
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
import { GOLD, WEIGHT_CLASSES } from "../style-map/model";
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
        </Stack>

        <Grid>
          <Grid.Col span={{ base: 12, md: 8.5 }}>
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

          <Grid.Col span={{ base: 12, md: 3.5 }}>
            <Stack gap="md">
              <Movers title="📈 Biggest climbers" subtitle="Elo gained in the last 12 months" fighters={movers(pool, 1)} onOpen={setOpen} />
              <Movers title="📉 Biggest drops" subtitle="Elo lost in the last 12 months" fighters={movers(pool, -1)} onOpen={setOpen} />
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
        padding="md"
        radius="lg"
      >
        {open && (
          <Stack gap="sm" w={320} maw="calc(100vw - 64px)">
            <FighterTradingCard id={open.id} />
            <Group grow>
              <Button component={Link} to={`/predictor?a=${open.id}`} variant="light" leftSection="🥊">
                Predict
              </Button>
              <Button variant="default" onClick={() => setOpen(null)}>
                Close
              </Button>
            </Group>
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
  subtitle: string;
  fighters: PredictorFighter[];
  onOpen: (f: PredictorFighter) => void;
}

function Movers({ title, subtitle, fighters, onOpen }: MoversProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={700}>{title}</Text>
      <Text size="xs" c="dimmed" mb="xs">
        {subtitle}
      </Text>
      <Stack gap={6}>
        {fighters.map((f) => (
          <UnstyledButton key={f.id} onClick={() => onOpen(f)}>
            <Group justify="space-between" wrap="nowrap">
              <Group gap={8} wrap="nowrap">
                <Avatar src={f.image?.url} size={24} radius="xl" color="gray">
                  {f.name[0]}
                </Avatar>
                <Text size="sm" lineClamp={1}>
                  {f.name}
                </Text>
              </Group>
              <Change f={f} />
            </Group>
          </UnstyledButton>
        ))}
      </Stack>
    </Paper>
  );
}
