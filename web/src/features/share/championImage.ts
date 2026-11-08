// The share image for winning a league's card: crown, picture, league and score. Square, like the
// other share images.

import { avatar, background, DIM, FONT, fitFont, footer, header, loadImage, newCanvas, SIZE, TEXT, toBlob } from "./draw";

export interface ChampionCard {
  name: string;
  photo: string | null | undefined;
  league: string;
  event: string;
  points: number;
  titles: number; // in this league, this one included
}

const GOLD = "#f4c430";

export async function championImage(c: ChampionCard): Promise<Blob> {
  const { canvas, ctx } = newCanvas();
  background(ctx);
  header(ctx, "League champion");
  const img = await loadImage(c.photo);

  // The crown, from the one on the leaderboards (a 24 by 18 drawing).
  ctx.save();
  ctx.translate(SIZE / 2 - 84, 138);
  ctx.scale(7, 7);
  ctx.fillStyle = GOLD;
  ctx.fill(new Path2D("M2.5 16.5h19L23 4l-6.3 4.6L12 1 7.3 8.6 1 4Z"));
  ctx.restore();

  avatar(ctx, img, c.name, SIZE / 2, 420, 300, GOLD);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = TEXT;
  fitFont(ctx, c.name, 800, 76, 40, SIZE - 160);
  ctx.fillText(c.name, SIZE / 2, 660);

  ctx.fillStyle = GOLD;
  fitFont(ctx, `Champion of ${c.league}`, 800, 46, 28, SIZE - 160);
  ctx.fillText(`Champion of ${c.league}`, SIZE / 2, 735);

  ctx.fillStyle = DIM;
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText(`${c.event.split(":")[0]} · ${c.points} points`, SIZE / 2, 800);
  if (c.titles > 1) ctx.fillText(`${c.titles} titles in this league`, SIZE / 2, 850);

  footer(ctx, "Think you can take the crown?");
  return toBlob(canvas);
}
