// style_map.json sends only what the browser can't work out itself (schema 7): per fighter, the
// t-SNE position and the stats, raw and standardised ("vec"). Everything else is a few
// milliseconds of arithmetic here, and costs nothing to download:
// - the Style axes position: a linear function of vec (math.projection), exact;
// - the similarity embedding, vec @ math.metric, and from it the "most similar" lists;
// - the percentiles, by ranking every stat across the map.
// Worked out once when the data loads (hydrateStyleMap), except the "most similar" lists, which
// are worked out for the fighter being looked at (neighboursOf).

import type { Fighter, Neighbour, StyleMapData, StyleMapWire, StyleMath } from "./types";

export type Vec3 = [number, number, number];

/** The linear part of placing a vector on Style axes (no centring): also an arrow's direction. */
export function axesLinear(math: StyleMath, v: number[], dims: 2 | 3): Vec3 {
  const p = math.projection;
  const scale = dims === 3 ? p.scale3 : p.scale2;
  const out: Vec3 = [0, 0, 0];
  for (let a = 0; a < dims; a++) {
    let s = 0;
    v.forEach((x, i) => (s += x * p.matrix[i]![a]!));
    out[a] = (s / p.std[a]!) * scale;
  }
  return out;
}

/** Where a vector sits on the Style axes layout, exactly as the Python pipeline places it. */
export function axesPlace(math: StyleMath, v: number[], dims: 2 | 3): Vec3 {
  const p = math.projection;
  const scale = dims === 3 ? p.scale3 : p.scale2;
  const out = axesLinear(math, v, dims);
  for (let a = 0; a < dims; a++) out[a] = out[a]! - (p.mean[a]! / p.std[a]!) * scale;
  return out;
}

/** A vector in the similarity embedding: v @ metric. */
export function embed(math: StyleMath, v: number[]): number[] {
  const dims = math.metric[0]!.length;
  const out = new Array<number>(dims).fill(0);
  v.forEach((x, i) => {
    const row = math.metric[i]!;
    for (let j = 0; j < dims; j++) out[j]! += x * row[j]!;
  });
  return out;
}

export const embDistance = (a: number[], b: number[]) => {
  let d = 0;
  for (let j = 0; j < a.length; j++) d += (a[j]! - b[j]!) ** 2;
  return Math.sqrt(d);
};

/** A distance in the embedding as the 0-100 similarity score. */
export const similarityScore = (math: StyleMath, distance: number) =>
  Math.round(Math.min(100, Math.max(0, 100 * (1 - distance / math.typical_distance))));

/** Each value's percentile among all of them, ties sharing their average rank (as pandas'
 * rank(pct=True), which the pipeline used before). */
export function percentiles(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]![0] === order[start]![0]) end++;
    const rank = (start + end) / 2 + 1; // 1-based, averaged over the tie
    for (let k = start; k <= end; k++) out[order[k]![1]] = rank / values.length;
    start = end + 1;
  }
  return out;
}

/** The data as the app uses it: style_map.json plus what's worked out from it. */
export function hydrateStyleMap(wire: StyleMapWire): StyleMapData {
  const { math } = wire;
  const pct = math.keys.map((_, i) => percentiles(wire.fighters.map((f) => f.stats[i]!)));
  const fighters: Fighter[] = wire.fighters.map((f, n) => {
    const { similarity3, similarity2, stats, vec, ...rest } = f;
    return {
      ...rest,
      coords: { axes: axesPlace(math, vec, 3), similarity: similarity3 },
      coords_2d: { axes: axesPlace(math, vec, 2).slice(0, 2), similarity: similarity2 },
      stats: Object.fromEntries(math.keys.map((k, i) => [k, stats[i]!])),
      percentiles: Object.fromEntries(math.keys.map((k, i) => [k, pct[i]![n]!])),
      vec,
      emb: embed(math, vec),
    };
  });
  return { ...wire, fighters };
}

/** A fighter's k most similar fighters: across the map, or in their own weight class. */
export function neighboursOf(data: StyleMapData, f: Fighter, scope: "all" | "division", k = 5): Neighbour[] {
  return data.fighters
    .filter((o) => o.id !== f.id && (scope === "all" || o.weight_class === f.weight_class))
    .map((o) => ({ id: o.id, distance: embDistance(f.emb, o.emb) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k)
    .map((n) => ({ ...n, similarity: similarityScore(data.math, n.distance) }));
}
