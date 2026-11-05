// Set a new password: after arriving from a reset link, or from the profile page.

import { Button, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { useState } from "react";

import { useAuth } from "./AuthProvider";

export function PasswordModal({ opened, onClose, title }: { opened: boolean; onClose: () => void; title: string }) {
  const { backend } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => {
    setPassword("");
    setError(null);
    setDone(false);
    onClose();
  };

  const save = async () => {
    if (!backend) return;
    if (password.length < 8) return setError("Passwords are at least 8 characters.");
    setBusy(true);
    setError(null);
    try {
      await backend.auth.updatePassword(password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} title={title} centered size="sm">
      {done ? (
        <Stack gap="sm">
          <Text size="sm">Saved. Next time, sign in with your email and this password.</Text>
          <Button onClick={close}>Done</Button>
        </Stack>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Stack gap="sm">
            <PasswordInput
              label="New password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              error={error}
              data-autofocus
            />
            <Button type="submit" loading={busy}>
              Save password
            </Button>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
