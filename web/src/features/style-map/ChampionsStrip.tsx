import { Avatar, Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";

import type { StyleMapData } from "../../data/types";
import { GOLD, WEIGHT_CLASSES } from "./model";

interface Props {
  data: StyleMapData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ChampionsStrip({ data, selectedId, onSelect }: Props) {
  const champs = [...data.champions].sort(
    (a, b) => WEIGHT_CLASSES.indexOf(a.division) - WEIGHT_CLASSES.indexOf(b.division),
  );

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        🏆 Current champions{" "}
        {data.champions_as_of && (
          <Text span size="xs" c="dimmed">
            ({data.champions_as_of})
          </Text>
        )}
      </Text>
      <Group gap={8}>
        {champs.map((c) => {
          const onMap = c.fighter_id !== null;
          return (
            <Tooltip
              key={c.name}
              withArrow
              label={`${c.name} · ${c.division}${onMap ? "" : " · not on the map yet (no stats)"}`}
            >
              <UnstyledButton
                onClick={() => c.fighter_id && onSelect(c.fighter_id)}
                style={{
                  borderRadius: "50%",
                  outline: c.fighter_id === selectedId ? `2px solid ${GOLD}` : "none",
                  outlineOffset: 2,
                  opacity: onMap ? 1 : 0.4,
                  cursor: onMap ? "pointer" : "default",
                }}
              >
                <Avatar src={c.image?.url} alt={c.name} size={40} radius="xl" color="red">
                  {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </Avatar>
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </Group>
    </Stack>
  );
}
