// Everything a player's profile shows about their Pick'em record: scores, pick history (as far
// as you may see it), and the model's scores to measure them against.

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import { MODEL_PLAYER } from "../pickem/scoring";

export function usePlayerRecord(userId: string | undefined) {
  const { backend } = useAuth();
  const scores = useQuery({
    queryKey: ["pickem", "scores-of", userId],
    queryFn: () => backend!.pickem.scoresOf(userId!),
    enabled: !!backend && !!userId,
  });
  const history = useQuery({
    queryKey: ["pickem", "history", userId],
    queryFn: () => backend!.pickem.pickHistory(userId!),
    enabled: !!backend && !!userId,
  });
  const model = useQuery({
    queryKey: ["players", MODEL_PLAYER],
    queryFn: () => backend!.profiles.byName(MODEL_PLAYER),
    enabled: !!backend,
    staleTime: Infinity,
  });
  const modelScores = useQuery({
    queryKey: ["pickem", "scores-of", model.data?.id],
    queryFn: () => backend!.pickem.scoresOf(model.data!.id),
    enabled: !!backend && !!model.data && model.data.id !== userId,
  });
  return { scores, history, modelScores: model.data && model.data.id !== userId ? modelScores.data : undefined };
}
