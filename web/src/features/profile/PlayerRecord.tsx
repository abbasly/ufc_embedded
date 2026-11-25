// A player's record, as their profile shows it: the numbers, badges, best call and method
// record, points over time, and past cards with their picks. Used on your own profile (with a
// share button) and on anyone's player page.

import { Grid, Group, Paper, Stack, Text } from "@mantine/core";

import { usePredictor } from "../../data/client";
import { MODEL_PLAYER, placeOf } from "../pickem/scoring";
import { useLeaderboard } from "../pickem/usePickem";
import { profileImage } from "../share/profileImage";
import { ShareButton } from "../share/ShareButton";
import { Badges, ClosestPredictors, Highlights, PointsChart } from "./Insights";
import { LeagueTitles } from "./LeagueTitles";
import { badges, bestCall, decided, headToHead } from "./record";
import { History, Stats } from "./PlayerStats";
import { starterBadges, useStarterBadges } from "./starter";
import { usePlayerRecord } from "./usePlayerRecord";
import { MarketChart } from "./MarketChart";
import { ProfileCards } from "../collection/ProfileCards";
import { useAuth } from "../../auth/AuthProvider";
import { useVisiblePicks } from "../pickem/usePickem";
import { RiskChart } from "./RiskChart";

interface Props {
  userId: string;
  displayName: string;
  avatar: string | null;
  isMe: boolean;
  /** Shown between the numbers and the badges (e.g. head to head, or your leagues). */
  children?: React.ReactNode;
  /** Shown after past cards. */
  after?: React.ReactNode;
}

export function PlayerRecord({ userId, displayName, avatar, isMe, children, after }: Props) {
  const { scores, history, closest, modelScores } = usePlayerRecord(userId);
  const isModel = displayName === MODEL_PLAYER;
  const { user, profile } = useAuth();
  // How players pick: only signed in (signed out, only the model's picks are visible).
  const visible = useVisiblePicks(!!user);
  const vsModel = modelScores && scores.data ? headToHead(scores.data, modelScores) : null;
  const picks = history.data ?? [];
  const list = badges(picks, vsModel);
  // Scores are public but picks aren't: they've played, and we can't see what they picked.
  const picksHidden = history.isSuccess && !!scores.data?.some((s) => s.picked > 0) && decided(picks).length === 0;
  const starters = useStarterBadges(userId);
  const board = useLeaderboard();
  const { data: predictor } = usePredictor(isMe && !!avatar);

  const share = isMe && !!scores.data?.length && (
    <Group justify="flex-end" mt={-8}>
      <ShareButton
        label="Share my season"
        fileName={`pickem-${displayName}`}
        text="My Pick'em season on UFC Embedded. Think you can beat me?"
        url={`${window.location.origin}/u/${encodeURIComponent(displayName)}`}
        make={() => {
          const rows = scores.data!;
          const rank = placeOf(board.data ?? [], displayName);
          const call = bestCall(picks);
          return profileImage({
            name: displayName,
            photo: predictor?.fighters.find((f) => f.id === avatar)?.image?.url,
            rank,
            points: rows.reduce((n, r) => n + r.points, 0),
            correct: rows.reduce((n, r) => n + r.correct, 0),
            picked: rows.reduce((n, r) => n + r.picked, 0),
            cards: rows.length,
            vsModel: vsModel && vsModel.wins + vsModel.losses + vsModel.draws > 0 ? `${vsModel.wins}–${vsModel.losses}` : null,
            bestCall: call ? `${call.fighter} at ${Math.round(call.chance * 100)}% (+${call.points})` : null,
            badges: list.filter((b) => b.earned).map((b) => b.name),
          });
        }}
      />
    </Group>
  );

  return (
    // The numbers across the top (for the model, its record against the market first); then how
    // they play on the left (highlights, points over time, how they pick, past cards) and who they
    // play with on the right; their cards at the bottom.
    <Stack gap="lg">
      {/* The model doesn't collect cards: its page leads with how it does against the market. */}
      {isModel && history.isSuccess && !picksHidden && <MarketChart history={picks} />}
      <Stats scores={scores.data} displayName={displayName} />
      {share}
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 7.5 }}>
          <Stack gap="lg">
            {!!scores.data?.length && (
              <>
                <Highlights history={picks} vsModel={vsModel} isModel={isModel} whose={isMe ? "you" : "they"} picksHidden={picksHidden} />
                <PointsChart scores={scores.data} />
                {user && visible.data && (
                  <Paper p="md" radius="md" className="pickem-board">
                    <Text size="xs" c="dimmed" fw={700} mb={6}>
                      {isMe ? "How you pick" : "How they pick"}
                    </Text>
                    <RiskChart picks={visible.data} owner={displayName} me={profile?.displayName} />
                  </Paper>
                )}
              </>
            )}
            <History scores={scores.data} loading={scores.isPending} own={isMe} history={picks} />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4.5 }}>
          <Stack gap="lg">
            {!!scores.data?.length && <ClosestPredictors players={closest} isMe={isMe} />}
            {children}
            <LeagueTitles userId={userId} />
            <Badges list={picksHidden ? [] : list} starters={isModel ? [] : starterBadges(starters.data ?? [])} />
          </Stack>
        </Grid.Col>
      </Grid>
      {!isModel && history.isSuccess && !picksHidden && <ProfileCards history={picks} userId={userId} isMe={isMe} displayName={displayName} />}
      {after}
    </Stack>
  );
}
