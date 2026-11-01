// Pure, UI-framework-free helpers: colours, groups and the "Show" filter.

import type { Fighter, FightRecord, LayoutId, StyleMapData } from "../../data/types";

export const GOLD = "#f5c518";

/** "29-4-0" (wins-losses-draws). */
export const formatRecord = (r: FightRecord) => `${r.wins}-${r.losses}-${r.draws}`;

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
  "Pure strikers": "#ff6b4a",
  "Dominant wrestlers": "#4ea8de",
  "Scrambly grapplers": "#b388eb",
  "Volume mixers": "#ffc145",
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
