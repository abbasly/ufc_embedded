// The owner's panel (/admin): site and Pick'em numbers, every account, the most active players,
// and the change log. The database decides who may see any of it (public.admins); this page only
// asks, and shows "not found" to everyone else.

import "../pickem/Pickem.css";

import { Anchor, Badge, Center, Group, Loader, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput, Title, UnstyledButton } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { recentVisits } from "../../app/visits";
import { NotFoundPage } from "../../pages/NotFoundPage";
import { useAuth } from "../../auth/AuthProvider";
import type { AdminUser } from "../../backend";
import { playerPath } from "../pickem/Leagues";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–";

/** "3h ago", "2d ago". */
function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export default function AdminPage() {
  const { backend, user, loading } = useAuth();
  const admin = useQuery({ queryKey: ["admin", "is", user?.id], queryFn: () => backend!.admin.isAdmin(), enabled: !!backend && !!user });
  const yes = admin.data === true;
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => backend!.admin.overview(), enabled: yes });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => backend!.admin.users(), enabled: yes });
  const log = useQuery({ queryKey: ["admin", "log"], queryFn: () => backend!.admin.log(60), enabled: yes });
  const [visits, setVisits] = useState<{ visits: number; days: number } | null>(null);
  useEffect(() => {
    document.title = "Admin | UFC Embedded";
    if (yes) void recentVisits().then(setVisits);
  }, [yes]);

  if (loading || (user && admin.isPending)) return <Center h="60vh"><Loader /></Center>;
  // Not signed in, or not an admin: the same as any page that doesn't exist.
  if (!yes) return <NotFoundPage />;

  return (
    <Stack gap="lg" maw={1100} mx="auto" pt={4}>
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" fw={800} c="red.4" tt="uppercase" style={{ letterSpacing: "0.12em" }}>
            Admin
          </Text>
          <Title order={1} fz={{ base: 26, md: 32 }}>
            How the site is doing
          </Title>
        </div>
        <Badge variant="light" color="gray">
          Only you can see this
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 3, sm: 4, md: 6 }} spacing={8}>
        {visits && <Tile label={`Visits, last ${visits.days} days`} value={visits.visits} />}
        {(overview.data ?? []).map((m) => (
          <Tile key={m.metric} label={m.metric} value={m.value} />
        ))}
      </SimpleGrid>

      <MostActive users={users.data ?? []} />
      <Players users={users.data} loading={users.isPending} />

      <Paper p="md" radius="md" className="pickem-board">
        <Title order={4} mb="sm">
          Recent changes
        </Title>
        <Stack gap={4}>
          {(log.data ?? []).map((l, i) => (
            <Group key={i} gap="sm" wrap="nowrap" align="baseline">
              <Text size="xs" c="dimmed" w={110} style={{ flex: "none" }}>
                {when(l.at)}
              </Text>
              <Badge size="xs" variant="light" color={l.kind === "sync" ? "gray" : l.kind.startsWith("result") ? "green" : l.kind === "scored" ? "yellow" : "blue"} style={{ flex: "none" }}>
                {l.kind}
              </Badge>
              <Text size="sm" truncate>
                {l.detail}
              </Text>
            </Group>
          ))}
          {log.data && !log.data.length && (
            <Text size="sm" c="dimmed">
              Nothing logged yet.
            </Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

/** A small number with its label: compact, so all of them fit in two rows. */
function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Paper px="sm" py={8} radius="md" className="pickem-board">
      <Text fz={20} fw={800} lh={1.2} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value.toLocaleString("en-US")}
      </Text>
      <Text fz={11} c="dimmed" lh={1.3} lineClamp={2}>
        {label}
      </Text>
    </Paper>
  );
}

