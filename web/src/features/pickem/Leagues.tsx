// The Pick'em side panel: the leaderboard for everyone or for one of your leagues, and the
// league controls (create, join with a code, invite friends, leave). An invite link is
// /pickem?join=CODE: opening it joins that league (after signing in, if need be).

import { Button, Group, Loader, Modal, Paper, SegmentedControl, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { PlayerAvatar } from "../../auth/PlayerAvatar";
import type { LeaderboardRow } from "../../backend";
import { useFriends, useFriendsStandings } from "../friends/useFriends";
import { EVERYONE, FRIENDS, useLeaderboard, useLeagueActions, useLeagues, useStandings } from "./usePickem";

const TOP = 10; // rows shown before "Show all"
const MEDALS = ["#f4c430", "#c0c6cf", "#cd7f32"];

/** A player's page. */
export const playerPath = (displayName: string) => `/u/${encodeURIComponent(displayName)}`;

/** A league's invite link: opening it joins the league (after signing in, if need be). */
export const inviteLink = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}pickem?join=${code}`;

export async function copyInviteLink(code: string) {
  const link = inviteLink(code);
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    window.prompt("Copy this invite link:", link);
  }
}

interface Props {
  /** The league open on the board (or EVERYONE): the page shows that league's faces. */
  selected: string;
  setSelected: (id: string) => void;
}

export function Leagues({ selected, setSelected }: Props) {
  const { user, profile } = useAuth();
  const leagues = useLeagues();
  const actions = useLeagueActions();
  const [dialog, setDialog] = useState<"create" | "join" | "leave" | null>(null);
  const [copied, setCopied] = useState(false);
  const [params, setParams] = useSearchParams();
  const invite = params.get("join");

  // Opening an invite link joins the league, once signed in with a display name.
  useEffect(() => {
    if (!invite || !user || !profile || actions.join.isPending) return;
    actions.join.mutate(invite, {
      onSuccess: (id) => setSelected(id),
      onSettled: () => {
        params.delete("join");
        setParams(params, { replace: true });
      },
    });
    // Once per invite and sign-in, not on every render.
  }, [invite, user, profile]);

  const league = leagues.data?.find((l) => l.id === selected) ?? null;
  const friends = useFriends();
  const hasFriends = (friends.data ?? []).some((f) => f.status === "friends");
  const showFriends = selected === FRIENDS && hasFriends;
  const everyone = useLeaderboard();
  const standings = useStandings(league?.id ?? null);
  const friendsBoard = useFriendsStandings(showFriends);
  const rows = league ? standings : showFriends ? friendsBoard : everyone;
  const boards = [
    { value: EVERYONE, label: "Everyone" },
    ...(hasFriends ? [{ value: FRIENDS, label: "Friends" }] : []),
    ...(leagues.data ?? []).map((l) => ({ value: l.id, label: l.name })),
  ];
  const error = actions.create.error ?? actions.join.error ?? actions.leave.error;

  const copyInvite = async () => {
    if (!league) return;
    await copyInviteLink(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Paper p="lg" radius="md" className="pickem-board">
      <Stack gap="md">
        <Title order={3}>Leaderboard</Title>
        {user && boards.length > 1 && (
          <SegmentedControl
            size="xs"
            fullWidth
            value={league ? league.id : showFriends ? FRIENDS : EVERYONE}
            onChange={setSelected}
            data={boards}
          />
        )}
        {invite && !user && (
          <Text size="sm" c="red.3">
            Sign in to join your friend's league.
          </Text>
        )}

        <Standings rows={rows.data} loading={rows.isPending && rows.fetchStatus !== "idle"} me={profile?.displayName} inLeague={!!league} />

        {league && (
          <Group gap="xs">
            <Button size="xs" variant="light" onClick={copyInvite}>
              {copied ? "Link copied" : "Invite friends"}
            </Button>
            <Text size="xs" c="dimmed">
              Code {league.inviteCode}
            </Text>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              ml="auto"
              onClick={() => setDialog("leave")}
            >
              {league.isOwner ? "Delete league" : "Leave"}
            </Button>
          </Group>
        )}
        {user && profile && (
          <Group gap="xs" grow>
            <Button size="xs" variant="default" onClick={() => setDialog("create")}>
              New league
            </Button>
            <Button size="xs" variant="default" onClick={() => setDialog("join")}>
              Join with code
            </Button>
          </Group>
        )}
        {!user && (
          <Text size="xs" c="dimmed">
            Sign in to start a league with your friends.
          </Text>
        )}
        {error && (
          <Text size="xs" c="red">
            {error.message}
          </Text>
        )}
      </Stack>

      {/* Leaving, and above all deleting, is final: ask first. */}
      <Modal
        opened={dialog === "leave" && !!league}
        onClose={() => setDialog(null)}
        title={league?.isOwner ? `Delete "${league?.name}"?` : `Leave "${league?.name}"?`}
        centered
        size="sm"
      >
        <Stack gap="sm">
          <Text size="sm">
            {league?.isOwner
              ? "This deletes the league for everyone in it: its standings and invite link go too. Everyone keeps their own picks and points. It can't be undone."
              : "You'll leave its leaderboard. You can rejoin any time with the invite link."}
          </Text>
          <Button
            color="red"
            loading={actions.leave.isPending}
            onClick={() =>
              league &&
              actions.leave.mutate(league.id, {
                onSuccess: () => {
                  setSelected(EVERYONE);
                  setDialog(null);
                },
              })
            }
          >
            {league?.isOwner ? "Delete league" : "Leave league"}
          </Button>
          <Button variant="subtle" onClick={() => setDialog(null)}>
            Cancel
          </Button>
        </Stack>
      </Modal>
      <NameDialog
        opened={dialog === "create"}
        title="New league"
        label="League name"
        placeholder="e.g. Gym boys"
        action="Create"
        busy={actions.create.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(name) =>
          actions.create.mutate(name, {
            onSuccess: (l) => {
              setSelected(l.id);
              setDialog(null);
            },
          })
        }
      />
      <NameDialog
        opened={dialog === "join"}
        title="Join a league"
        label="Invite code"
        placeholder="e.g. AB12CD34"
        action="Join"
        busy={actions.join.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(code) =>
          actions.join.mutate(code, {
            onSuccess: (id) => {
              setSelected(id);
              setDialog(null);
            },
          })
        }
      />
    </Paper>
  );
}

function Standings({ rows, loading, me, inLeague }: { rows?: LeaderboardRow[]; loading: boolean; me?: string; inLeague: boolean }) {
  const [all, setAll] = useState(false);
  if (loading) return <Loader size="sm" />;
  if (!rows?.length)
    return (
      <Text size="sm" c="dimmed">
        {inLeague ? "Nobody here yet: send your friends the invite link." : "No scores yet. Picks are scored after each event: get yours in and be first on the board."}
      </Text>
    );
  // Big boards: the top 10, plus your own row if you're further down, until "Show all".
  const mine = rows.findIndex((r) => r.displayName === me);
  const shown = rows.map((row, i) => ({ row, i })).filter(({ i }) => all || i < TOP || i === mine);
  return (
    <Stack gap={8}>
      {rows.length > TOP && (
        <Text size="xs" c="dimmed">
          {rows.length} players
        </Text>
      )}
      {shown.map(({ row, i }) => (
        <Group
          key={row.displayName}
          justify="space-between"
          wrap="nowrap"
          className="pickem-row"
          data-me={row.displayName === me || undefined}
          // The whole row opens the player's page.
          renderRoot={(props) => <Link {...props} to={playerPath(row.displayName)} />}
        >
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Text fw={800} w={22} ta="right" c={i < 3 && row.points > 0 ? undefined : "dimmed"} style={i < 3 && row.points > 0 ? { color: MEDALS[i] } : undefined}>
              {i + 1}
            </Text>
            <PlayerAvatar name={row.displayName} avatar={row.avatar} size={34} style={i < 3 && row.points > 0 ? { boxShadow: `0 0 0 2px ${MEDALS[i]}` } : undefined} />
            <div style={{ minWidth: 0 }}>
              <Text fw={700} truncate lh={1.25}>
                {row.displayName}
              </Text>
              <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
                {row.correct}/{row.picked} right{row.events > 1 ? ` · ${row.events} cards` : ""}
              </Text>
            </div>
          </Group>
          <Text fz="lg" fw={800} style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {row.points}
            <Text span size="xs" c="dimmed" fw={600}>
              {" "}
              pts
            </Text>
          </Text>
        </Group>
      ))}
      {rows.length > TOP && (
        <Button size="xs" variant="subtle" color="gray" onClick={() => setAll((a) => !a)}>
          {all ? "Show the top 10" : `Show all ${rows.length}`}
        </Button>
      )}
    </Stack>
  );
}

interface NameDialogProps {
  opened: boolean;
  title: string;
  label: string;
  placeholder: string;
  action: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

function NameDialog({ opened, title, label, placeholder, action, busy, onClose, onSubmit }: NameDialogProps) {
  const [value, setValue] = useState("");
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <Stack gap="sm">
          <TextInput label={label} placeholder={placeholder} value={value} onChange={(e) => setValue(e.currentTarget.value)} data-autofocus />
          <Button type="submit" loading={busy}>
            {action}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
