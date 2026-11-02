import {
  ActionIcon,
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
  Tooltip,
} from "@mantine/core";
import { useMemo, useState } from "react";

import { useMmaMath, useStyleMap } from "../../data/client";
import { Chain, type Lookup } from "./Chain";
import { CircleChain } from "./CircleChain";
import { type Fight, fighterOptions, notablePool, shortestChain, toFight, winsByFighter } from "./graph";

const PAGE_SIZE = 12;
const PICKER_LIMIT = 200; // rendering all ~2,800 fighters makes the dropdown laggy on phones
// A flyweight and a heavyweight: the funniest kind of MMA math.
const DEFAULT_PAIR = ["Alexandre Pantoja", "Ciryl Gane"];

export default function MmaMathPage() {
  const { data, error, isPending } = useMmaMath();
  const styleMap = useStyleMap().data; // optional enrichment for hover cards

  const fights = useMemo(() => data?.fights.map(toFight) ?? [], [data]);
  const wins = useMemo(() => winsByFighter(fights), [fights]);
  const pool = useMemo(() => (data ? notablePool(data.fighters, fights) : []), [data, fights]);
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
  const options = fighterOptions(data.fighters, fights);
  const placeholder = `Type to search ${data.fighters.length.toLocaleString()} fighters`;

  const randomPair = () => {
    // Two fighters people recognise, where a chain of wins exists in the shown direction.
    for (let tries = 0; tries < 200; tries++) {
      const x = pool[Math.floor(Math.random() * pool.length)]!;
      const y = pool[Math.floor(Math.random() * pool.length)]!;
      if (x !== y && shortestChain(wins, x, y)) {
        setPair([String(x), String(y)]);
        return;
      }
    }
  };

  const cycles = data.cycles.filter((c) => c.length === Number(length));

  return (
    <Container size="lg" py="md">
      <Stack gap="xl">
        <Title order={1}>MMA math doesn't work</Title>

        <Paper withBorder p="lg">
          <Stack gap="md">
            <Title order={3}>Settle any argument</Title>
            <Group align="flex-end" justify="center">
              <Select label="Winner" searchable limit={PICKER_LIMIT} placeholder={placeholder} data={options} value={a} onChange={(v) => setPair([v, b])} w={240} />
              <Tooltip label="Swap: prove it the other way round" withArrow>
                <ActionIcon variant="light" size="lg" mb={2} onClick={() => setPair([b, a])} aria-label="Swap fighters">
                  ⇄
                </ActionIcon>
              </Tooltip>
              <Select label="Loser" searchable limit={PICKER_LIMIT} placeholder={placeholder} data={options} value={b} onChange={(v) => setPair([a, v])} w={240} />
              <Button variant="light" onClick={randomPair}>Random matchup</Button>
            </Group>
            {a && b && a !== b && (
              <Proof
                chain={shortestChain(wins, Number(a), Number(b))}
                winner={data.fighters[Number(a)]!.name}
                loser={data.fighters[Number(b)]!.name}
                lookup={lookup}
              />
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
  if (!chain) {
    return (
      <Text size="sm" c="dimmed">
        No chain of wins leads from {winner} to {loser}. Even MMA math has limits. Try swapping.
      </Text>
    );
  }
  const verdict = (
    <>
      <Text fw={700} size="lg" lh={1.2}>
        {winner}
      </Text>
      <Text size="sm" c="red" fw={600}>
        beats
      </Text>
      <Text fw={700} size="lg" lh={1.2}>
        {loser}
      </Text>
      <Text size="xs" c="dimmed">
        {chain.length === 1 ? "They actually fought. Real math." : `${chain.length} fights of airtight logic`}
      </Text>
    </>
  );
  return <CircleChain fights={chain} lookup={lookup} center={verdict} />;
}
