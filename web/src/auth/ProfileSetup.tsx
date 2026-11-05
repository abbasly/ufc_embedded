// After the first sign-in: choose the display name shown on the leaderboard. Shown on its own
// whenever someone is signed in without a profile yet.

import { Button, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";

import { useAuth } from "./AuthProvider";

const VALID = /^[A-Za-z0-9_.-]{3,24}$/;

export function ProfileSetup() {
  const { backend, user, profile, profileReady, refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = !!user && profileReady && !profile;

  const save = async () => {
    if (!backend) return;
    if (!VALID.test(name.trim())) {
      setError("3-24 letters, digits, dots, dashes or underscores.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await backend.profiles.create(name);
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={open} onClose={() => backend?.auth.signOut()} title="Pick a display name" centered size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            It's how you'll appear on the leaderboard. You can change it later.
          </Text>
          <TextInput placeholder="e.g. chama_fan" value={name} onChange={(e) => setName(e.currentTarget.value)} error={error} data-autofocus />
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
