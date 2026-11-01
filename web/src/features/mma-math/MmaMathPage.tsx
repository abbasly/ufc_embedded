import {
  Alert,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMemo, useState } from "react";

import { useMmaMath, useStyleMap } from "../../data/client";
import { Chain, type Lookup } from "./Chain";
import { type Fight, shortestChain, toFight, winsByFighter } from "./graph";

const PAGE_SIZE = 12;
const DEFAULT_PAIR = ["Conor McGregor", "Islam Makhachev"];

export default function MmaMathPage() {
  const { data, error, isPending } = useMmaMath();
  const styleMap = useStyleMap().data; // optional enrichment for hover cards

  const fights = useMemo(() => data?.fights.map(toFight) ?? [], [data]);
  const wins = useMemo(() => winsByFighter(fights), [fights]);
  const lookup: Lookup | null = useMemo(
    () =>
      data
        ? {
            fighters: data.fighters,
            styleMap,
            styleById: new Map(styleMap?.fighters.map((f) => [f.id, f])),
          }
        : null,
    [data, styleMap],
  );

  const [pair, setPair] = useState<[string | null, string | null] | null>(null);
  const [length, setLength] = useState("3");
  const [shown, setShown] = useState(PAGE_SIZE);

  if (isPending) return <Center h="60vh"><Loader /></Center>;
  if (error || !lookup) return <Alert color="red" title="Could not load MMA math">{error?.message}</Alert>;

  const indexOf = (name: string) => data.fighters.findIndex((f) => f.name === name);
  const [a, b] = pair ?? (DEFAULT_PAIR.map((n) => String(indexOf(n))) as [string, string]);
  const options = data.fighters
    .map((f, i) => ({ value: String(i), label: f.name }))
    .sort((x, y) => x.label.localeCompare(y.label));

  const randomPair = () => {
    // Pick two experienced fighters where MMA math works in both directions.
    const pool = data.fighters.flatMap((f, i) => (f.wins + f.losses >= 8 ? [i] : []));
    for (let tries = 0; tries < 200; tries++) {
      const x = pool[Math.floor(Math.random() * pool.length)]!;
      const y = pool[Math.floor(Math.random() * pool.length)]!;
      if (x !== y && shortestChain(wins, x, y) && shortestChain(wins, y, x)) {
        setPair([String(x), String(y)]);
        return;
      }
    }
  };

  const cycles = data.cycles.filter((c) => c.length === Number(length));

  return (
    <Container size="lg" py="md">
      <Stack gap="xl">
        <Stack gap={4}>
          <Title order={1}>MMA math doesn't work</Title>
          <Text c="dimmed">
            "A beat B and B beat C, so A beats C." Every fan has heard it. Here are the loops that
            break it: fighters who beat each other in a circle. {data.giant_loop_size.toLocaleString()}{" "}
            UFC fighters since 2010 form one giant loop, so within it you can "prove" anyone beats
            anyone.
          </Text>
        </Stack>

        <Paper withBorder p="lg">
          <Stack gap="md">
            <Title order={3}>Settle any argument</Title>
            <Group align="flex-end">
              <Select label="Fighter A" searchable limit={50} data={options} value={a} onChange={(v) => setPair([v, b])} w={240} />
              <Select label="Fighter B" searchable limit={50} data={options} value={b} onChange={(v) => setPair([a, v])} w={240} />
              <Button variant="light" onClick={randomPair}>Random matchup</Button>
            </Group>
            {a && b && a !== b && (
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                {[
                  [Number(a), Number(b)],
                  [Number(b), Number(a)],
                ].map(([x, y]) => (
                  <Proof key={`${x}-${y}`} chain={shortestChain(wins, x!, y!)} winner={data.fighters[x!]!.name} loser={data.fighters[y!]!.name} lookup={lookup} />
                ))}
              </SimpleGrid>
            )}
          </Stack>
        </Paper>

        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Loops</Title>
            <SegmentedControl
              value={length}
              onChange={(v) => {
                setLength(v);
                setShown(PAGE_SIZE);
              }}
              data={[
                { value: "3", label: "3 fighters" },
                { value: "4", label: "4 fighters" },
                { value: "5", label: "5 fighters" },
              ]}
            />
          </Group>
          <Text size="sm" c="dimmed">
            Ranked by how well known the least known fighter in the loop is. Hover anyone for their
            style profile; orange odds mark upsets.
          </Text>
          <SimpleGrid cols={{ base: 1, lg: length === "3" ? 2 : 1 }}>
            {cycles.slice(0, shown).map((c) => (
              <Paper key={c.join("-")} withBorder p="md">
                <Chain fights={c.map((i) => fights[i]!)} lookup={lookup} loop />
              </Paper>
            ))}
          </SimpleGrid>
          {shown < cycles.length && (
            <Center>
              <Button variant="subtle" onClick={() => setShown(shown + PAGE_SIZE)}>
                Show more
              </Button>
            </Center>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}

function Proof({ chain, winner, loser, lookup }: { chain: Fight[] | null; winner: string; loser: string; lookup: Lookup }) {
  return (
    <Stack gap="xs">
      <Text fw={600}>
        Why {winner} beats {loser}
      </Text>
      {chain ? (
        <>
          <Chain fights={chain} lookup={lookup} />
          <Text size="xs" c="dimmed">
            {chain.length === 1 ? "They actually fought. Real math." : `${chain.length} fights of airtight logic.`}
          </Text>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          No chain of wins leads from {winner} to {loser}. Even MMA math has limits.
        </Text>
      )}
    </Stack>
  );
}
