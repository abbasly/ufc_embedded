// The header's account corner: "Sign in", or the signed-in user's avatar with a menu (profile,
// Pick'em, sign out). Renders nothing when accounts are off.

import { Button, Menu, Modal, Stack, Text, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "./AuthProvider";
import { PasswordModal } from "./PasswordModal";
import { PlayerAvatar } from "./PlayerAvatar";
import { ProfileSetup } from "./ProfileSetup";
import { SignInModal } from "./SignInModal";

export function UserMenu() {
  const { enabled, loading, user, profile, backend, recovering, endRecovery, linkError, clearLinkError } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  if (!enabled || loading) return null;

  // An email link that didn't work (expired, already used).
  const linkNotice = (
    <Modal opened={!!linkError} onClose={clearLinkError} title="That link didn't work" centered size="sm">
      <Stack gap="sm">
        <Text size="sm">{linkError}</Text>
        <Button onClick={clearLinkError}>OK</Button>
      </Stack>
    </Modal>
  );

  if (!user) {
    return (
      <>
        {linkNotice}
        <Button size="compact-sm" variant="light" onClick={() => setSigningIn(true)}>
          Sign in
        </Button>
        <SignInModal opened={signingIn} onClose={() => setSigningIn(false)} />
      </>
    );
  }

  const name = profile?.displayName ?? user.email ?? "You";
  return (
    <>
      {linkNotice}
      <ProfileSetup />
      {/* Arrived from a "reset your password" email: signed in, now pick a new one. */}
      <PasswordModal opened={recovering} onClose={endRecovery} title="Set a new password" />
      <Menu position="bottom-end" withArrow>
        <Menu.Target>
          <UnstyledButton aria-label="Account">
            <PlayerAvatar name={name} avatar={profile?.avatar} size={28} />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{name}</Menu.Label>
          <Menu.Item component={Link} to="/me">
            Your profile
          </Menu.Item>
          <Menu.Item component={Link} to="/">
            Pick'em
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item onClick={() => backend?.auth.signOut()}>Sign out</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
