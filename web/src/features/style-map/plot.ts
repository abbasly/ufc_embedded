// Pure functions that turn StyleMapData + UI state into Plotly traces/layout.

import type { Data, Layout } from "plotly.js";

import type { Fighter, StyleMapData } from "../../data/types";

const GOLD = "#f5c518";

export type ColorBy = "style" | "weight_class";
export type Dims = 2 | 3;

const STYLE_COLORS: Record<string, string> = {
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

function colorOf(group: string, colorBy: ColorBy): string {
  return colorBy === "style" ? (STYLE_COLORS[group] ?? "#999") : weightColor(group);
}

function points(fighters: Fighter[], dims: Dims) {
  return {
    x: fighters.map((f) => f.coords[0] ?? 0),
    y: fighters.map((f) => f.coords[1] ?? 0),
    ...(dims === 3 ? { z: fighters.map((f) => f.coords[2] ?? 0) } : {}),
    type: dims === 3 ? "scatter3d" : "scattergl",
    mode: "markers",
  } as const;
}

interface TraceInput {
  data: StyleMapData;
  visible: (f: Fighter) => boolean;
  colorBy: ColorBy;
  dims: Dims;
  selectedId: string | null;
}

export function buildTraces({ data, visible, colorBy, dims, selectedId }: TraceInput): Data[] {
  const size = dims === 3 ? 5 : 7;
  const hidden = data.fighters.filter((f) => !visible(f));
  const shown = data.fighters.filter(visible);

  const groups = new Map<string, Fighter[]>();
  for (const f of shown) {
    const g = groupOf(f, data, colorBy);
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  const order = colorBy === "style" ? Object.keys(STYLE_COLORS) : WEIGHT_CLASSES;
  const sorted = [...groups].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));

  const traces: Data[] = [
    {
      ...points(hidden, dims),
      name: "Filtered out",
      showlegend: false,
      hoverinfo: "skip",
      marker: { size, color: "#555", opacity: 0.15 },
    },
    ...sorted.map(([group, fs]) => ({
      ...points(fs, dims),
      name: group,
      text: fs.map((f) => f.name),
      customdata: fs.map((f) => f.id),
      hovertemplate: `<b>%{text}</b><br>${group}<extra></extra>`,
      marker: { size, color: colorOf(group, colorBy), opacity: 0.85 },
    })),
  ];

  // Champions are always labelled.
  const champs = shown.filter((f) => f.champion);
  traces.push({
    ...points(champs, dims),
    mode: "text+markers",
    name: "Champions",
    showlegend: false,
    text: champs.map((f) => `🏆 ${f.name}`),
    customdata: champs.map((f) => f.id),
    textposition: "top center",
    textfont: { color: GOLD, size: 11 },
    hovertext: champs.map((f) => `<b>🏆 ${f.name}</b><br>${f.champion} champion`),
    hovertemplate: "%{hovertext}<extra></extra>",
    marker: {
      size: size * 1.6,
      color: champs.map((f) => colorOf(groupOf(f, data, colorBy), colorBy)),
      line: { color: GOLD, width: 2 },
    },
  } as Data);

  const selected = data.fighters.find((f) => f.id === selectedId);
  if (selected) {
    const byId = new Map(data.fighters.map((f) => [f.id, f]));
    const neighbours = selected.neighbours.flatMap((n) => byId.get(n.id) ?? []);
    const hl = [selected, ...neighbours];
    traces.push({
      ...points(hl, dims),
      mode: "text+markers",
      name: "Selected",
      showlegend: false,
      // Label only the selected fighter; neighbours get a ring and a hover label.
      text: hl.map((f, i) => (i === 0 ? f.name : "")),
      hovertext: hl.map((f) => f.name),
      customdata: hl.map((f) => f.id),
      textposition: "top center",
      textfont: { color: "#fff", size: 11 },
      hovertemplate: "<b>%{hovertext}</b><extra></extra>",
      marker: {
        size: hl.map((_, i) => (i === 0 ? size * 3 : size * 1.8)),
        color: hl.map((f) => colorOf(groupOf(f, data, colorBy), colorBy)),
        line: { color: "#fff", width: 2 },
      },
    } as Data);
  }
  return traces;
}

export function buildLayout(data: StyleMapData, dims: Dims): Partial<Layout> {
  const title = (i: number) => {
    const a = data.axes[i];
    if (!a) return "";
    return dims === 3 ? a.label : `← ${a.low}  ·  ${a.high} →`;
  };
  const axis = (i: number) => ({
    title: { text: title(i), font: { size: 11 } },
    zeroline: false,
    gridcolor: "#333",
    showspikes: false,
  });

  return {
    // Keeps zoom/rotation across re-renders; resets when switching 2D/3D.
    uirevision: dims,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#ccc" },
    margin: { l: 0, r: 0, t: 0, b: 0 },
    legend: { orientation: "h", y: 1, x: 0, bgcolor: "rgba(0,0,0,0)" },
    hovermode: "closest",
    ...(dims === 3
      ? {
          scene: {
            xaxis: axis(0),
            yaxis: axis(1),
            zaxis: axis(2),
            aspectmode: "cube",
            camera: { eye: { x: 1.1, y: 1.1, z: 0.7 } },
          },
        }
      : {
          xaxis: { ...axis(0), automargin: true },
          yaxis: { ...axis(1), automargin: true },
          margin: { l: 50, r: 10, t: 30, b: 50 },
        }),
  } as Partial<Layout>;
}
