import { Text } from "@mantine/core";

import type { FightRecord } from "../data/types";

/** "29-4-0" with wins green, losses red and draws grey, followed by a dimmed "(W-L-D)". */
export function RecordText({ record, size = "sm" }: { record: FightRecord; size?: "xs" | "sm" }) {
  return (
    <Text size={size} fw={700} span>
      <Text span inherit c="green.5">
        {record.wins}
      </Text>
      -
      <Text span inherit c="red.5">
        {record.losses}
      </Text>
      -
      <Text span inherit c="gray.5">
        {record.draws}
      </Text>{" "}
      <Text span size="xs" fw={400} c="dimmed">
        (W-L-D)
      </Text>
    </Text>
  );
}
