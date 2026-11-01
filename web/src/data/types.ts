// TypeScript mirror of the JSON written by `ufc_embedded.export` (Python).
// Keep in sync with SCHEMA_VERSION there.

export const STYLE_MAP_SCHEMA_VERSION = 2;

export interface Feature {
  key: string;
  label: string;
  unit: string;
}

export interface Axis {
  label: string;
  low: string;
  high: string;
  explained_variance: number;
  loadings: Record<string, number>;
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

export interface Fighter {
  id: string;
  name: string;
  weight_class: string;
  last_fight: string; // ISO date
  n_fights: number;
  cluster: number;
  champion: string | null; // division name if current champion
  image: Photo | null;
  coords: number[]; // one value per axis
  stats: Record<string, number>;
  percentiles: Record<string, number>; // 0..1 within the map population
  neighbours: Neighbour[];
}

export interface StyleMapData {
  schema_version: number;
  generated_at: string;
  source: {
    fights_until: string;
    stats_snapshot: string;
    active_years: number;
    min_fights: number;
    champions_as_of: string;
  };
  features: Feature[];
  axes: Axis[];
  clusters: Cluster[];
  fighters: Fighter[];
}
