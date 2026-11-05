// Your profile: display name, picture (a fighter of your choosing), how your picks have gone,
// and the account controls (sign out, delete). Signed-in users only.

import "../pickem/Pickem.css";

import { Anchor, Avatar, Button, Center, Group, Loader, Modal, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { PasswordModal } from "../../auth/PasswordModal";
import { PlayerAvatar } from "../../auth/PlayerAvatar";
import { SignInModal } from "../../auth/SignInModal";
import { usePredictor } from "../../data/client";
import type { League } from "../../backend";
import { copyInviteLink } from "../pickem/Leagues";
import { useLeaderboard, useLeagues, useStandings } from "../pickem/usePickem";

const VALID_NAME = /^[A-Za-z0-9_.-]{3,24}$/;

export default function ProfilePage() {
  const { user, profile, profileReady, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  if (loading || (user && !profileReady)) return <Center h="60vh"><Loader /></Center>;
  if (!user) {
    return (
      <Center h="50vh">
        <Stack align="center" gap="sm">
          <Text>Sign in to see your profile and your picks.</Text>
          <Button onClick={() => setSigningIn(true)}>Sign in</Button>
          <SignInModal opened={signingIn} onClose={() => setSigningIn(false)} />
        </Stack>
      </Center>
    );
  }
  // No display name yet: the setup prompt (in the header) is open.
  if (!profile) return null;

  return (
    <Stack gap="lg" maw={720} mx="auto" pt={4}>
      <Identity />
      <Stats />
      <MyLeagues />
      <History />
      <Account />
    </Stack>
  );
}

/** Picture and name, both editable. */
function Identity() {
  const { user, profile, backend, refreshProfile } = useAuth();
  const client = useQueryClient();
  const { data: predictor } = usePredictor();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fighters with a photo, for the picture picker.
  const fighters = useMemo(
    () =>
      (predictor?.fighters ?? [])
        .filter((f) => f.image)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({ value: f.id, label: f.name })),
    [predictor],
  );
  const photo = useMemo(() => new Map(predictor?.fighters.map((f) => [f.id, f.image?.url])), [predictor]);

  if (!profile || !backend) return null;

  const save = async (changes: { displayName?: string; avatar?: string | null }) => {
    setBusy(true);
    setError(null);
    try {
      await backend.profiles.update(changes);
      await refreshProfile();
      // Names and pictures show on the leaderboards.
      await client.invalidateQueries({ queryKey: ["pickem", "leaderboard"] });
      await client.invalidateQueries({ queryKey: ["leagues", "standings"] });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper p="lg" radius="md" className="pickem-board">
      <Group gap="lg" wrap="wrap" align="center">
        <PlayerAvatar name={profile.displayName} avatar={profile.avatar} size={88} />
        <Stack gap={6} style={{ flex: 1, minWidth: 220 }}>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!VALID_NAME.test(name.trim())) return setError("3-24 letters, digits, dots, dashes or underscores.");
                void save({ displayName: name });
              }}
            >
              <Group gap="xs" align="flex-start" wrap="nowrap">
                <TextInput value={name} onChange={(e) => setName(e.currentTarget.value)} error={error} size="sm" style={{ flex: 1 }} data-autofocus />
                <Button type="submit" size="sm" loading={busy}>
                  Save
                </Button>
                <Button size="sm" variant="subtle" color="gray" onClick={() => (setEditing(false), setError(null))}>
                  Cancel
                </Button>
              </Group>
            </form>
          ) : (
            <Group gap="xs" align="baseline">
              <Title order={2} lh={1.1}>
                {profile.displayName}
              </Title>
              <Anchor component="button" size="sm" c="dimmed" onClick={() => (setName(profile.displayName), setEditing(true))}>
                Change name
              </Anchor>
            </Group>
          )}
          <Text size="xs" c="dimmed">
            Signed in as {user?.email} (only you see this)
          </Text>
          <Group gap="xs" wrap="nowrap" mt={4}>
            <Select
              size="xs"
              placeholder={predictor ? "Profile picture: pick a fighter" : "Loading fighters…"}
              data={fighters}
              value={profile.avatar}
              onChange={(id) => id && void save({ avatar: id })}
              searchable
              limit={30}
              nothingFoundMessage="No fighter by that name"
              renderOption={({ option }) => (
                <Group gap="xs" wrap="nowrap">
                  <Avatar src={photo.get(option.value)} size={22} radius="xl" />
                  <Text size="sm">{option.label}</Text>
                </Group>
              )}
              style={{ flex: 1, maxWidth: 300 }}
              aria-label="Profile picture"
              spellCheck={false}
            />
            {profile.avatar && (
              <Button size="xs" variant="subtle" color="gray" onClick={() => void save({ avatar: null })}>
                Remove
              </Button>
            )}
          </Group>
          {error && !editing && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}

