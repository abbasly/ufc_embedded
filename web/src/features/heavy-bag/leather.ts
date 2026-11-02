// The bag's surface, painted on a canvas (no image files): dark red leather with grain,
// vertical panel seams, and a black band with the site name near the top.

import * as THREE from "three";

export function leatherTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;

  // Leather: a deep red with a little vertical shading, then fine grain.
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#5e0d0d");
  base.addColorStop(0.5, "#7d1414");
  base.addColorStop(1, "#5a0c0c");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }

  // Four panels: a seam with stitches between each.
  for (let k = 0; k < 4; k++) {
    const x = (k / 4) * w + 2;
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
    g.strokeStyle = "rgba(255,210,200,0.25)";
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 18) {
      g.beginPath();
      g.moveTo(x + 7, y);
      g.lineTo(x + 7, y + 9);
      g.stroke();
    }
  }

  // Black bands top and bottom, the top one with the name on the front and back.
  // v runs bottom (canvas bottom) to top (canvas top) along the bag's profile.
  const band = (y0: number, y1: number) => {
    g.fillStyle = "#121212";
    g.fillRect(0, y0, w, y1 - y0);
  };
  band(h * 0.16, h * 0.27);
  band(h * 0.8, h * 0.86);
  g.fillStyle = "#f1f1f1";
  g.font = "bold 58px Inter, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  // One copy centred on the front (u = 0.5), one on the back (split across the u = 0/1 edge).
  for (const x of [0, w * 0.5, w]) g.fillText("UFC EMBEDDED", x, h * 0.215);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Side profile of a heavy bag (radius, height), turned into a solid with LatheGeometry:
 *  flat top and bottom with rounded edges, very slightly fuller in the middle. */
export function bagProfile(radius: number, half: number, corner = 0.07): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -half)];
  const arc = (cx: number, cy: number, from: number, to: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = from + ((to - from) * i) / 8;
      pts.push(new THREE.Vector2(cx + corner * Math.cos(a), cy + corner * Math.sin(a)));
    }
  };
  arc(radius - corner, -half + corner, -Math.PI / 2, 0); // bottom edge
  for (let i = 1; i < 10; i++) {
    const y = -half + corner + ((2 * (half - corner)) * i) / 10;
    const bulge = 0.012 * (1 - (y / half) ** 2);
    pts.push(new THREE.Vector2(radius + bulge, y));
  }
  arc(radius - corner, half - corner, 0, Math.PI / 2); // top edge
  pts.push(new THREE.Vector2(0, half));
  return pts;
}
