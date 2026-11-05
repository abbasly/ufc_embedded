// The Pick'em side panel: the leaderboard for everyone or for one of your leagues, and the
// league controls (create, join with a code, invite friends, leave). An invite link is
// /pickem?join=CODE: opening it joins that league (after signing in, if need be).

import { Button, Group, Loader, Modal, Paper, SegmentedControl, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { PlayerAvatar } from "../../auth/PlayerAvatar";
import type { LeaderboardRow } from "../../backend";
import { EVERYONE, useLeaderboard, useLeagueActions, useLeagues, useStandings } from "./usePickem";

const TOP = 25;

interface Props {
  /** The league open on the board (or EVERYONE): the page shows that league's faces. */
  selected: string;
  setSelected: (id: string) => void;
}

export function Leagues({ selected, setSelected }: Props) {
  const { user, profile } = useAuth();
  const leagues = useLeagues();
  const actions = useLeagueActions();
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);
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
  const everyone = useLeaderboard();
  const standings = useStandings(league?.id ?? null);
  const rows = league ? standings : everyone;
  const error = actions.create.error ?? actions.join.error ?? actions.leave.error;

  const copyInvite = async () => {
    if (!league) return;
    const link = `${window.location.origin}${import.meta.env.BASE_URL}pickem?join=${league.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Stack gap="sm">
        <Title order={4}>Leaderboard</Title>
        {user && (leagues.data?.length ?? 0) > 0 && (
          <SegmentedControl
            size="xs"
            fullWidth
            value={league ? league.id : EVERYONE}
            onChange={setSelected}
            data={[{ value: EVERYONE, label: "Everyone" }, ...(leagues.data ?? []).map((l) => ({ value: l.id, label: l.name }))]}
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
              onClick={() => actions.leave.mutate(league.id, { onSuccess: () => setSelected(EVERYONE) })}
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
  if (loading) return <Loader size="sm" />;
  if (!rows?.length)
    return (
      <Text size="sm" c="dimmed">
        {inLeague ? "Nobody here yet: send your friends the invite link." : "No scores yet. Picks are scored after each event: get yours in and be first on the board."}
      </Text>
    );
  // Big boards (a subreddit's league): the top 25, plus your own row if you're further down.
  const mine = rows.findIndex((r) => r.displayName === me);
  const shown = rows.map((row, i) => ({ row, i })).filter(({ i }) => i < TOP || i === mine);
  return (
    <Stack gap={6}>
      {rows.length > TOP && (
        <Text size="xs" c="dimmed">
          {rows.length} players
        </Text>
      )}
      {shown.map(({ row, i }) => (
        <Group key={row.displayName} justify="space-between" wrap="nowrap" className="pickem-row" data-me={row.displayName === me || undefined}>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Text size="sm" c="dimmed" w={20} ta="right">
              {i + 1}
            </Text>
            <PlayerAvatar name={row.displayName} avatar={row.avatar} size={22} />
            <Text size="sm" fw={600} truncate>
              {row.displayName}
            </Text>
          </Group>
          <Text size="sm" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {row.correct}/{row.picked} · <b>{row.points}</b>
          </Text>
        </Group>
      ))}
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
