import { describe, expect, it } from "vitest";

import { hydrateStyleMap, neighboursOf, percentiles } from "./styleMap";
import type { StyleMapWire } from "./types";

// Two stats, an identity metric and projection, four fighters in two weight classes.
function wire(): StyleMapWire {
  const f = (id: string, weight_class: string, stats: number[]) => ({ id, name: id, weight_class, cluster: 0, stats, vec: stats, similarity3: [0, 0, 0], similarity2: [0, 0] });
  return {
    schema_version: 7,
    math: {
      keys: ["a", "b"],
      weights: [1, 1],
      metric: [[1, 0], [0, 1]],
      typical_distance: 10,
      projection: { matrix: [[1, 0, 0], [0, 1, 0]], mean: [0, 0, 0], std: [1, 1, 1], scale3: 1, scale2: 1 },
    },
    fighters: [f("p", "LW", [0, 0]), f("q", "LW", [3, 4]), f("r", "WW", [1, 0]), f("s", "WW", [1, 1])],
  } as unknown as StyleMapWire;
}

describe("the style map, worked out in the browser", () => {
  it("ranks percentiles like pandas, ties sharing their average rank", () => {
    expect(percentiles([10, 30, 20, 20])).toEqual([0.25, 1, 0.625, 0.625]);
  });

  it("rebuilds stats, percentiles and Style axes positions from the wire format", () => {
    const data = hydrateStyleMap(wire());
    const q = data.fighters.find((x) => x.id === "q")!;
    expect(q.stats).toEqual({ a: 3, b: 4 });
    expect(q.percentiles).toEqual({ a: 1, b: 1 });
    expect(q.coords.axes).toEqual([3, 4, 0]);
    expect(q.coords_2d.axes).toEqual([3, 4]);
    expect(q.emb).toEqual([3, 4]);
  });

  it("finds the most similar fighters, across the map or in the weight class", () => {
    const data = hydrateStyleMap(wire());
    const p = data.fighters.find((x) => x.id === "p")!;
    expect(neighboursOf(data, p, "all", 2).map((n) => n.id)).toEqual(["r", "s"]);
    expect(neighboursOf(data, p, "division")).toEqual([{ id: "q", distance: 5, similarity: 50 }]);
  });
});
