// Canvas helpers for the share images: square cards (1080 x 1080, the size Instagram, Reddit
// and WhatsApp all show well) drawn in the site's dark style, with the site's address on them.

export const SIZE = 1080;
export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const RED = "#fa5252";
export const DIM = "#909296";
export const TEXT = "#e9ecef";
export const SITE = "ufc.anarli.com";

/** A photo for drawing, or null if it doesn't load in time. Wikimedia allows cross-origin use,
 * so the canvas can still be exported afterwards. */
export function loadImage(url: string | undefined | null, timeoutMs = 5000): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** The site's dark background with a soft red glow behind the top. */
export function background(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#17181b";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const glow = ctx.createRadialGradient(SIZE / 2, -120, 40, SIZE / 2, -120, SIZE * 0.9);
  glow.addColorStop(0, "rgba(250, 82, 82, 0.22)");
  glow.addColorStop(1, "rgba(250, 82, 82, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

/** The logo (an octagon, like the favicon) and the page's name, top left. */
export function header(ctx: CanvasRenderingContext2D, page: string) {
  const x = 60;
  const y = 64;
  const s = 40;
  ctx.save();
  ctx.translate(x, y);
  octagon(ctx, s / 2, s / 2, s / 2);
  ctx.fillStyle = "#d6262b";
  ctx.fill();
  octagon(ctx, s / 2, s / 2, s / 2 - 6);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText("UFC Embedded", x + s + 16, y + s / 2);
  const w = ctx.measureText("UFC Embedded").width;
  ctx.fillStyle = DIM;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(`·  ${page}`, x + s + 16 + w + 14, y + s / 2);
}

function octagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** The call to action and the address, centred together at the bottom. */
export function footer(ctx: CanvasRenderingContext2D, line: string) {
  const y = SIZE - 48;
  const site = `  ${SITE}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `500 28px ${FONT}`;
  const lineW = ctx.measureText(line).width;
  ctx.font = `700 28px ${FONT}`;
  const start = SIZE / 2 - (lineW + ctx.measureText(site).width) / 2;
  ctx.fillStyle = DIM;
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(line, start, y);
  ctx.fillStyle = RED;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(site, start + lineW, y);
}

/** A round avatar: the photo (top-aligned, like on the site) or the initials, with a ring. */
export function avatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  name: string,
  x: number,
  y: number,
  size: number,
  ring: string,
) {
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#2c2e33";
  ctx.fill();
  ctx.clip();
  if (img) {
    // object-fit: cover, anchored at the top (faces are near the top of these photos).
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, x - w / 2, y - r, w, h);
  } else {
    const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
    ctx.fillStyle = TEXT;
    ctx.font = `700 ${Math.round(size * 0.36)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, x, y + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = Math.max(3, size * 0.045);
  ctx.stroke();
}

/** Text wrapped to ``maxWidth``, at most ``maxLines`` lines (the last one shortened with "…"),
 * drawn centred from ``y`` down. Returns the y below the last line. */
export function wrapCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
): number {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = shown[maxLines - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    shown[maxLines - 1] = `${last}…`;
  }
  ctx.textAlign = "center";
  shown.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + shown.length * lineHeight;
}

/** The largest font size (down to ``min``) at which ``text`` fits in ``maxWidth``. */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, maxWidth: number): number {
  for (let size = max; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  ctx.font = `${weight} ${min}px ${FONT}`;
  return min;
}

export function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), "image/png"),
  );
}
