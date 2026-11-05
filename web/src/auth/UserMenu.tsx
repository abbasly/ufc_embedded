// The header's account corner: "Sign in", or the signed-in user's menu (sign out, delete
// account). Renders nothing when accounts are off.

import { Avatar, Button, Menu, Modal, Stack, Text, UnstyledButton } from "@mantine/core";
import { useState } from "react";

import { useAuth } from "./AuthProvider";
import { ProfileSetup } from "./ProfileSetup";
import { SignInModal } from "./SignInModal";

export function UserMenu() {
  const { enabled, loading, user, profile, backend } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!enabled || loading) return null;

  if (!user) {
    return (
      <>
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
      <ProfileSetup />
      <Menu position="bottom-end" withArrow>
        <Menu.Target>
          <UnstyledButton aria-label="Account">
            <Avatar size={28} radius="xl" color="red" variant="filled">
              {name.slice(0, 1).toUpperCase()}
            </Avatar>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{name}</Menu.Label>
          <Menu.Item onClick={() => backend?.auth.signOut()}>Sign out</Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {/* Deleting is final: confirm in-page first. */}
      <Modal opened={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?" centered size="sm">
        <Stack gap="sm">
          <Text size="sm">This deletes your account, your display name, all your picks and scores. It can't be undone.</Text>
          <Button
            color="red"
            loading={deleting}
            onClick={async () => {
              if (!backend) return;
              setDeleting(true);
              try {
                await backend.auth.deleteAccount();
              } finally {
                setDeleting(false);
                setConfirmDelete(false);
              }
            }}
          >
            Delete everything
          </Button>
          <Button variant="subtle" onClick={() => setConfirmDelete(false)}>
            Keep my account
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
