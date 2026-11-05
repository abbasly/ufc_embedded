// Anyone's player page (/u/<display name>): picture, name, record and past cards. Opened from
// the leaderboards. Only what's already public shows: picks stay private.

import "../pickem/Pickem.css";

import { Alert, Anchor, Button, Center, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { PlayerAvatar } from "../../auth/PlayerAvatar";
import { usePredictor } from "../../data/client";
import { FriendButton } from "../friends/FriendButton";
import { History, Stats } from "./PlayerStats";

const joined = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function PlayerPage() {
  const name = useParams().name ?? "";
  const { backend, profile } = useAuth();
  const player = useQuery({
    queryKey: ["players", name],
    queryFn: () => backend!.profiles.byName(name),
    enabled: !!backend,
  });
  const scores = useQuery({
    queryKey: ["pickem", "scores-of", player.data?.id],
    queryFn: () => backend!.pickem.scoresOf(player.data!.id),
    enabled: !!backend && !!player.data,
  });
  const { data: predictor } = usePredictor(!!player.data?.avatar);
  const fighter = predictor?.fighters.find((f) => f.id === player.data?.avatar);
  useEffect(() => {
    document.title = `${name} | Pick'em | UFC Embedded`;
  }, [name]);

  if (player.isPending) return <Center h="60vh"><Loader /></Center>;
  if (player.error) return <Alert color="red" title="Couldn't load this player">{player.error.message}</Alert>;
  if (!player.data) {
    return (
      <Alert title="No player by that name" maw={560} mx="auto">
        Maybe they changed their name. <Anchor component={Link} to="/">Back to Pick'em</Anchor>
      </Alert>
    );
  }
  const p = player.data;
  const isMe = profile?.id === p.id;

  return (
    <Stack gap="lg" maw={720} mx="auto" pt={4}>
      <Paper p="lg" radius="md" className="pickem-board">
        <Group gap="lg" wrap="wrap" align="center">
          <PlayerAvatar name={p.displayName} avatar={p.avatar} size={88} />
          <Stack gap={4} style={{ flex: 1, minWidth: 200 }}>
            <Title order={2} lh={1.1}>
              {p.displayName}
            </Title>
            <Text size="sm" c="dimmed">
              Playing since {joined(p.joinedOn)}
              {fighter && <> · repping {fighter.name}</>}
            </Text>
          </Stack>
          {isMe ? (
            <Button component={Link} to="/me" variant="light" size="xs">
              Edit your profile
            </Button>
          ) : (
            <FriendButton userId={p.id} displayName={p.displayName} />
          )}
        </Group>
      </Paper>
      <Stats scores={scores.data} displayName={p.displayName} />
      <History scores={scores.data} loading={scores.isPending} own={isMe} />
    </Stack>
  );
}
