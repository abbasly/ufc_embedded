import { Anchor, Avatar, Badge, CloseButton, Group, Progress, Stack, Text, Title, UnstyledButton } from "@mantine/core";

import type { Fighter, StyleMapData } from "../../data/types";
import { formatRecord, ordinal } from "./model";

interface Props {
  data: StyleMapData;
  fighter: Fighter | null;
  onSelect: (id: string | null) => void;
}

export function FighterPanel({ data, fighter, onSelect }: Props) {
  if (!fighter) return <StyleOverview data={data} />;

  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  const style = data.clusters.find((c) => c.id === fighter.cluster);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group wrap="nowrap" align="flex-start">
          <FighterAvatar fighter={fighter} size={64} />
          <div>
            <Title order={3}>{fighter.name}</Title>
            <Text size="sm">
              <b>{formatRecord(fighter.record)}</b>{" "}
              <Text span size="xs" c="dimmed">
                (W-L-D)
              </Text>
            </Text>
            <Text size="sm" c="dimmed">
              {fighter.weight_class}
              {fighter.rank !== null && fighter.rank > 0 && ` · #${fighter.rank}`}
            </Text>
            <Text size="sm" c="dimmed">
              Last fight {fighter.last_fight}
            </Text>
          </div>
        </Group>
        <CloseButton onClick={() => onSelect(null)} aria-label="Clear selection" />
      </Group>
      <Group gap="xs">
        {fighter.champion && (
          <Badge color="yellow" variant="filled">
            🏆 {fighter.champion} champion
          </Badge>
        )}
        {style && <Badge variant="light">{style.name}</Badge>}
      </Group>

      <Text fw={600} size="sm" mt="xs">
        Percentile among mapped fighters
      </Text>
      {data.features.map((feat) => {
        const pct = (fighter.percentiles[feat.key] ?? 0) * 100;
        return (
          <div key={feat.key}>
            <Group justify="space-between">
              <Text size="xs">{feat.label}</Text>
              <Text size="xs" c="dimmed">
                {fighter.stats[feat.key]} {feat.unit === "%" ? "%" : ""} · {ordinal(Math.round(pct))}
              </Text>
            </Group>
            <Progress value={pct} size="sm" />
          </div>
        );
      })}

      {fighter.image && (
        <Anchor href={fighter.image.credit_url} target="_blank" size="xs" c="dimmed">
          Photo: Wikimedia (licence & author)
        </Anchor>
      )}

      <Text fw={600} size="sm" mt="xs">
        Most similar fighters
      </Text>
      <Stack gap={2}>
        {fighter.neighbours.map((n) => {
          const f = byId.get(n.id);
          return (
            f && (
              <UnstyledButton key={n.id} onClick={() => onSelect(n.id)}>
                <Group justify="space-between">
                  <Text size="sm">{f.name}</Text>
                  <Text size="xs" c="dimmed">
                    {f.weight_class}
                  </Text>
                </Group>
              </UnstyledButton>
            )
          );
        })}
      </Stack>
    </Stack>
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
  return (
    <Stack gap="sm">
      <Title order={4}>Styles</Title>
      <Text size="sm" c="dimmed">
        Click any fighter on the map, or search for one, to see their profile and closest matches.
        Drag to rotate, scroll to zoom. Click a style in the legend to hide it, or use "Show" to focus
        on champions or ranked fighters.
      </Text>
      {data.clusters.map((c) => (
        <div key={c.id}>
          <Text fw={600} size="sm">
            {c.name} <Text span c="dimmed" size="xs">({c.size})</Text>
          </Text>
          <Text size="xs" c="dimmed">
            {c.description}
          </Text>
        </div>
      ))}
      <Text size="xs" c="dimmed">
        Data from UFCStats, fights until {data.source.fights_until}; rankings as of{" "}
        {data.champions_as_of}.
      </Text>
    </Stack>
  );
}
