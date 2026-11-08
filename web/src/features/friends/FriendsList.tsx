// Your friends on your profile, folded away behind a row of faces. Requests waiting for you stay
// in view, since they need an answer; opening it shows your friends and the requests you've sent.
// Names open player pages.

import { Anchor, Avatar, Button, Collapse, Group, Loader, Paper, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";

import { PlayerAvatar } from "../../auth/PlayerAvatar";
import type { Friend } from "../../backend";
import { playerPath } from "../pickem/Leagues";
import { useFriendActions, useFriends } from "./useFriends";

export function FriendsList() {
  const friends = useFriends();
  const actions = useFriendActions();
  const [open, setOpen] = useState(false);
  const all = friends.data ?? [];
  const incoming = all.filter((f) => f.status === "incoming");
  const mine = all.filter((f) => f.status === "friends");
  const outgoing = all.filter((f) => f.status === "outgoing");

  const person = (f: Friend, extra?: React.ReactNode) => (
    <Group key={f.userId} justify="space-between" wrap="nowrap" gap="sm">
      <Anchor component={Link} to={playerPath(f.displayName)} c="inherit" underline="never" style={{ minWidth: 0 }}>
        <Group gap="sm" wrap="nowrap">
          <PlayerAvatar name={f.displayName} avatar={f.avatar} size={32} />
          <Text fw={600} truncate>
            {f.displayName}
          </Text>
        </Group>
      </Anchor>
      {extra}
    </Group>
  );

  const answer = incoming.map((f) =>
    person(
      f,
      <Group gap={6} wrap="nowrap">
        <Button size="xs" onClick={() => actions.accept.mutate(f.userId)} loading={actions.accept.isPending}>
          Accept
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={() => actions.remove.mutate(f.userId)}>
          Decline
        </Button>
      </Group>,
    ),
  );
  const folded = mine.length + outgoing.length > 0;

  return (
    <Paper p="md" radius="md" className="pickem-board">
      {folded ? (
        <UnstyledButton onClick={() => setOpen((o) => !o)} aria-expanded={open} w="100%">
          <Group justify="space-between" wrap="nowrap">
            <Title order={4}>
              Friends{mine.length > 0 && <Text span c="dimmed" fw={500}> · {mine.length}</Text>}
            </Title>
            <Group gap="sm" wrap="nowrap">
              {!open && mine.length > 0 && (
                <Avatar.Group spacing="xs">
                  {mine.slice(0, 5).map((f) => (
                    <PlayerAvatar key={f.userId} name={f.displayName} avatar={f.avatar} size={28} />
                  ))}
                  {mine.length > 5 && <Avatar size={28} radius="xl">+{mine.length - 5}</Avatar>}
                </Avatar.Group>
              )}
              <span className="pickem-chevron" data-open={open || undefined} aria-hidden>
                ▾
              </span>
            </Group>
          </Group>
        </UnstyledButton>
      ) : (
        <Title order={4}>Friends</Title>
      )}
      {friends.isPending ? (
        <Loader size="sm" mt="sm" />
      ) : !all.length ? (
        <Text size="sm" c="dimmed" mt="sm">
          No friends yet. Tap a name on any leaderboard and hit <b>Add friend</b>: friends get their own leaderboard tab and
          see each other's picks once a card locks.
        </Text>
      ) : (
        <>
          {incoming.length > 0 && (
            <Stack gap={10} mt="sm">
              {answer}
            </Stack>
          )}
          <Collapse expanded={open}>
            <Stack gap={10} mt="sm">
              {mine.map((f) => person(f))}
              {outgoing.map((f) =>
                person(
                  f,
                  <Button size="xs" variant="subtle" color="gray" onClick={() => actions.remove.mutate(f.userId)}>
                    Requested · undo
                  </Button>,
                ),
              )}
            </Stack>
          </Collapse>
        </>
      )}
    </Paper>
  );
}
