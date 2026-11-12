// Fighter arithmetic, like word vectors: "Alex Pereira − Kickboxers + Dominant wrestlers = ?".
// Every fighter is a vector of 14 standardised style stats (the map is fitted on them), and a
// style is the average of its fighters. The sum is taken in all 14 stats; the answer is the
// real fighter closest to it, by the same distance the "most similar" lists use.
//
// The Style axes layout is a linear function of those vectors (style_map.axes_projection), so
// the sum can be drawn exactly: start at the first term, add one arrow per term, and the last
// arrow ends where the sum belongs on the map.

import type { Fighter, StyleMapData, StyleMath } from "../../data/types";
import type { Dims } from "./model";

export type Vec3 = [number, number, number];

/** One term of the sum: a fighter (their id) or a style ("s:<cluster id>"). */
export interface Term {
  sign: 1 | -1;
  ref: string;
}

export const MAX_TERMS = 4;
const STYLE = "s:";

export const isStyleRef = (ref: string) => ref.startsWith(STYLE);
export const styleRef = (clusterId: number) => `${STYLE}${clusterId}`;

/** The data has what the arithmetic needs (exports from before it lack the vectors). */
export function hasMath(data: StyleMapData): data is StyleMapData & { math: StyleMath } {
  return !!data.math?.keys && data.fighters.every((f) => f.vec?.length === data.math!.weights.length);
}

/** A term's vector: a fighter's own, or a style's average. Null for an unknown ref. */
export function termVector(data: StyleMapData, ref: string): number[] | null {
  if (isStyleRef(ref)) {
    const id = Number(ref.slice(STYLE.length));
    const members = data.fighters.filter((f) => f.cluster === id && f.vec);
    if (!members.length) return null;
    const sum = new Array<number>(members[0]!.vec!.length).fill(0);
    for (const f of members) f.vec!.forEach((v, i) => (sum[i]! += v));
    return sum.map((v) => v / members.length);
  }
  return data.fighters.find((f) => f.id === ref)?.vec ?? null;
}

export function termName(data: StyleMapData, ref: string): string {
  if (isStyleRef(ref)) return data.clusters.find((c) => styleRef(c.id) === ref)?.name ?? "A style";
  return data.fighters.find((f) => f.id === ref)?.name ?? ref;
}

/** The sum of the terms' vectors with their signs, or null while a term is unknown. */
export function combine(data: StyleMapData, terms: Term[]): number[] | null {
  const vectors = terms.map((t) => termVector(data, t.ref));
  if (!vectors.length || vectors.some((v) => !v)) return null;
  const out = new Array<number>(vectors[0]!.length).fill(0);
  terms.forEach((t, k) => vectors[k]!.forEach((v, i) => (out[i]! += t.sign * v)));
  return out;
}

