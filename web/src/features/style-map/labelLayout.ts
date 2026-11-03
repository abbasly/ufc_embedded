// Screen-space placement for the labels of the selected fighter's neighbours. Similar
// fighters sit close together on the map, so labels pinned to their dots would pile up:
// instead each label is pushed outward from the selected fighter until it fits.

export interface Box {
  x: number; // left, px
  y: number; // top, px
  w: number;
  h: number;
}

export interface LabelInput {
  ax: number; // the dot it labels, px
  ay: number;
  w: number; // label size, px
  h: number;
}

const RADII = [10, 18, 28, 40, 54, 70, 88, 108, 130, 156, 186];
// Angles to try either side of "straight out from the selected fighter", nearest first.
const TURNS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1, Math.PI];
const PAD = 3; // px kept between labels
const DOT = 10; // px around each dot that labels keep clear of

export const overlaps = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

const inside = (b: Box, w: number, h: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h;

/**
 * A box per label, in order (place the most important first): next to its dot, on the side
 * facing away from ``center`` where possible, clear of the ``blocked`` boxes, the dots and the
 * labels placed before it, and inside a ``width`` x ``height`` view. If nothing fits, the
 * label goes just outside its dot.
 */
export function placeLabels(
  center: { x: number; y: number },
  labels: LabelInput[],
  blocked: Box[],
  width: number,
  height: number,
): Box[] {
  const dots = labels.map((l) => ({ x: l.ax - DOT / 2, y: l.ay - DOT / 2, w: DOT, h: DOT }));
  const placed: Box[] = [...blocked, ...dots];
  return labels.map((l, i) => {
    const dx = l.ax - center.x;
    const dy = l.ay - center.y;
    // A dot right on top of the selection has no "outward": fan those out evenly instead.
    const base = Math.hypot(dx, dy) > 4 ? Math.atan2(dy, dx) : -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
    const at = (r: number, a: number): Box => {
      // The point r px out at angle a, with the label hanging off it on the far side.
      const px = l.ax + Math.cos(a) * r;
      const py = l.ay + Math.sin(a) * r;
      return { x: px - l.w / 2 + (Math.cos(a) * l.w) / 2, y: py - l.h / 2 + (Math.sin(a) * l.h) / 2, w: l.w, h: l.h };
    };
    let box: Box | undefined;
    for (const r of RADII) {
      for (const t of TURNS) {
        const candidate = at(r, base + t);
        if (inside(candidate, width, height) && !placed.some((p) => overlaps(p, candidate, PAD))) {
          box = candidate;
          break;
        }
      }
      if (box) break;
    }
    box ??= at(RADII[0]!, base);
    placed.push(box);
    return box;
  });
}

/** The point on a box's edge nearest to (x, y): where a leader line from the dot meets it. */
export function nearestEdge(box: Box, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(box.x + box.w, Math.max(box.x, x)),
    y: Math.min(box.y + box.h, Math.max(box.y, y)),
  };
}
