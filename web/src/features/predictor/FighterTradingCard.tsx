// The trading card for any fighter by id, usable on every page. Loads the predictor data
// (stats, Elo, photo), the style map (card type) and MMA math (recent form) on demand.
// Fighters outside the predictor's data (no fight in the last 5 years) render `fallback`.

import type { ReactNode } from "react";

import { useMmaMath, usePredictor, useStyleMap } from "../../data/client";
import { recentResults } from "./model";
import { TradingCard } from "./TradingCard";

export function FighterTradingCard({ id, fallback = null, foil, still, gold }: { id: string; fallback?: ReactNode; foil?: boolean; still?: boolean; gold?: boolean }) {
  const predictor = usePredictor().data;
  const styleMap = useStyleMap().data;
  const mma = useMmaMath().data;

  const fighter = predictor?.fighters.find((f) => f.id === id);
  if (!predictor || !fighter) return <>{fallback}</>;

  const style = styleMap?.fighters.find((f) => f.id === id);
  const cluster = style && styleMap?.clusters.find((c) => c.id === style.cluster);
  const inputs = predictor.win_model.inputs;
  return (
    <TradingCard
      key={id} // a different fighter starts face up
      foil={foil}
      still={still}
      gold={gold}
      fighter={fighter}
      cluster={cluster}
      stat={(k) => fighter.x[inputs.indexOf(k)] ?? 0}
      recent={mma ? recentResults(mma, id) : []}
    />
  );
}
