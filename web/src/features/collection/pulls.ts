// Card packs: free packs of random fighters, earned by playing. The database hands them out and
// does the draw (supabase/migrations/20261109000003_card_packs.sql); this is the rarities, the
// order cards are shown in, and the queries.

import { useMutation, useQuery } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthProvider";
import type { OwnedCard, PackCard, PackReason, Rarity } from "../../backend";

/** Commonest first. Odds match open_pack() in the migration, and are shown to players. */
export const RARITIES: { key: Rarity; label: string; odds: string }[] = [
  { key: "common", label: "Common", odds: "70%" },
  { key: "rare", label: "Rare", odds: "22%" },
  { key: "epic", label: "Epic", odds: "6.5%" },
  { key: "legendary", label: "Legendary", odds: "1.5%" },
];

const rank = (r: Rarity) => RARITIES.findIndex((x) => x.key === r);
export const rarityLabel = (r: Rarity) => RARITIES[rank(r)]!.label;

/** The order to turn a pack's cards over in: the best one comes last. */
export const revealOrder = (cards: PackCard[]) => [...cards].sort((a, b) => rank(a.rarity) - rank(b.rarity));

/** A collection's order: rarest first, then the best-rated (fighters with no rating last). */
export function byRarityThenElo(cards: OwnedCard[], elo: (id: string) => number | undefined): OwnedCard[] {
  return [...cards].sort(
    (a, b) => rank(b.rarity) - rank(a.rarity) || (elo(b.fighterId) ?? -Infinity) - (elo(a.fighterId) ?? -Infinity) || a.name.localeCompare(b.name),
  );
}

export const REASON_LABEL: Record<PackReason, string> = {
  played: "For picking the full card",
  podium: "Top 3 bonus",
  league: "League title bonus",
};

/** The packs waiting to be opened (asking also hands out any newly earned). */
export function useMyPacks() {
  const { backend, user, profile } = useAuth();
  return useQuery({
    queryKey: ["packs", "mine", user?.id],
    queryFn: () => backend!.pickem.claimPacks(),
    enabled: !!backend && !!user && !!profile,
  });
}

/** Opens a pack. The lists refresh when the player's finished, so nothing moves mid-opening. */
export function useOpenPack() {
  const { backend } = useAuth();
  return useMutation({ mutationFn: (packId: string) => backend!.pickem.openPack(packId) });
}

export function usePulledCards(userId: string) {
  const { backend } = useAuth();
  return useQuery({
    queryKey: ["packs", "cards", userId],
    queryFn: () => backend!.pickem.packCards(userId),
    enabled: !!backend,
  });
}
