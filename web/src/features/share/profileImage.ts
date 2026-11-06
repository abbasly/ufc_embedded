// The share image for a Pick'em profile: picture, name, the season in numbers, best call and
// badges, with the site's address. Square, for Instagram, WhatsApp and Reddit alike.

import { avatar, background, FONT, fitFont, footer, header, loadImage, newCanvas, RED, SIZE, TEXT, DIM, toBlob } from "./draw";

export interface ProfileCard {
  name: string;
  photo: string | null | undefined; // the fighter photo they chose
  rank: number | null; // overall
  points: number;
  correct: number;
  picked: number;
  cards: number;
  vsModel: string | null; // e.g. "3–1"
  bestCall: string | null; // e.g. "Called Topuria at 38%"
  badges: string[]; // earned
}

const GOLD = "#f4c430";

export async function profileImage(p: ProfileCard): Promise<Blob> {
  const { canvas, ctx } = newCanvas();
  background(ctx);
  header(ctx, "Pick'em");

  // Picture and name.
  const img = await loadImage(p.photo);
  avatar(ctx, img, p.name, SIZE / 2, 270, 190, RED);
  ctx.fillStyle = TEXT;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitFont(ctx, p.name, 800, 64, 36, SIZE - 160);
  ctx.fillText(p.name, SIZE / 2, 450);
  ctx.fillStyle = DIM;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(`${p.rank ? `#${p.rank} overall · ` : ""}${p.cards} ${p.cards === 1 ? "card" : "cards"} played`, SIZE / 2, 500);

  // The numbers.
  const tiles = [
    { label: "POINTS", value: String(p.points) },
    { label: "RIGHT PICKS", value: p.picked ? `${Math.round((100 * p.correct) / p.picked)}%` : "–" },
    { label: "VS THE MODEL", value: p.vsModel ?? "–" },
  ];
  const w = 280;
  const gap = 30;
  const left = SIZE / 2 - (tiles.length * w + (tiles.length - 1) * gap) / 2;
  tiles.forEach((t, i) => {
    const x = left + i * (w + gap);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.roundRect(x, 550, w, 150, 18);
    ctx.fill();
    ctx.fillStyle = DIM;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(t.label, x + w / 2, 595);
    ctx.fillStyle = TEXT;
    ctx.font = `800 56px ${FONT}`;
    ctx.fillText(t.value, x + w / 2, 665);
  });

  // Best call and badges.
  let y = 770;
  if (p.bestCall) {
    ctx.fillStyle = TEXT;
    fitFont(ctx, `Best call: ${p.bestCall}`, 600, 34, 24, SIZE - 160);
    ctx.fillText(`Best call: ${p.bestCall}`, SIZE / 2, y);
    y += 70;
  }
  if (p.badges.length) {
    ctx.font = `700 26px ${FONT}`;
    const chips = p.badges.map((b) => ({ b, w: ctx.measureText(b).width + 44 }));
    const total = chips.reduce((n, c) => n + c.w, 0) + (chips.length - 1) * 16;
    let x = SIZE / 2 - total / 2;
    for (const c of chips) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y - 36, c.w, 52, 26);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.textAlign = "left";
      ctx.fillText(c.b, x + 22, y - 1);
      x += c.w + 16;
    }
    ctx.textAlign = "center";
  }

  footer(ctx, "Think you can beat me?");
  return toBlob(canvas);
}
