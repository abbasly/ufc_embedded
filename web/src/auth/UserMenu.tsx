// The header's account corner: "Sign in", or the signed-in user's avatar with a menu (profile,
// Pick'em, sign out). Renders nothing when accounts are off.

import { Button, Indicator, Menu, Modal, Stack, Text, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";

import { useFriends } from "../features/friends/useFriends";
import { useAuth } from "./AuthProvider";
import { PasswordModal } from "./PasswordModal";
import { PlayerAvatar } from "./PlayerAvatar";
import { ProfileSetup } from "./ProfileSetup";
import { SignInModal } from "./SignInModal";

export function UserMenu() {
  const { enabled, loading, user, profile, backend, recovering, endRecovery, linkError, clearLinkError } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const friends = useFriends();
  const requests = (friends.data ?? []).filter((f) => f.status === "incoming").length;
  // The admin link only for admins (the panel's data is refused to anyone else anyway).
  const admin = useQuery({ queryKey: ["admin", "is", user?.id], queryFn: () => backend!.admin.isAdmin(), enabled: !!backend && !!user, staleTime: Infinity });

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
            {/* A dot when someone's waiting for you to accept their friend request. */}
            <Indicator disabled={!requests} color="red" size={10} offset={3} withBorder>
              <PlayerAvatar name={name} avatar={profile?.avatar} size={28} />
            </Indicator>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{name}</Menu.Label>
          <Menu.Item component={Link} to="/me">
            Your profile
            {requests > 0 && (
              <Text span c="red.4" size="xs" fw={700}>
                {" "}
                · {requests} friend {requests === 1 ? "request" : "requests"}
              </Text>
            )}
          </Menu.Item>
          <Menu.Item component={Link} to="/">
            Pick'em
          </Menu.Item>
          {admin.data && (
            <Menu.Item component={Link} to="/admin">
              Admin
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item onClick={() => backend?.auth.signOut()}>Sign out</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