function useMyScores() {
  const { backend, user } = useAuth();
  return useQuery({
    queryKey: ["pickem", "my-scores", user?.id],
    queryFn: () => backend!.pickem.myScores(),
    enabled: !!backend && !!user,
  });
}

/** Totals over every scored card, and where that puts you on the overall leaderboard. */
function Stats() {
  const { profile } = useAuth();
  const scores = useMyScores();
  const board = useLeaderboard();
  const rows = scores.data ?? [];
  const points = rows.reduce((n, r) => n + r.points, 0);
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  const picked = rows.reduce((n, r) => n + r.picked, 0);
  const rank = board.data?.findIndex((r) => r.displayName === profile?.displayName) ?? -1;

  const tiles = [
    { label: "Points", value: String(points) },
    { label: "Right picks", value: picked ? `${correct}/${picked}` : "–", note: picked ? `${Math.round((100 * correct) / picked)}%` : undefined },
    { label: "Cards played", value: String(rows.length) },
    { label: "Rank", value: rank >= 0 ? `#${rank + 1}` : "–", note: rank >= 0 ? "overall" : undefined },
  ];
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
      {tiles.map((t) => (
        <Paper key={t.label} p="md" radius="md" className="pickem-board">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: "0.08em" }}>
            {t.label}
          </Text>
          <Group gap={6} align="baseline">
            <Text fz={26} fw={800} style={{ fontVariantNumeric: "tabular-nums" }}>
              {t.value}
            </Text>
            {t.note && (
              <Text size="sm" c="dimmed">
                {t.note}
              </Text>
            )}
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Your leagues, each with where you stand, a way in and its invite link. */
function MyLeagues() {
  const leagues = useLeagues();
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Title order={4} mb="sm">
        Your leagues
      </Title>
      {leagues.isPending ? (
        <Loader size="sm" />
      ) : !leagues.data?.length ? (
        <Text size="sm" c="dimmed">
          No leagues yet.{" "}
          <Anchor component={Link} to="/">
            Start one or join with a code on Pick'em →
          </Anchor>
        </Text>
      ) : (
        <Stack gap={10}>
          {leagues.data.map((l) => (
            <LeagueRow key={l.id} league={l} />
          ))}
        </Stack>
      )}
    </Paper>
  );
}

function LeagueRow({ league }: { league: League }) {
  const { profile } = useAuth();
  const standings = useStandings(league.id);
  const [copied, setCopied] = useState(false);
  const rows = standings.data ?? [];
  const rank = rows.findIndex((r) => r.displayName === profile?.displayName);
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <div style={{ minWidth: 0 }}>
        <Text fw={700} truncate>
          {league.name}
        </Text>
        <Text size="xs" c="dimmed">
          {standings.isPending
            ? "…"
            : `${rows.length} ${rows.length === 1 ? "member" : "members"}${rank >= 0 ? ` · you're #${rank + 1}` : ""}${league.isOwner ? " · yours" : ""}`}
        </Text>
      </div>
      <Group gap={6} wrap="nowrap">
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          onClick={async () => {
            await copyInviteLink(league.inviteCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Invite"}
        </Button>
        <Button size="xs" variant="light" component={Link} to={`/?league=${league.id}`}>
          Open
        </Button>
      </Group>
    </Group>
  );
}

function History() {
  const scores = useMyScores();
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Title order={4} mb="sm">
        Past cards
      </Title>
      {scores.isPending ? (
        <Loader size="sm" />
      ) : !scores.data?.length ? (
        <Text size="sm" c="dimmed">
          No scored cards yet. Cards are scored once the results are in.{" "}
          <Anchor component={Link} to="/">
            Make your picks →
          </Anchor>
        </Text>
      ) : (
        <Stack gap={8}>
          {scores.data.map((s) => (
            <Group key={s.eventId} justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {s.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {day(s.startsOn)} · {s.correct}/{s.picked} right
                </Text>
              </div>
              <Text fw={800} style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {s.points} pts
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

function Account() {
  const { backend } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  return (
    <Group gap="sm">
      <Button variant="default" onClick={() => backend?.auth.signOut()}>
        Sign out
      </Button>
      {/* Also how Google users (or early email-link users) add a password. */}
      <Button variant="subtle" color="gray" onClick={() => setChangingPassword(true)}>
        Change password
      </Button>
      <PasswordModal opened={changingPassword} onClose={() => setChangingPassword(false)} title="Change your password" />
      <Button variant="subtle" color="red" c="red.4" onClick={() => setConfirmDelete(true)}>
        Delete account
      </Button>
      {/* Deleting is final: confirm in-page first. */}
      <Modal opened={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?" centered size="sm">
        <Stack gap="sm">
          <Text size="sm">This deletes your account, your display name, all your picks, scores and leagues you created. It can't be undone.</Text>
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
    </Group>
  );
}
