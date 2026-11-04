// The MMA math share image: the chain of wins around a circle, like on the page, with the
// verdict in the middle ("Josh Hokit beats Ilia Topuria") and the site's address underneath.
//
// Sizes follow the chain's length: avatars, names and fight labels shrink as more fighters
// share the rim. Names sit outside the circle and fight labels inside it, so the two never
// collide; fight labels are left out only when the arcs get too short for them.

import type { MmaFighter } from "../../data/types";
import type { Fight } from "../mma-math/graph";
import { DIM, FONT, RED, SIZE, TEXT, avatar, background, fitFont, footer, header, loadImage, newCanvas, toBlob, wrapCentered } from "./draw";

export interface ChainFighter {
  fighter: MmaFighter;
  ring: string; // the avatar ring colour on the site (gold for champions, else the style colour)
}

const CX = SIZE / 2;
const CY = 566;
const R = 300; // leaves room outside the rim for names, between the header and the footer

export async function mmaMathImage(fights: Fight[], nodes: ChainFighter[]): Promise<Blob> {
  const { canvas, ctx } = newCanvas();
  const photos = await Promise.all(nodes.map((n) => loadImage(n.fighter.image?.url)));
  const n = nodes.length;

  background(ctx);
  header(ctx, "MMA math");

  const spacing = (2 * Math.PI * R) / n; // rim length per fighter
  const size = Math.round(Math.max(46, Math.min(100, spacing * 0.55)));
  const nameFont = n <= 8 ? 24 : n <= 12 ? 21 : n <= 16 ? 19 : 17;
  const labelFont = n <= 10 ? 21 : 18;
  const showLabels = spacing >= 100;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const at = (a: number, radius = R): [number, number] => [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
  const gap = (size / 2 + 12) / R; // keep arrows clear of the avatars

  // Fights: red arrows along the rim; the closing arc back to the start is dashed.
  for (let i = 0; i < n; i++) {
    const from = angle(i) + gap;
    const to = angle(i + 1) - gap;
    if (to <= from) continue;
    const closing = i === n - 1;
    ctx.beginPath();
    ctx.arc(CX, CY, R, from, to);
    ctx.strokeStyle = closing ? "#5c5f66" : RED;
    ctx.lineWidth = closing ? 3 : n > 14 ? 4 : 5;
    ctx.setLineDash(closing ? [8, 12] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!closing) arrowHead(ctx, to, n > 14 ? 0.8 : 1);
  }

  // How each fight ended, inside the rim, clear of the avatars.
  const labelRadius = R - size / 2 - (showLabels ? 46 : 0);
  if (showLabels) {
    ctx.fillStyle = DIM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${labelFont}px ${FONT}`;
    fights.forEach((f, i) => {
      const [x, y] = at((angle(i) + angle(i + 1)) / 2, labelRadius);
      ctx.fillText(f.method, x, y - labelFont * 0.6);
      ctx.fillText(f.date.slice(0, 4), x, y + labelFont * 0.6);
    });
  }

  // Fighters on the rim, each name just outside the circle, on the side facing out.
  nodes.forEach((node, i) => {
    const a = angle(i);
    const [x, y] = at(a);
    avatar(ctx, photos[i] ?? null, node.fighter.name, x, y, size, node.ring);
    const name = `${node.fighter.champion ? "🏆 " : ""}${node.fighter.name}`;
    ctx.fillStyle = TEXT;
    ctx.font = `600 ${nameFont}px ${FONT}`;
    const lineHeight = nameFont * 1.15;
    const width = Math.min(200, Math.max(120, spacing * 1.05));
    const [ox, oy] = at(a, R + size / 2 + 10);
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    if (Math.abs(sin) > 0.85) {
      // Top or bottom of the circle: name centred above / below the avatar.
      ctx.textBaseline = sin < 0 ? "bottom" : "top";
      const lines = linesNeeded(ctx, name, width);
      const top = sin < 0 ? oy - (lines - 1) * lineHeight : oy;
      wrapCentered(ctx, name, x, top, width, lineHeight);
    } else {
      // Sides: name beside the avatar, aligned away from the circle.
      ctx.textBaseline = "middle";
      ctx.textAlign = cos > 0 ? "left" : "right";
      const lines = splitLines(ctx, name, 190);
      lines.forEach((l, k) => ctx.fillText(l, ox, oy + (k - (lines.length - 1) / 2) * lineHeight));
    }
  });

  // The verdict in the middle, sized to the space inside the fight labels.
  const winner = nodes[0]!.fighter.name;
  const loser = nodes[n - 1]!.fighter.name;
  const inner = 2 * (labelRadius - (showLabels ? 54 : 30));
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillStyle = TEXT;
  fitFont(ctx, winner, 800, 50, 26, inner);
  ctx.fillText(winner, CX, CY - 38);
  ctx.fillStyle = RED;
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText("beats", CX, CY + 8);
  ctx.fillStyle = TEXT;
  fitFont(ctx, loser, 800, 50, 26, inner);
  ctx.fillText(loser, CX, CY + 62);
  ctx.fillStyle = DIM;
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(fights.length === 1 ? "They actually fought. Real math." : `${fights.length} fights of airtight logic`, CX, CY + 104);

  footer(ctx, "Prove anyone beats anyone at");
  return toBlob(canvas);
}

/** Words split into lines no wider than ``maxWidth`` (at most two; a long tail is shortened). */
function splitLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(" ");
  for (let k = words.length - 1; k > 0; k--) {
    const first = words.slice(0, k).join(" ");
    if (ctx.measureText(first).width <= maxWidth) return [first, words.slice(k).join(" ")];
  }
  return [text];
}

function linesNeeded(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): number {
  return ctx.measureText(text).width <= maxWidth ? 1 : 2;
}

/** A filled arrowhead on the rim at angle ``a``, pointing clockwise. */
function arrowHead(ctx: CanvasRenderingContext2D, a: number, scale: number) {
  const x = CX + R * Math.cos(a);
  const y = CY + R * Math.sin(a);
  const dir = a + Math.PI / 2; // the clockwise tangent
  const len = 18 * scale;
  const wing = 10 * scale;
  const side = dir + Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(x + len * 0.35 * Math.cos(dir), y + len * 0.35 * Math.sin(dir));
  ctx.lineTo(x - len * Math.cos(dir) + wing * Math.cos(side), y - len * Math.sin(dir) + wing * Math.sin(side));
  ctx.lineTo(x - len * Math.cos(dir) - wing * Math.cos(side), y - len * Math.sin(dir) - wing * Math.sin(side));
  ctx.closePath();
  ctx.fillStyle = RED;
  ctx.fill();
}
