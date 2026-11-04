// The fight predictor share image: both fighters' trading cards (captured from the page) face
// to face, the model's win chances with the red / blue bar, the most likely ending, and the
// site's address. Without the cards it falls back to round photos and names.

import { DIM, FONT, SIZE, TEXT, avatar, background, fitFont, footer, header, loadImage, newCanvas, toBlob } from "./draw";

export interface Corner {
  name: string;
  photo: string | undefined;
  detail: string; // e.g. "Lightweight · #2" or "Lightweight champion"
}

export interface Prediction {
  a: Corner; // red corner
  b: Corner; // blue corner
  pA: number; // P(A wins)
  ending: { winner: string; method: string; p: number; isA: boolean }; // the most likely outcome
  event?: string; // "UFC 335 · Sat 14 Nov" when the fight is booked
  cards?: [CanvasImageSource & { width: number; height: number }, CanvasImageSource & { width: number; height: number }];
}

const A_RED = "#fa5252";
const B_BLUE = "#339af0";
const PHOTO = 290;
const PHOTO_Y = 420;
const LEFT = SIZE / 4;
const RIGHT = (SIZE * 3) / 4;

export async function predictorImage(p: Prediction): Promise<Blob> {
  const { canvas, ctx } = newCanvas();
  const [imgA, imgB] = await Promise.all([loadImage(p.a.photo), loadImage(p.b.photo)]);

  background(ctx);
  header(ctx, "Fight predictor");

  if (p.event) pill(ctx, p.event.toUpperCase(), SIZE / 2, 150);

  if (p.cards) {
    // The two trading cards, tilted towards each other like a hand of cards; VS between.
    // Big and only slightly tilted, so the text on them stays crisp.
    const h = 540;
    const w = (h * 63) / 88;
    const mid = p.event ? 456 : 436;
    card(ctx, p.cards[0], LEFT + 12, mid, w, h, -2.5);
    card(ctx, p.cards[1], RIGHT - 12, mid, w, h, 2.5);
    vs(ctx, SIZE / 2, mid);
  } else {
    // Face to face, VS between them, names and divisions underneath.
    avatar(ctx, imgA, p.a.name, LEFT, PHOTO_Y, PHOTO, A_RED);
    avatar(ctx, imgB, p.b.name, RIGHT, PHOTO_Y, PHOTO, B_BLUE);
    vs(ctx, SIZE / 2, PHOTO_Y);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const [corner, x] of [[p.a, LEFT], [p.b, RIGHT]] as const) {
      ctx.fillStyle = TEXT;
      fitFont(ctx, corner.name, 800, 44, 28, 440);
      ctx.fillText(corner.name, x, PHOTO_Y + PHOTO / 2 + 62);
      ctx.fillStyle = DIM;
      ctx.font = `500 25px ${FONT}`;
      ctx.fillText(corner.detail, x, PHOTO_Y + PHOTO / 2 + 100);
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Win chances and the bar between them.
  const pctY = 818;
  ctx.font = `800 92px ${FONT}`;
  ctx.fillStyle = A_RED;
  ctx.fillText(`${Math.round(p.pA * 100)}%`, LEFT, pctY);
  ctx.fillStyle = B_BLUE;
  ctx.fillText(`${Math.round((1 - p.pA) * 100)}%`, RIGHT, pctY);
  ctx.fillStyle = DIM;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText("WIN CHANCE", SIZE / 2, pctY - 30);
  const barX = 90;
  const barW = SIZE - 2 * barX;
  const barY = pctY + 26;
  const split = barX + barW * p.pA;
  roundRect(ctx, barX, barY, barW, 18, 9);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = A_RED;
  ctx.fillRect(barX, barY, split - barX, 18);
  ctx.fillStyle = B_BLUE;
  ctx.fillRect(split, barY, barX + barW - split, 18);
  ctx.restore();

  // The most likely ending, the winner's name in their corner's colour.
  ctx.fillStyle = DIM;
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText("MOST LIKELY ENDING", SIZE / 2, 920);
  const surname = p.ending.winner.split(" ").at(-1) ?? p.ending.winner;
  const rest = ` by ${p.ending.method} · ${Math.round(p.ending.p * 100)}%`;
  const size = fitFont(ctx, `${surname}${rest}`, 800, 40, 26, SIZE - 160);
  ctx.font = `800 ${size}px ${FONT}`;
  const wName = ctx.measureText(surname).width;
  const wRest = ctx.measureText(rest).width;
  const start = SIZE / 2 - (wName + wRest) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = p.ending.isA ? A_RED : B_BLUE;
  ctx.fillText(surname, start, 966);
  ctx.fillStyle = TEXT;
  ctx.fillText(rest, start + wName, 966);

  footer(ctx, "Who wins your matchup? Ask the model at");
  return toBlob(canvas);
}

function vs(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = DIM;
  ctx.font = `italic 900 54px ${FONT}`;
  ctx.fillText("VS", x, y);
}

/** A captured trading card, centred at (x, y), rotated by ``deg``, with a soft shadow. */
function card(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number, deg: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high"; // the snapshot is scaled down: keep the small text sharp
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A small red label, e.g. the event the fight is booked on. */
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = `800 22px ${FONT}`;
  const w = ctx.measureText(text).width + 36;
  roundRect(ctx, x - w / 2, y - 20, w, 40, 20);
  ctx.fillStyle = "rgba(250, 82, 82, 0.16)";
  ctx.fill();
  ctx.fillStyle = "#ff8787";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 1);
}
