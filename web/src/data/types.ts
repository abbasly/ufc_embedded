// TypeScript mirror of the JSON written by `ufc_embedded.export` (Python).
// Keep in sync with SCHEMA_VERSION there.

export const STYLE_MAP_SCHEMA_VERSION = 5;

export interface Feature {
  key: string;
  label: string;
  unit: string;
}

export interface Axis {
  label: string;
  low: string;
  high: string;
  weights: Record<string, number>; // feature key -> weight in this axis score
}

export type LayoutId = "axes" | "similarity";

export interface LayoutQuality {
  trustworthiness: number;
  knn_kept: number; // share of each fighter's true 10 nearest neighbours kept
}

export interface Layout {
  id: LayoutId;
  label: string;
  description: string;
  interpretable: boolean; // false: axes carry no meaning, only closeness does
  quality: Record<"2" | "3", LayoutQuality>;
}

export interface Cluster {
  id: number;
  name: string;
  description: string;
  size: number;
  median_stats: Record<string, number>;
}

export interface Neighbour {
  id: string;
  distance: number;
}

export interface Photo {
  url: string;
  credit_url: string; // licence / attribution page
}

/** Professional MMA record (all promotions), from UFCStats. */
export interface FightRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface Fighter {
  id: string;
  name: string;
  weight_class: string;
  last_fight: string; // ISO date
  n_fights: number; // UFC fights
  record: FightRecord;
  cluster: number;
  rank: number | null; // current official divisional rank (0 = champion)
  champion: string | null; // division name if current champion
  image: Photo | null;
  coords: Record<LayoutId, number[]>; // 3D position per layout
  coords_2d: Record<LayoutId, number[]>;
  stats: Record<string, number>;
  percentiles: Record<string, number>; // 0..1 within the map population
  neighbours: Neighbour[];
}

export interface Champion {
  division: string;
  name: string;
  image: Photo | null;
  fighter_id: string | null; // null if not on the map (not enough data)
}

export interface StyleMapData {
  schema_version: number;
  generated_at: string;
  source: {
    fights_until: string;
    active_years: number;
    min_fights: number;
  };
  champions_as_of: string | null;
  champions: Champion[];
  features: Feature[];
  axes: Axis[];
  layouts: Layout[];
  clusters: Cluster[];
  fighters: Fighter[];
}

// ---- MMA math (written by ufc_embedded.mma_math) ----

export const MMA_MATH_SCHEMA_VERSION = 2;

export interface MmaFighter {
  id: string; // same slug as the style map, when the fighter is on it
  name: string;
  record: FightRecord;
  champion: string | null;
  image: Photo | null;
}

// Compact row: [winner, loser, date, method, round, title, winnerOdds, weightClass]
export type FightRow = [number, number, string, string, number | null, boolean, number | null, string];

export interface MmaMathData {
  schema_version: number;
  fights_until: string;
  giant_loop_size: number;
  fighters: MmaFighter[];
  fights: FightRow[];
  cycles: number[][]; // fight indices; each fight's loser is the next fight's winner
}
