// Your friends on your profile: requests waiting for you first, then your friends, then the
// requests you've sent. Names open player pages.

import { Anchor, Button, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

import { PlayerAvatar } from "../../auth/PlayerAvatar";
import type { Friend } from "../../backend";
import { playerPath } from "../pickem/Leagues";
import { useFriendActions, useFriends } from "./useFriends";

export function FriendsList() {
  const friends = useFriends();
  const actions = useFriendActions();
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

  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Title order={4} mb="sm">
        Friends{mine.length > 0 && <Text span c="dimmed" fw={500}> · {mine.length}</Text>}
      </Title>
      {friends.isPending ? (
        <Loader size="sm" />
      ) : !all.length ? (
        <Text size="sm" c="dimmed">
          No friends yet. Tap a name on any leaderboard and hit <b>Add friend</b>: friends get their own leaderboard tab and
          see each other's picks once a card locks.
        </Text>
      ) : (
        <Stack gap={10}>
          {incoming.map((f) =>
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
          )}
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
      )}
    </Paper>
  );
}
