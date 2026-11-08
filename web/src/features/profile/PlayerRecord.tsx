// A player's record, as their profile shows it: the numbers, badges, best call and method
// record, points over time, and past cards with their picks. Used on your own profile (with a
// share button) and on anyone's player page.

import { Group, Stack } from "@mantine/core";

import { usePredictor } from "../../data/client";
import { MODEL_PLAYER, placeOf } from "../pickem/scoring";
import { useLeaderboard } from "../pickem/usePickem";
import { profileImage } from "../share/profileImage";
import { ShareButton } from "../share/ShareButton";
import { Badges, ClosestPredictors, Highlights, PointsChart } from "./Insights";
import { badges, bestCall, headToHead } from "./record";
import { History, Stats } from "./PlayerStats";
import { usePlayerRecord } from "./usePlayerRecord";

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
  const vsModel = modelScores && scores.data ? headToHead(scores.data, modelScores) : null;
  const picks = history.data ?? [];
  const list = badges(picks, vsModel);
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
    <Stack gap="lg">
      <Stats scores={scores.data} displayName={displayName} />
      {share}
      {children}
      {!!scores.data?.length && (
        <>
          <Badges list={list} />
          <Highlights history={picks} vsModel={vsModel} isModel={isModel} whose={isMe ? "you" : "they"} />
          <ClosestPredictors players={closest} isMe={isMe} />
          <PointsChart scores={scores.data} />
        </>
      )}
      <History scores={scores.data} loading={scores.isPending} own={isMe} history={picks} />
      {after}
    </Stack>
  );
}
