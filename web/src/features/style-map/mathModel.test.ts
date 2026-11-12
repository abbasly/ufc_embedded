import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { StyleMapData } from "../../data/types";
import { changes, chain, closest, combine, embeddingDistance, formatTerms, hasMath, parseTerms, place, PRESETS, presetTerms, styleRef, type Term, termVector } from "./mathModel";

// A tiny made-up map: two stats, an identity-like projection, three fighters in two styles.
function tiny(): StyleMapData {
  const fighter = (id: string, cluster: number, vec: number[]) => ({ id, name: id.toUpperCase(), weight_class: "Lightweight", cluster, vec }) as unknown as StyleMapData["fighters"][number];
  return {
    features: [{ key: "a", label: "Strikes" }, { key: "b", label: "Takedowns" }],
    clusters: [{ id: 0, name: "Strikers" }, { id: 1, name: "Wrestlers" }],
    fighters: [fighter("p", 0, [2, 0]), fighter("q", 0, [0, 0]), fighter("r", 1, [0, 2])],
    math: {
      keys: ["b", "a"], // not the features order, on purpose
      weights: [1, 1],
      typical_distance: 2,
      projection: { matrix: [[1, 0, 0], [0, 1, 0]], mean: [0.5, 0.5, 0], std: [1, 1, 1], scale3: 2, scale2: 3 },
    },
  } as unknown as StyleMapData;
}

describe("fighter math", () => {
  it("averages a style and adds terms with their signs", () => {
    const data = tiny();
    expect(termVector(data, styleRef(0))).toEqual([1, 0]);
    const terms: Term[] = [{ sign: 1, ref: "p" }, { sign: -1, ref: styleRef(0) }, { sign: 1, ref: styleRef(1) }];
    expect(combine(data, terms)).toEqual([1, 2]);
  });

  it("chains arrows that end exactly where the sum is placed", () => {
    const data = tiny();
    if (!hasMath(data)) throw new Error("no math");
    const terms: Term[] = [{ sign: 1, ref: "p" }, { sign: -1, ref: "q" }, { sign: 1, ref: "r" }, { sign: 1, ref: "r" }];
    for (const dims of [2, 3] as const) {
      const points = chain(data, terms, dims)!;
      expect(points).toHaveLength(4);
      const end = place(data.math, combine(data, terms)!, dims);
      points.at(-1)!.forEach((v, i) => expect(v).toBeCloseTo(end[i]!));
    }
  });

  it("finds the closest real fighter, leaving out the terms themselves", () => {
    const data = tiny();
    if (!hasMath(data)) throw new Error("no math");
    const [best] = closest(data, [0.1, 1.9], new Set(["q"]));
    expect(best!.fighter.id).toBe("r");
    expect(best!.similarity).toBe(Math.round(100 * (1 - Math.hypot(0.1, 0.1) / 2)));
    expect(closest(data, [0.1, 1.9], new Set(["r"]))[0]!.fighter.id).not.toBe("r");
  });

  it("names the changes by the vectors' own stat order", () => {
    const data = tiny();
    if (!hasMath(data)) throw new Error("no math");
    // The first number is "b" (Takedowns) here, though Strikes comes first in features.
    expect(changes(data, [0, 0], [1, 0])).toEqual([{ label: "Takedowns", up: true }]);
  });

  it("measures distance through the learned metric when there is one", () => {
    const data = tiny();
    if (!hasMath(data)) throw new Error("no math");
    // A metric that only looks at the second number: the first stops mattering.
    data.math.metric = [[0], [2]];
    expect(embeddingDistance(data.math, [5, 1], [0, 0])).toBeCloseTo(2);
    expect(closest(data, [9, 2], new Set())[0]!.fighter.id).toBe("r");
  });

  it("round-trips terms through the address", () => {
    const terms: Term[] = [{ sign: 1, ref: "alex-pereira" }, { sign: -1, ref: "s:0" }, { sign: 1, ref: "s:2" }];
    expect(formatTerms(terms)).toBe("alex-pereira,-s:0,+s:2");
    expect(parseTerms("alex-pereira,-s:0,+s:2")).toEqual(terms);
    expect(parseTerms("-x")[0]!.sign).toBe(1); // the first term is always added
    expect(parseTerms("a,+s:2,+s:2,-a").map((t) => t.ref)).toEqual(["a", "s:2"]); // each once
  });
});

describe("fighter math on the real map", () => {
  const data = JSON.parse(readFileSync("public/data/style_map.json", "utf8")) as StyleMapData;

  it.runIf(hasMath(data))("places every fighter where the map does", () => {
    if (!hasMath(data)) return;
    let worst = 0;
    for (const f of data.fighters) {
      for (const dims of [2, 3] as const) {
        const p = place(data.math, f.vec!, dims);
        const want = dims === 3 ? f.coords.axes : f.coords_2d.axes;
        for (let a = 0; a < dims; a++) worst = Math.max(worst, Math.abs(p[a]! - want[a]!));
      }
    }
    expect(worst).toBeLessThan(0.01);
  });

  it.runIf(hasMath(data))("finds each fighter's most similar fighter, like the map's own lists", () => {
    if (!hasMath(data)) return;
    const agree = data.fighters.filter((f) => closest(data, f.vec!, new Set([f.id]), 1)[0]!.fighter.id === f.neighbours[0]!.id);
    expect(agree.length / data.fighters.length).toBeGreaterThan(0.99);
  });

  it.runIf(hasMath(data))("has presets that resolve on today's map", () => {
    expect(PRESETS.filter((p) => presetTerms(data, p)).length).toBeGreaterThan(0);
  });
});