/** The players doing the most: by picks, and who's been around lately. */
function MostActive({ users }: { users: AdminUser[] }) {
  const byPicks = [...users].filter((u) => u.picks > 0).sort((a, b) => b.picks - a.picks).slice(0, 5);
  const recent = [...users].filter((u) => u.lastSignInAt).sort((a, b) => Date.parse(b.lastSignInAt!) - Date.parse(a.lastSignInAt!)).slice(0, 5);
  const list = (rows: AdminUser[], note: (u: AdminUser) => string) =>
    rows.length ? (
      <Stack gap={4}>
        {rows.map((u, i) => (
          <Group key={u.userId} justify="space-between" wrap="nowrap">
            <Text size="sm" truncate>
              {i + 1}. {u.displayName ? <Anchor component={Link} to={playerPath(u.displayName)} c="inherit">{u.displayName}</Anchor> : <Text span c="dimmed">no name yet</Text>}
            </Text>
            <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              {note(u)}
            </Text>
          </Group>
        ))}
      </Stack>
    ) : (
      <Text size="sm" c="dimmed">
        Nobody yet.
      </Text>
    );
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      <Paper p="md" radius="md" className="pickem-board">
        <Title order={5} mb="xs">
          Most picks
        </Title>
        {list(byPicks, (u) => `${u.picks} picks · ${u.points} pts`)}
      </Paper>
      <Paper p="md" radius="md" className="pickem-board">
        <Title order={5} mb="xs">
          Seen lately
        </Title>
        {list(recent, (u) => ago(u.lastSignInAt))}
      </Paper>
    </SimpleGrid>
  );
}

type SortKey = "createdAt" | "lastSignInAt" | "picks" | "points" | "displayName";

/** Every account: searchable, sortable by any column. */
function Players({ users, loading }: { users: AdminUser[] | undefined; loading: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "createdAt", desc: true });
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = (users ?? []).filter((u) => !q || `${u.displayName ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q));
    const value = (u: AdminUser): string | number => {
      const v = u[sort.key];
      return typeof v === "number" ? v : sort.key === "displayName" ? (v ?? "").toLowerCase() : v ? Date.parse(v) : 0;
    };
    return shown.sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * (sort.desc ? -1 : 1));
  }, [users, query, sort]);

  const head = (key: SortKey, label: string) => (
    <Table.Th>
      <UnstyledButton fz="xs" fw={700} onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}>
        {label}
        {sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
      </UnstyledButton>
    </Table.Th>
  );

  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Title order={4}>All accounts{users && <Text span c="dimmed" fw={500}> · {users.length}</Text>}</Title>
        <TextInput size="xs" placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.currentTarget.value)} w={240} />
      </Group>
      {loading ? (
        <Loader size="sm" />
      ) : (
        <ScrollArea type="auto">
          <Table striped highlightOnHover verticalSpacing={6} miw={820} fz="sm">
            <Table.Thead>
              <Table.Tr>
                {head("displayName", "Name")}
                <Table.Th fz="xs">Email</Table.Th>
                <Table.Th fz="xs">Via</Table.Th>
                {head("createdAt", "Joined")}
                {head("lastSignInAt", "Last seen")}
                {head("picks", "Picks")}
                {head("points", "Points")}
                <Table.Th fz="xs">Leagues</Table.Th>
                <Table.Th fz="xs">Friends</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((u) => (
                <Table.Tr key={u.userId}>
                  <Table.Td>{u.displayName ? <Anchor component={Link} to={playerPath(u.displayName)} c="inherit">{u.displayName}</Anchor> : <Text span c="dimmed" fz="sm">no name yet</Text>}</Table.Td>
                  <Table.Td>{u.email}</Table.Td>
                  <Table.Td>{u.provider}</Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>{when(u.createdAt)}</Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>{ago(u.lastSignInAt)}</Table.Td>
                  <Table.Td>{u.picks}</Table.Td>
                  <Table.Td>{u.points}</Table.Td>
                  <Table.Td>{u.leagues}</Table.Td>
                  <Table.Td>{u.friends}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Paper>
  );
}
