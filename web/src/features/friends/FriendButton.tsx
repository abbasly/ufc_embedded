// On a player's page: "Add friend", "Requested" (tap to take it back), "Accept", or "Friends"
// (with a way to unfriend, after a confirmation).

import { Button, Group, Menu } from "@mantine/core";
import { useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { useFriendActions, useFriends } from "./useFriends";

export function FriendButton({ userId, displayName }: { userId: string; displayName: string }) {
  const { user } = useAuth();
  const friends = useFriends();
  const actions = useFriendActions();
  const [confirming, setConfirming] = useState(false);
  if (!user || user.id === userId) return null;

  const status = friends.data?.find((f) => f.userId === userId)?.status;
  const busy = actions.request.isPending || actions.accept.isPending || actions.remove.isPending;

  if (status === "friends") {
    return (
      <Menu position="bottom-end" withArrow opened={confirming} onChange={setConfirming}>
        <Menu.Target>
          <Button size="xs" variant="light" color="green" loading={busy}>
            Friends ✓
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Unfriend {displayName}?</Menu.Label>
          <Menu.Item color="red" onClick={() => actions.remove.mutate(userId)}>
            Unfriend
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );
  }
  if (status === "incoming") {
    return (
      <Group gap={6}>
        <Button size="xs" loading={busy} onClick={() => actions.accept.mutate(userId)}>
          Accept friend request
        </Button>
        <Button size="xs" variant="subtle" color="gray" disabled={busy} onClick={() => actions.remove.mutate(userId)}>
          Decline
        </Button>
      </Group>
    );
  }
  if (status === "outgoing") {
    return (
      <Button size="xs" variant="default" loading={busy} onClick={() => actions.remove.mutate(userId)} title="Tap to take the request back">
        Requested · undo
      </Button>
    );
  }
  return (
    <Button size="xs" loading={busy || friends.isPending} onClick={() => actions.request.mutate(userId)}>
      Add friend
    </Button>
  );
}
