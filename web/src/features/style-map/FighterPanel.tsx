import { Anchor, Avatar, Badge, Box, Button, CloseButton, Group, Progress, SegmentedControl, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { Link } from "react-router-dom";

import type { Feature, Fighter, Neighbour, StyleMapData } from "../../data/types";
import { RecordText } from "../../components/RecordText";
import { FighterTradingCard } from "../predictor/FighterTradingCard";
import { type Scope, colorOfGroup, featureGroups, ordinal, sharedTraits } from "./model";

interface Props {
  data: StyleMapData;
  fighter: Fighter | null;
  onSelect: (id: string | null) => void;
  neighbours: Neighbour[];
  scope: Scope;
  onScope: (scope: Scope) => void;
  focusId: string | null; // the similar fighter being looked at (also lit up on the map)
  onFocus: (id: string | null) => void;
}

export function FighterPanel(props: Props) {
  const { data, fighter, onSelect } = props;
  if (!fighter) return <StyleOverview data={data} />;

  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  const style = data.clusters.find((c) => c.id === fighter.cluster);

  const header = (
    <>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group wrap="nowrap" align="flex-start">
          <FighterAvatar fighter={fighter} size={64} />
          <div>
            <Title order={3}>{fighter.name}</Title>
            <RecordText record={fighter.record} />
            <Text size="sm" c="dimmed">
              {fighter.weight_class}
              {fighter.rank !== null && fighter.rank > 0 && ` · #${fighter.rank}`}
            </Text>
            <Text size="sm" c="dimmed">
              Last fight {fighter.last_fight}
            </Text>
          </div>
        </Group>
      </Group>
      <Group gap="xs">
        {fighter.champion && (
          <Badge color="yellow" variant="filled">
            🏆 {fighter.champion} champion
          </Badge>
        )}
        {style && <Badge variant="light">{style.name}</Badge>}
      </Group>
    </>
  );

  return (
    <Stack gap="sm">
      <Group justify="flex-end" mb={-8}>
        <CloseButton onClick={() => onSelect(null)} aria-label="Clear selection" />
      </Group>
      <FighterTradingCard id={fighter.id} fallback={header} />
      <Button component={Link} to={`/predictor?a=${fighter.id}`} variant="light" leftSection="🥊">
        Predict a fight with {fighter.name.split(" ").at(-1)}
      </Button>

      <SimilarFighters {...props} fighter={fighter} byId={byId} />

      <StyleProfile data={data} fighter={fighter} />

      {fighter.image && (
        <Anchor href={fighter.image.credit_url} target="_blank" size="xs" c="dimmed">
          Photo: Wikimedia (licence & author)
        </Anchor>
      )}
    </Stack>
  );
}

function SimilarFighters(props: Props & { fighter: Fighter; byId: Map<string, Fighter> }) {
  const { data, fighter, byId, neighbours, scope, onScope, focusId, onFocus, onSelect } = props;
  const styleOf = (f: Fighter) => data.clusters.find((c) => c.id === f.cluster)?.name ?? "";

  return (
    <div>
      <Group justify="space-between" align="center" mt="xs" mb={4} gap="xs">
        <Text fw={700}>Most similar fighters</Text>
        <SegmentedControl
          size="xs"
          value={scope}
          onChange={(v) => onScope(v as Scope)}
          data={[
            { value: "all", label: "Any division" },
            { value: "division", label: "Same division" },
          ]}
        />
      </Group>
      <Text size="xs" c="dimmed" mb={6}>
        Style similarity across {data.features.length} stats, out of 100: 100 is the same style, 0
        is as different as two fighters picked at random. Click one to jump to them.
      </Text>
      {neighbours.length === 0 && (
        <Text size="sm" c="dimmed">
          No one else in {fighter.weight_class} is on the map.
        </Text>
      )}
      <Stack gap={2} className="similar-list" data-focus={focusId ? "" : undefined} onPointerLeave={() => onFocus(null)}>
        {neighbours.map((n, i) => {
          const f = byId.get(n.id);
          if (!f) return null;
          const color = colorOfGroup(styleOf(f), "style");
          const traits = sharedTraits(fighter, f, data.features);
          return (
            <Group
              key={n.id}
              className="similar-row"
              data-focused={focusId === n.id ? "" : undefined}
              data-top={i === 0 ? "" : undefined}
              style={{ "--style-color": color } as React.CSSProperties}
              gap={10}
              wrap="nowrap"
              px={6}
              py={5}
              onPointerEnter={() => onFocus(n.id)}
            >
              <UnstyledButton onClick={() => onSelect(n.id)} style={{ flex: 1, minWidth: 0 }} aria-label={`Show ${f.name}`}>
                <Group gap={10} wrap="nowrap">
                  <Text size="xs" fw={700} c={i === 0 ? color : "dimmed"} w={12} ta="right" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {i + 1}
                  </Text>
                  <Box pos="relative" style={{ flexShrink: 0 }}>
                    <FighterAvatar fighter={f} size={36} />
                    <Box pos="absolute" bottom={-1} right={-1} w={11} h={11} bg={color} style={{ borderRadius: "50%", border: "2px solid var(--mantine-color-body)" }} />
                  </Box>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {f.champion && "🏆 "}
                      {f.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {scope === "all" ? f.weight_class : `${f.rank !== null && f.rank > 0 ? `#${f.rank} · ` : ""}${styleOf(f)}`}
                    </Text>
                    {traits.length > 0 && (
                      <Text size="xs" c="dimmed" fs="italic" truncate>
                        {traits.join(" · ")}
                      </Text>
                    )}
                  </div>
                </Group>
              </UnstyledButton>
              <Stack gap={3} align="flex-end" style={{ flexShrink: 0, width: 46 }}>
                <Text size="md" fw={800} c={color} lh={1} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {n.similarity}
                </Text>
                <Box w="100%" h={3} bg="rgba(255,255,255,0.1)" style={{ borderRadius: 2 }}>
                  <Box w={`${n.similarity}%`} h="100%" bg={color} style={{ borderRadius: 2 }} />
                </Box>
              </Stack>
            </Group>
          );
        })}
      </Stack>
    </div>
  );
}

const formatStat = (v: number, unit: string) => (unit.startsWith("%") ? `${Math.round(v)}%` : v.toFixed(2));

/** Percentile bars, grouped (striking, shot selection, grappling). */
function StyleProfile({ data, fighter }: { data: StyleMapData; fighter: Fighter }) {
  return (
    <div>
      <Text fw={700} mt="xs">
        Style profile
      </Text>
      <Text size="xs" c="dimmed" mb={4}>
        Percentile among fighters on the map.
      </Text>
      <Stack gap={10}>
        {featureGroups(data.features).map(({ group, features }) => (
          <Stack key={group} gap={6}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.06em" }}>
              {group}
            </Text>
            {features.map((feat) => (
              <StatBar key={feat.key} feat={feat} fighter={fighter} />
            ))}
          </Stack>
        ))}
      </Stack>
    </div>
  );
}

function StatBar({ feat, fighter }: { feat: Feature; fighter: Fighter }) {
  const pct = (fighter.percentiles[feat.key] ?? 0) * 100;
  return (
    <div>
      <Group justify="space-between" wrap="nowrap" gap={6}>
        <Text size="xs">{feat.label}</Text>
        <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {formatStat(fighter.stats[feat.key] ?? 0, feat.unit)} · {ordinal(Math.round(pct))}
        </Text>
      </Group>
      <Progress value={pct} size="sm" />
    </div>
  );
}

export function FighterAvatar({ fighter, size }: { fighter: Fighter; size: number }) {
  const initials = fighter.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <Avatar src={fighter.image?.url} alt={fighter.name} size={size} radius="xl" color="red">
      {initials}
    </Avatar>
  );
}

function StyleOverview({ data }: { data: StyleMapData }) {
  const before = data.embedding_check.career_stats;
  const now = data.embedding_check.style_stats;
  return (
    <Stack gap="sm">
      <Title order={4}>Styles</Title>
      <Text size="sm" c="dimmed">
        Click any fighter on the map, or search for one, to see their profile and the fighters
        whose style is closest. Drag to rotate, scroll to zoom. Click a style in the legend to hide
        it, or use "Show" to focus on champions or ranked fighters.
      </Text>
      {data.clusters.map((c) => (
        <div key={c.id}>
          <Group gap={6} wrap="nowrap">
            <Box w={8} h={8} bg={colorOfGroup(c.name, "style")} style={{ borderRadius: "50%", flexShrink: 0 }} />
            <Text fw={600} size="sm">
              {c.name} <Text span c="dimmed" size="xs">({c.size})</Text>
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {c.description}
          </Text>
        </div>
      ))}
      <Title order={5} mt="xs">
        How similarity works
      </Title>
      <Text size="xs" c="dimmed">
        Every fighter is a point in a {data.features.length}-stat style space: output, accuracy and
        power, where their strikes land (head, body, legs) and where they throw them (at range, in
        the clinch, on the ground), takedowns, control and submissions. Stats from only a few fights
        are pulled toward the average, and each stat counts by how steady it is over a career.
      </Text>
      {before && now && (
        <Text size="xs" c="dimmed">
          The test: split a fighter's fights in two and look for the other half among {now.n}{" "}
          fighters. It's in the top 10 {Math.round(now.top10 * 100)}% of the time, up from{" "}
          {Math.round(before.top10 * 100)}% with UFCStats' 8 career averages alone.
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Data from UFCStats, fights until {data.source.fights_until}; rankings as of{" "}
        {data.champions_as_of}.
      </Text>
    </Stack>
  );
}
