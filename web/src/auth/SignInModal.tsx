// Sign in with Google, or with a one-time link sent by email. No passwords to store or leak.

import { Anchor, Button, Divider, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "./AuthProvider";

function GoogleMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function SignInModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { backend } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Sign in" centered size="sm">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Pick the winners on upcoming UFC cards and see how you stack up against the model and
          other fans.
        </Text>
        <Button variant="default" leftSection={<GoogleMark />} loading={busy} onClick={() => backend && run(() => backend.auth.signInWithGoogle())}>
          Continue with Google
        </Button>
        <Divider label="or get a sign-in link by email" labelPosition="center" />
        {sent ? (
          <Text size="sm">
            Check <b>{email}</b> for a sign-in link. You can close this window.
          </Text>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (backend && email.includes("@")) void run(async () => {
                await backend.auth.signInWithEmail(email.trim());
                setSent(true);
              });
            }}
          >
            <Stack gap="xs">
              <TextInput type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
              <Button type="submit" variant="light" loading={busy}>
                Email me a link
              </Button>
            </Stack>
          </form>
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          We only keep your display name and your picks.{" "}
          <Anchor component={Link} to="/privacy" size="xs" onClick={onClose}>
            Privacy
          </Anchor>
        </Text>
      </Stack>
    </Modal>
  );
}
