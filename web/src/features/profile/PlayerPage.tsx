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
import { ModelTag } from "../pickem/Leagues";
import { MODEL_PLAYER } from "../pickem/scoring";
import { HeadToHeadPanel } from "./Insights";
import { PlayerRecord } from "./PlayerRecord";
import { headToHead } from "./record";

const joined = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function PlayerPage() {
  const name = useParams().name ?? "";
  const { backend, profile } = useAuth();
  const player = useQuery({
    queryKey: ["players", name],
    queryFn: () => backend!.profiles.byName(name),
    enabled: !!backend,
  });
  // How you do against them (signed in, on someone else's page).
  const mine = useQuery({
    queryKey: ["pickem", "scores-of", profile?.id],
    queryFn: () => backend!.pickem.scoresOf(profile!.id),
    enabled: !!backend && !!profile && !!player.data && profile.id !== player.data.id,
  });
  const theirs = useQuery({
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
              {p.displayName === MODEL_PLAYER && <ModelTag />}
            </Title>
            <Text size="sm" c="dimmed">
              {p.displayName === MODEL_PLAYER ? (
                <>
                  Our prediction model, playing along: it picks the <Anchor component={Link} to="/predictor">predictor's</Anchor> favourite,
                  and its most likely method, on every fight (the bookies' favourite when a fighter is new to the UFC). Can you beat it?
                </>
              ) : (
                <>
                  Playing since {joined(p.joinedOn)}
                  {fighter && <> · repping {fighter.name}</>}
                </>
              )}
            </Text>
          </Stack>
          {isMe ? (
            <Button component={Link} to="/me" variant="light" size="xs">
              Edit your profile
            </Button>
          ) : p.displayName === MODEL_PLAYER ? null : (
            <FriendButton userId={p.id} displayName={p.displayName} />
          )}
        </Group>
      </Paper>
      <PlayerRecord userId={p.id} displayName={p.displayName} avatar={p.avatar} isMe={isMe}>
        {!isMe && mine.data && theirs.data && mine.data.length > 0 && <HeadToHeadPanel h2h={headToHead(mine.data, theirs.data)} them={p.displayName} />}
      </PlayerRecord>
    </Stack>
  );
}
