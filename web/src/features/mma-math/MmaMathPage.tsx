import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Container,
  Grid,
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
import { useSearchParams } from "react-router-dom";

import { useMmaMath, useStyleMap } from "../../data/client";
import { mmaMathImage } from "../share/mmaMathImage";
import { ShareButton } from "../share/ShareButton";
import { Chain, type Lookup, ringColor } from "./Chain";
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

  // The pair lives in the URL (?winner=josh-hokit&loser=ilia-topuria), so a shared link opens
  // the same proof. Selects work with indexes into data.fighters.
  const [params, setParams] = useSearchParams();
  const indexById = useMemo(() => new Map(data?.fighters.map((f, i) => [f.id, String(i)])), [data]);
  const setPair = ([w, l]: [string | null, string | null]) => {
    const next: Record<string, string> = {};
    if (w) next.winner = data!.fighters[Number(w)]!.id;
    if (l) next.loser = data!.fighters[Number(l)]!.id;
    setParams(next, { replace: true });
  };
  const [length, setLength] = useState("3");
  const [shown, setShown] = useState(PAGE_SIZE);

  if (isPending) return <Center h="60vh"><Loader /></Center>;
  if (error || !lookup) return <Alert color="red" title="Could not load MMA math">{error?.message}</Alert>;

  const indexOf = (name: string) => data.fighters.findIndex((f) => f.name === name);
  const fromUrl = (key: string) => {
    const id = params.get(key);
    return id === null ? undefined : (indexById.get(id) ?? null);
  };
  const a = fromUrl("winner") ?? (params.toString() ? null : String(indexOf(DEFAULT_PAIR[0]!)));
  const b = fromUrl("loser") ?? (params.toString() ? null : String(indexOf(DEFAULT_PAIR[1]!)));
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
  const chain = a && b && a !== b ? shortestChain(wins, Number(a), Number(b)) : null;
  const proof = chain && {
    chain,
    nodes: [chain[0]!.winner, ...chain.map((f) => f.loser)].map((i) => data.fighters[i]!),
    winner: data.fighters[Number(a)]!.name,
    loser: data.fighters[Number(b)]!.name,
  };

  return (
    <Container size="lg" pt={4} pb="md">
      <Stack gap="xl">
        {/* Pick on the left, the proof draws itself on the right (stacked on phones). */}
        {/* No frame: the octagon and the controls sit straight on the arena backdrop. */}
        <Paper px="lg" pt={0} pb="lg" bg="transparent">
          <Grid gap="xl" align="center">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="md">
                <div>
                  <Title order={1} fz={{ base: 30, md: 34 }} lh={1.15}>
                    MMA math doesn't work
                  </Title>
                  <Text size="sm" c="dimmed" mt={8}>
                    Settle any argument: pick a winner and a loser. If a chain of UFC wins leads
                    from one to the other, it's proven.
                  </Text>
                </div>
                <Select label="Winner" searchable limit={PICKER_LIMIT} placeholder={placeholder} data={options} value={a} onChange={(v) => setPair([v, b])} />
                {/* Centred between the two boxes (the Loser label sits under it). */}
                <Group justify="center" mt={4} mb={-20}>
                  <Tooltip label="Swap: prove it the other way round" withArrow>
                    <ActionIcon variant="light" size="lg" onClick={() => setPair([b, a])} aria-label="Swap fighters">
                      ⇅
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Select label="Loser" searchable limit={PICKER_LIMIT} placeholder={placeholder} data={options} value={b} onChange={(v) => setPair([a, v])} />
                <Button variant="light" size="xs" onClick={randomPair}>
                  Random matchup
                </Button>
                {proof && (
                  <ShareButton
                    fullWidth
                    label="Share this proof"
                    make={() => mmaMathImage(proof.chain, proof.nodes.map((f) => ({ fighter: f, ring: ringColor(f, lookup) })))}
                    fileName={`${proof.nodes[0]!.id}-beats-${proof.nodes.at(-1)!.id}`}
                    text={`${proof.winner} beats ${proof.loser}, in ${proof.chain.length} fights of airtight MMA math.`}
                    url={`${window.location.origin}${import.meta.env.BASE_URL}mma-math?winner=${proof.nodes[0]!.id}&loser=${proof.nodes.at(-1)!.id}`}
                  />
                )}
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 8 }}>
              {a && b && a !== b && (
                <Proof chain={chain} winner={data.fighters[Number(a)]!.name} loser={data.fighters[Number(b)]!.name} lookup={lookup} />
              )}
            </Grid.Col>
          </Grid>
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
