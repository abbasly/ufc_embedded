import { describe, expect, it } from "vitest";

import { type Box, nearestEdge, overlaps, placeLabels } from "./labelLayout";

const label = (ax: number, ay: number) => ({ ax, ay, w: 90, h: 20 });

describe("placeLabels", () => {
  it("keeps labels of a tight cluster apart, off the blocked box and inside the view", () => {
    const center = { x: 400, y: 300 };
    const selected: Box = { x: 340, y: 270, w: 120, h: 22 };
    const labels = [label(405, 300), label(398, 306), label(410, 296), label(400, 300), label(395, 290), label(402, 310)];
    const boxes = placeLabels(center, labels, [selected], 800, 600);
    expect(boxes).toHaveLength(labels.length);
    for (const [i, a] of boxes.entries()) {
      expect(overlaps(a, selected)).toBe(false);
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y + a.h).toBeLessThanOrEqual(600);
      for (const b of boxes.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    }
  });

  it("puts a label on the far side of its dot from the selected fighter", () => {
    const [right] = placeLabels({ x: 100, y: 100 }, [label(300, 100)], [], 800, 600);
    expect(right!.x).toBeGreaterThan(300);
    const [left] = placeLabels({ x: 500, y: 100 }, [label(300, 100)], [], 800, 600);
    expect(left!.x + left!.w).toBeLessThan(300);
  });

  it("stays inside the view near its edge", () => {
    const [box] = placeLabels({ x: 400, y: 300 }, [label(790, 300)], [], 800, 600);
    expect(box!.x + box!.w).toBeLessThanOrEqual(800);
  });
});

describe("nearestEdge", () => {
  it("clamps a point onto the box", () => {
    expect(nearestEdge({ x: 10, y: 10, w: 20, h: 10 }, 0, 15)).toEqual({ x: 10, y: 15 });
    expect(nearestEdge({ x: 10, y: 10, w: 20, h: 10 }, 50, 50)).toEqual({ x: 30, y: 20 });
  });
});
