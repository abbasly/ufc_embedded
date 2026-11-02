import { describe, expect, it } from "vitest";

import type { PredictorFighter } from "../../data/types";
import { isActive, movers, yearChange } from "./ladder";

const f = (id: string, elo: number, ago: number | null, last = "2026-06-01") =>
  ({ id, name: id, elo, elo_year_ago: ago, last_fight: last }) as PredictorFighter;

describe("ladder", () => {
  it("activity is relative to the data date", () => {
    expect(isActive(f("a", 1500, 1500, "2025-01-01"), "2026-11-01")).toBe(true);
    expect(isActive(f("b", 1500, 1500, "2024-06-01"), "2026-11-01")).toBe(false);
  });

  it("finds the biggest climbers and drops, skipping debutants", () => {
    const all = [f("up", 1700, 1550), f("down", 1500, 1640), f("flat", 1600, 1600), f("new", 1650, null)];
    expect(yearChange(all[3]!)).toBeNull();
    expect(movers(all, 1).map((x) => x.id)).toEqual(["up"]);
    expect(movers(all, -1).map((x) => x.id)).toEqual(["down"]);
  });
});
