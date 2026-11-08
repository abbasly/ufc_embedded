// The share image for a fighter: their trading card (captured from the page) beside their record,
// Elo, last results and next fight, with the site's address. Without the card it falls back to a
// round photo.

import { avatar, background, DIM, FONT, fitFont, footer, header, loadImage, newCanvas, RED, SIZE, TEXT, toBlob } from "./draw";

export interface FighterShare {
  name: string;
  photo: string | undefined;
  detail: string; // e.g. "#12 Heavyweight"
  record: string;
  elo: number;
  recent: ("W" | "L")[]; // most recent first
  next: { opponent: string; card: string; chance: number | null } | null;
  card?: CanvasImageSource & { width: number; height: number };
}

const GREEN = "#51cf66";
const CARD_H = 760;
const CARD_W = (CARD_H * 63) / 88;
const CARD_X = 60;
const CARD_Y = 140;
const PANEL_X = CARD_X + CARD_W + 44;
const PANEL_W = SIZE - PANEL_X - 60;

export async function fighterImage(f: FighterShare): Promise<Blob> {
  const { canvas, ctx } = newCanvas();
  const photo = f.card ? null : await loadImage(f.photo);
  background(ctx);
  header(ctx, "Fighter file");

  if (f.card) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high"; // the snapshot is scaled down: keep the small text sharp
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.drawImage(f.card, CARD_X, CARD_Y, CARD_W, CARD_H);
    ctx.restore();
  } else {
    avatar(ctx, photo, f.name, CARD_X + CARD_W / 2, CARD_Y + CARD_H / 2, 420, RED);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Name and division.
  ctx.fillStyle = TEXT;
  fitFont(ctx, f.name, 800, 50, 28, PANEL_W);
  ctx.fillText(f.name, PANEL_X, 200);
  ctx.fillStyle = DIM;
  fitFont(ctx, f.detail, 500, 28, 20, PANEL_W);
  ctx.fillText(f.detail, PANEL_X, 244);

  // Record and Elo.
  let y = 340;
  for (const [label, value] of [
    ["RECORD", f.record],
    ["ELO RATING", String(f.elo)],
  ]) {
    ctx.fillStyle = DIM;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(label!, PANEL_X, y);
    ctx.fillStyle = TEXT;
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(value!, PANEL_X, y + 66);
    y += 150;
  }

  // The last results, newest on the left.
  if (f.recent.length) {
    ctx.fillStyle = DIM;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText("LAST FIGHTS", PANEL_X, y);
    const size = 56;
    const gap = 12;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    f.recent.slice(0, 5).forEach((result, i) => {
      const x = PANEL_X + i * (size + gap);
      ctx.fillStyle = result === "W" ? GREEN : RED;
      ctx.beginPath();
      ctx.roundRect(x, y + 18, size, size, 10);
      ctx.fill();
      ctx.fillStyle = "#17181b";
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(result, x + size / 2, y + 18 + size / 2 + 1);
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    y += 124;
  }

  // The next fight, when one's booked.
  if (f.next) {
    ctx.fillStyle = DIM;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText("NEXT FIGHT", PANEL_X, y);
    ctx.fillStyle = TEXT;
    const line = `vs ${f.next.opponent}`;
    fitFont(ctx, line, 700, 34, 22, PANEL_W);
    ctx.fillText(line, PANEL_X, y + 42);
    ctx.fillStyle = DIM;
    const event = f.next.card.split(":")[0]!;
    const detail = f.next.chance === null ? event : `${event} · model gives ${f.next.chance}%`;
    fitFont(ctx, detail, 500, 26, 18, PANEL_W);
    ctx.fillText(detail, PANEL_X, y + 80);
  }

  footer(ctx, "Records, ratings and predictions:");
  return toBlob(canvas);
}
