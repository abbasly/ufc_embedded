// Which emails you get from us, besides the sign-in ones: your results after each card, and
// friend requests. Both on by default; each one's footer links here.

import { Paper, Stack, Switch, Title } from "@mantine/core";
import { useState } from "react";

import { useAuth } from "../../auth/AuthProvider";

export function EmailSettings() {
  const { profile, backend, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!profile || !backend) return null;
  const save = async (changes: { notifyResults?: boolean; notifyFriendRequests?: boolean }) => {
    setBusy(true);
    try {
      await backend.profiles.update(changes);
      await refreshProfile();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Title order={4} mb="sm">
        Emails
      </Title>
      <Stack gap="sm">
        <Switch
          label="My results after each card"
          description="How you did, your best call and whether you beat the model"
          checked={profile.notifyResults !== false}
          disabled={busy}
          onChange={(e) => void save({ notifyResults: e.currentTarget.checked })}
        />
        <Switch
          label="Friend requests"
          checked={profile.notifyFriendRequests !== false}
          disabled={busy}
          onChange={(e) => void save({ notifyFriendRequests: e.currentTarget.checked })}
        />
      </Stack>
    </Paper>
  );
}
