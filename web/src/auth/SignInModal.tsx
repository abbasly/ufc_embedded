// Sign in with Google, or with an email and password (a new account confirms its email first;
// a forgotten password gets a reset link). Passwords are Supabase Auth's: hashed, never ours.

import { Anchor, Button, Divider, Modal, PasswordInput, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
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

type Mode = "signin" | "signup" | "reset";

export function SignInModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { backend } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<string | null>(null); // a "check your email" message
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(null);
  };

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

  const submit = () => {
    if (!backend) return;
    const address = email.trim();
    if (!address.includes("@")) return setError("Enter your email address.");
    if (mode === "reset") {
      return void run(async () => {
        await backend.auth.sendPasswordReset(address);
        setSent(`If there's an account for ${address}, a link to set a new password is on its way.`);
      });
    }
    if (password.length < 8) return setError("Passwords are at least 8 characters.");
    if (mode === "signin") return void run(() => backend.auth.signInWithPassword(address, password));
    void run(async () => {
      const result = await backend.auth.signUp(address, password);
      if (result === "confirm") setSent(`Almost there: open the link we sent to ${address} to confirm your account, then come back and sign in.`);
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={mode === "signup" ? "Create an account" : mode === "reset" ? "Reset your password" : "Sign in"} centered size="sm">
      <Stack gap="sm">
        {mode !== "reset" && (
          <>
            <Text size="sm" c="dimmed">
              Pick the winners on upcoming UFC cards and see how you stack up against the model and other fans.
            </Text>
            <Button variant="default" leftSection={<GoogleMark />} loading={busy} onClick={() => backend && run(() => backend.auth.signInWithGoogle())}>
              Continue with Google
            </Button>
            <Divider label="or with email" labelPosition="center" />
            <SegmentedControl
              size="xs"
              fullWidth
              value={mode}
              onChange={(m) => switchTo(m as Mode)}
              data={[
                { value: "signin", label: "Sign in" },
                { value: "signup", label: "Create account" },
              ]}
            />
          </>
        )}
        {sent ? (
          <Text size="sm">{sent}</Text>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Stack gap="xs">
              {mode === "reset" && (
                <Text size="sm" c="dimmed">
                  We'll email you a link to set a new password.
                </Text>
              )}
              <TextInput type="email" label="Email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
              {mode !== "reset" && (
                <PasswordInput
                  label="Password"
                  placeholder={mode === "signup" ? "At least 8 characters" : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  required
                />
              )}
              <Button type="submit" loading={busy} mt={4}>
                {mode === "signup" ? "Create account" : mode === "reset" ? "Send the link" : "Sign in"}
              </Button>
            </Stack>
          </form>
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        {mode === "signin" && !sent && (
          <Anchor component="button" type="button" size="xs" c="dimmed" ta="left" onClick={() => switchTo("reset")}>
            Forgot your password?
          </Anchor>
        )}
        {mode === "reset" && (
          <Anchor component="button" type="button" size="xs" c="dimmed" ta="left" onClick={() => switchTo("signin")}>
            ← Back to sign in
          </Anchor>
        )}
        <Text size="xs" c="dimmed">
          We only keep your email, display name and picks.{" "}
          <Anchor component={Link} to="/privacy" size="xs" onClick={onClose}>
            Privacy
          </Anchor>
        </Text>
      </Stack>
    </Modal>
  );
}
