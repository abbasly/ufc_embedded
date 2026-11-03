// Pure, UI-framework-free helpers: colours, groups and the "Show" filter.

import type { Feature, Fighter, LayoutId, Neighbour, StyleMapData } from "../../data/types";

export const GOLD = "#f5c518";

/** 1 -> "1st", 92 -> "92nd", 13 -> "13th". */
export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

export type ColorBy = "style" | "weight_class";
export type Dims = 2 | 3;

/** A fighter's position in the chosen layout; 2D gets z = 0. */
export function positionOf(f: Fighter, layout: LayoutId, dims: Dims): [number, number, number] {
  const c = dims === 3 ? f.coords[layout] : f.coords_2d[layout];
  return [c[0] ?? 0, c[1] ?? 0, dims === 3 ? (c[2] ?? 0) : 0];
}

export const STYLE_COLORS: Record<string, string> = {
  "Kickboxers": "#ff6b4a",
  "Volume boxers": "#ffc145",
  "Dominant wrestlers": "#4ea8de",
  "Clinch fighters": "#b388eb",
  "Low-volume all-rounders": "#5fd39a",
};

export const WEIGHT_CLASSES = [
  "Flyweight",
  "Bantamweight",
  "Featherweight",
  "Lightweight",
  "Welterweight",
  "Middleweight",
  "Light Heavyweight",
  "Heavyweight",
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
  "Women's Featherweight",
  "Catch Weight",
];

export const SHOW_OPTIONS = {
  all: { label: "All", test: () => true },
  champions: { label: "Champions", test: (f: Fighter) => f.champion !== null },
  ranked: { label: "Ranked", test: (f: Fighter) => f.rank !== null || f.champion !== null },
  veterans: { label: "10+ fights", test: (f: Fighter) => f.n_fights >= 10 },
} satisfies Record<string, { label: string; test: (f: Fighter) => boolean }>;
export type Show = keyof typeof SHOW_OPTIONS;

// Men's divisions light→heavy on a yellow→red ramp, women's on a blue ramp.
function weightColor(wc: string): string {
  const i = WEIGHT_CLASSES.indexOf(wc);
  if (wc.startsWith("Women's")) return `hsl(${200 + (i - 8) * 25}, 75%, 62%)`;
  if (i >= 0 && i < 8) return `hsl(${55 - i * 7.5}, 90%, ${68 - i * 3}%)`;
  return "#999";
}

export function groupOf(f: Fighter, data: StyleMapData, colorBy: ColorBy): string {
  return colorBy === "style"
    ? (data.clusters.find((c) => c.id === f.cluster)?.name ?? `Style ${f.cluster}`)
    : f.weight_class;
}

export function colorOfGroup(group: string, colorBy: ColorBy): string {
  return colorBy === "style" ? (STYLE_COLORS[group] ?? "#999") : weightColor(group);
}

/** Legend entries present in the data, in a stable order. */
export function legend(data: StyleMapData, colorBy: ColorBy): { name: string; color: string }[] {
  const present = new Set(data.fighters.map((f) => groupOf(f, data, colorBy)));
  const order = colorBy === "style" ? Object.keys(STYLE_COLORS) : WEIGHT_CLASSES;
  return order.filter((g) => present.has(g)).map((name) => ({ name, color: colorOfGroup(name, colorBy) }));
}

export type Scope = "all" | "division";

/** The selected fighter's most similar fighters: across the map, or in their own division. */
export function similarTo(f: Fighter | null | undefined, scope: Scope): Neighbour[] {
  if (!f) return [];
  return scope === "all" ? f.neighbours : f.division_neighbours;
}


// How a stat reads when two fighters are both at the top (or bottom) of the map for it.
// Unweighted or ambiguous ends are left out.
const TRAITS: Record<string, [high: string | null, low: string | null]> = {
  significant_strikes_landed_per_minute: ["High output", "Low output"],
  significant_striking_accuracy: ["Accurate", null],
  knockdowns_per_15_minutes: ["Knockdown power", null],
  significant_strikes_absorbed_per_minute: ["Takes damage", "Hard to hit"],
  significant_strike_defence: ["Slippery", null],
  body_strikes: ["Body work", null],
  leg_strikes: ["Leg kicks", "Few leg kicks"],
  clinch_strikes: ["Clinch work", null],
  ground_strikes: ["Ground and pound", null],
  average_takedowns_landed_per_15_minutes: ["Takedowns", "Stays standing"],
  control_time: ["Top control", null],
  average_submissions_attempted_per_15_minutes: ["Submission hunter", null],
  takedown_defense: ["Takedown defence", null],
};
const TRAIT_EDGE = 0.25; // both fighters in the top (or bottom) quarter of the map

/** What two fighters have in common, most distinctive first: stats where both sit at the same
 * end of the map, as short phrases ("Leg kicks", "Top control"). */
export function sharedTraits(a: Fighter, b: Fighter, features: Feature[], max = 3): string[] {
  const traits: { text: string; edge: number }[] = [];
  for (const { key, weight } of features) {
    const phrase = TRAITS[key];
    const p = a.percentiles[key];
    const q = b.percentiles[key];
    if (!phrase || p === undefined || q === undefined || weight < 0.2) continue;
    const high = Math.min(p, q);
    const low = 1 - Math.max(p, q);
    if (high >= 1 - TRAIT_EDGE && phrase[0]) traits.push({ text: phrase[0], edge: high });
    else if (low >= 1 - TRAIT_EDGE && phrase[1]) traits.push({ text: phrase[1], edge: low });
  }
  return traits
    .sort((x, y) => y.edge - x.edge)
    .slice(0, max)
    .map((t) => t.text);
}

/** Features in display groups ("Striking", "Shot selection", "Grappling"), in data order. */
export function featureGroups(features: Feature[]): { group: string; features: Feature[] }[] {
  const groups: { group: string; features: Feature[] }[] = [];
  for (const f of features) {
    const last = groups.at(-1);
    if (last?.group === f.group) last.features.push(f);
    else groups.push({ group: f.group, features: [f] });
  }
  return groups;
}
