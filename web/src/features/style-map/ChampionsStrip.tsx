import { Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";

import type { StyleMapData } from "../../data/types";
import { FighterAvatar } from "./FighterPanel";
import { WEIGHT_CLASSES } from "./plot";

interface Props {
  data: StyleMapData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ChampionsStrip({ data, selectedId, onSelect }: Props) {
  const champs = data.fighters
    .filter((f) => f.champion)
    .sort((a, b) => WEIGHT_CLASSES.indexOf(a.champion!) - WEIGHT_CLASSES.indexOf(b.champion!));

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        🏆 Champions <Text span size="xs" c="dimmed">(as of {data.source.champions_as_of})</Text>
      </Text>
      <Group gap={8}>
        {champs.map((f) => (
          <Tooltip key={f.id} label={`${f.name} · ${f.champion}`} withArrow>
            <UnstyledButton
              onClick={() => onSelect(f.id)}
              style={{
                borderRadius: "50%",
                outline: f.id === selectedId ? "2px solid #f5c518" : "none",
                outlineOffset: 2,
              }}
            >
              <FighterAvatar fighter={f} size={40} />
            </UnstyledButton>
          </Tooltip>
        ))}
      </Group>
    </Stack>
  );
}
