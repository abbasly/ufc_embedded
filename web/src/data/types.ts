// TypeScript mirror of the JSON written by `ufc_embedded.export` (Python).
// Keep in sync with SCHEMA_VERSION there.

export const STYLE_MAP_SCHEMA_VERSION = 7;

export interface Feature {
  key: string;
  label: string;
  unit: string;
  group: string; // "Striking", "Shot selection" or "Grappling"
  weight: number; // how much the stat counts in the similarity embedding (0..1)
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
  distance: number; // in the similarity embedding (vec @ metric)
  similarity: number; // 0-100: 100 the same style, 0 as different as a typical pair
}

/** How often the embedding recognises a fighter from the other half of their fights. */
export interface SelfMatch {
  n: number;
  top1: number;
  top10: number;
  median_rank: number;
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

/** A fighter as style_map.json sends it (schema 7): only what the browser can't work out. */
export interface FighterWire {
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
  similarity3: number[]; // t-SNE position, 3D
  similarity2: number[]; // and 2D
  stats: number[]; // in math.keys order
  vec: number[]; // the stats standardised, in math.keys order
}

/** A fighter as the app uses it: the wire fields plus what data/styleMap.ts works out on load. */
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
  vec: number[]; // standardised stats the map is fitted on, in math.keys order
  emb: number[]; // vec @ metric: the similarity embedding
}

export interface Champion {
  division: string;
  name: string;
  image: Photo | null;
  fighter_id: string | null; // null if not on the map (not enough data)
}

/** The embedding and Style axes as numbers (see ufc_embedded.export: "math"): fighter math,
 * the "most similar" lists and the Style axes positions are all worked out from these. */
export interface StyleMath {
  keys: string[]; // the stat behind each number of stats, vec and weights (not the features order)
  weights: number[]; // per stat: how much it counts in the similarity embedding (0..1)
  metric: number[][]; // the similarity embedding is vec @ metric (rows follow keys)
  typical_distance: number; // a distance this big scores 0 out of 100
  // Style axes position of any vector v: (v @ matrix - mean) / std * scale3 (3D), or the
  // first two of those with scale2 (2D).
  projection: { matrix: number[][]; mean: number[]; std: number[]; scale3: number; scale2: number };
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
  // Self-match test of the old 8-stat embedding and of the one on the map.
  embedding_check: { career_stats?: SelfMatch; style_stats?: SelfMatch };
  axes: Axis[];
  layouts: Layout[];
  clusters: Cluster[];
  math: StyleMath;
  fighters: Fighter[];
}

/** style_map.json itself, before data/styleMap.ts fills in the rest. */
export interface StyleMapWire extends Omit<StyleMapData, "fighters"> {
  fighters: FighterWire[];
}

// ---- MMA math (written by ufc_embedded.mma_math) ----

export const MMA_MATH_SCHEMA_VERSION = 3;

export interface MmaFighter {
  id: string; // same slug as the style map, when the fighter is on it
  name: string;
  record: FightRecord;
  champion: string | null;
  rank: number | null; // current divisional rank (0 = champion), null if unranked
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

// ---- Fight predictor (written by ufc_embedded.train) ----

export const PREDICTOR_SCHEMA_VERSION = 2;

export interface PredictorFighter {
  id: string; // same public id as the style map / MMA math
  name: string;
  weight_class: string;
  last_fight: string;
  record: FightRecord;
  rank: number | null;
  champion: string | null;
  image: Photo | null;
  elo: number;
  elo_year_ago: number | null; // null if they hadn't fought in the UFC a year ago
  elo_peak: number;
  x: number[]; // feature values, in win_model.inputs order
}

export interface PredictorData {
  schema_version: number;
  generated_at: string;
  fights_until: string;
  trained_until: string;
  rankings_as_of: string;
  validation: Record<string, Record<string, number>>;
  feature_labels: Record<string, string>;
  // P(A wins) = sigmoid(sum_i weights[i] * (a.x[i] - b.x[i]) / scale[i])
  win_model: { inputs: string[]; weights: number[]; scale: number[] };
  // P(method | winner) = softmax(coef . standardise([winner feats, loser feats, extras]) + intercept)
  method_model: {
    classes: string[];
    winner_inputs: string[];
    loser_inputs: string[];
    extra_inputs: string[];
    mean: number[];
    scale: number[];
    coef: number[][];
    intercept: number[];
  };
  fighters: PredictorFighter[];
  // Upcoming UFC cards from bookmakers' listings (added after schema 2; absent in old files).
  upcoming?: UpcomingCard[];
}

export interface UpcomingFight {
  a: string | null; // public fighter id, null for fighters we have no data on (debutants)
  b: string | null;
  a_name: string;
  b_name: string;
  p_market: number | null; // bookmakers' vig-free P(A wins)
  main?: boolean; // the bout the event is named after
}

export interface UpcomingCard {
  date: string; // yyyy-mm-dd
  name?: string | null; // "UFC 335: Oliveira vs. Lopes" (from Wikipedia), if known
  city?: string | null;
  fights: UpcomingFight[];
}
