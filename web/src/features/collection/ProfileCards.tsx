// A player's cards in one box: the ones their right calls earned and the ones pulled from packs,
// side by side (one above the other on phones). The box folds away; the choice is remembered.

import { Collapse, Group, Paper, Text, UnstyledButton } from "@mantine/core";
import { useMemo, useState } from "react";

import type { PastPick } from "../../backend";
import { CardCollection } from "./Collection";
import { earnedCards } from "./earned";
import { PulledCards } from "./Packs";
import { usePulledCards } from "./pulls";

const KEY = "profile-cards-open";

function useRemembered(initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      return saved === null ? initial : saved === "1";
    } catch {
      return initial;
    }
  });
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      // private mode: just not remembered
    }
  };
  return [value, set];
}

export function ProfileCards({ history, userId, isMe, displayName }: { history: PastPick[]; userId: string; isMe: boolean; displayName: string }) {
  const called = useMemo(() => earnedCards(history).length, [history]);
  const pulled = usePulledCards(userId).data?.length ?? 0;
  const [open, setOpen] = useRemembered(true);
  if (!isMe && !called && !pulled) return null;

  return (
    <Paper p="md" radius="md" className="pickem-board">
      <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} w="100%">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" align="baseline">
            <Text fw={800} fz="lg">
              Cards
            </Text>
            <Text size="sm" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
              {called} called · {pulled} pulled
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {open ? "Hide" : "Show"} <span className="profile-cards-chevron" data-open={open || undefined} aria-hidden>▾</span>
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open} transitionDuration={250}>
        <div className="profile-cards">
          <CardCollection history={history} isMe={isMe} displayName={displayName} />
          <PulledCards userId={userId} isMe={isMe} displayName={displayName} />
        </div>
      </Collapse>
    </Paper>
  );
}