/** The linear part of placing a vector on Style axes (no centring): an arrow's direction. */
function linear(math: StyleMath, v: number[], dims: Dims): Vec3 {
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

/** Where a vector sits on the Style axes layout, exactly as the map places fighters. */
export function place(math: StyleMath, v: number[], dims: Dims): Vec3 {
  const p = math.projection;
  const scale = dims === 3 ? p.scale3 : p.scale2;
  const out = linear(math, v, dims);
  for (let a = 0; a < dims; a++) out[a] = out[a]! - (p.mean[a]! / p.std[a]!) * scale;
  return out;
}

/** The arrows of the sum: the first term's point, then one more point per term. The last
 * point is where the whole sum sits (placing is linear, so the arrows add up exactly). */
export function chain(data: StyleMapData & { math: StyleMath }, terms: Term[], dims: Dims): Vec3[] | null {
  const vectors = terms.map((t) => termVector(data, t.ref));
  if (!vectors.length || vectors.some((v) => !v)) return null;
  const points: Vec3[] = [place(data.math, vectors[0]!, dims)];
  for (let k = 1; k < terms.length; k++) {
    const step = linear(data.math, vectors[k]!, dims);
    const last = points[k - 1]!;
    points.push([0, 1, 2].map((a) => last[a]! + terms[k]!.sign * step[a]!) as Vec3);
  }
  return points;
}

export interface Match {
  fighter: Fighter;
  distance: number;
  similarity: number; // 0-100, as in the "most similar" lists
}

/** How far apart two vectors are in the embedding similarity is measured in: through the
 * learned metric (vec @ metric), or, in older exports, the stats times their weights. */
export function embeddingDistance(math: StyleMath, a: number[], b: number[]): number {
  const diff = a.map((x, i) => x - b[i]!);
  let d = 0;
  if (math.metric) {
    const dims = math.metric[0]!.length;
    for (let j = 0; j < dims; j++) {
      let z = 0;
      diff.forEach((x, i) => (z += x * math.metric![i]![j]!));
      d += z * z;
    }
  } else {
    diff.forEach((x, i) => (d += (x * math.weights[i]!) ** 2));
  }
  return Math.sqrt(d);
}

/** The real fighters closest to a vector in the full embedding. */
export function closest(data: StyleMapData & { math: StyleMath }, v: number[], exclude: Set<string>, k = 3, division?: string): Match[] {
  return data.fighters
    .filter((f) => f.vec && !exclude.has(f.id) && (!division || f.weight_class === division))
    .map((f) => ({ fighter: f, distance: embeddingDistance(data.math, f.vec!, v) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k)
    .map((m) => ({ ...m, similarity: Math.round(Math.min(100, Math.max(0, 100 * (1 - m.distance / data.math.typical_distance)))) }));
}

/** What the sum changed against where it started, the biggest (weighted) changes first. */
export function changes(data: StyleMapData & { math: StyleMath }, from: number[], to: number[], max = 3): { label: string; up: boolean }[] {
  // The vectors follow math.keys, which isn't the order of data.features.
  return data.math.keys
    .map((key, i) => ({ label: data.features.find((f) => f.key === key)?.label ?? key, delta: (to[i]! - from[i]!) * data.math.weights[i]! }))
    .filter((c) => Math.abs(c.delta) >= 0.2)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, max)
    .map((c) => ({ label: c.label, up: c.delta > 0 }));
}

/** Terms in the address: "alex-pereira,-s:0,+s:2" (the first term is always added). */
export function formatTerms(terms: Term[]): string {
  return terms.map((t, i) => (i === 0 ? t.ref : `${t.sign > 0 ? "+" : "-"}${t.ref}`)).join(",");
}

export function parseTerms(text: string | null): Term[] {
  if (!text) return [];
  const seen = new Set<string>();
  return text
    .split(",")
    .map((part) => ({ sign: (part.startsWith("-") ? -1 : 1) as 1 | -1, ref: part.replace(/^[+-]/, "") }))
    .filter((t) => t.ref && !seen.has(t.ref) && seen.add(t.ref)) // each fighter or style once
    .slice(0, MAX_TERMS)
    .map((t, i) => (i === 0 ? { ...t, sign: 1 as const } : t));
}

/** Ready-made sums to start from; ones whose fighters have left the map are skipped. */
// The first one that resolves is what Fighter Lab opens with.
export const PRESETS: { label: string; terms: [string, -1 | 1, string, -1 | 1, string] }[] = [
  // Famous on both ends: each answer is a champion or ranked fighter too (on the learned
  // embedding of November 2026; a data refresh can change the answers).
  { label: "Khamzat without the wrestling", terms: ["khamzat-chimaev", -1, "Dominant wrestlers", 1, "Low-volume all-rounders"] },
  { label: "Pereira as a wrestler", terms: ["alex-pereira", -1, "Kickboxers", 1, "Dominant wrestlers"] },
  { label: "Ulberg as a wrestler", terms: ["carlos-ulberg", -1, "Kickboxers", 1, "Dominant wrestlers"] },
  { label: "Tsarukyan as a kickboxer", terms: ["arman-tsarukyan", -1, "Dominant wrestlers", 1, "Kickboxers"] },
  { label: "Kape − Van + Holloway", terms: ["manel-kape", -1, "joshua-van", 1, "max-holloway"] },
];

/** A preset as terms, or null if one of its fighters or styles isn't on the map. */
export function presetTerms(data: StyleMapData, preset: (typeof PRESETS)[number]): Term[] | null {
  const [a, s1, b, s2, c] = preset.terms;
  const resolve = (name: string) => {
    const style = data.clusters.find((cl) => cl.name === name);
    if (style) return styleRef(style.id);
    return data.fighters.some((f) => f.id === name) ? name : null;
  };
  const refs = [resolve(a), resolve(b), resolve(c)];
  if (refs.some((r) => !r)) return null;
  return [
    { sign: 1, ref: refs[0]! },
    { sign: s1, ref: refs[1]! },
    { sign: s2, ref: refs[2]! },
  ];
}
