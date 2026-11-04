// Snapshots of the trading cards on the page, for share images: the front face of each card,
// exactly as visitors see it (frame, photo, Elo, moves), at a size that stays sharp.

import { toCanvas } from "html-to-image";

const CARD_HEIGHT = 540; // drawn at this height in the share image; captured at twice that

/** The front faces of the first ``count`` trading cards inside ``root``, or null if any is
 * missing or can't be captured (the share image then falls back to round photos). */
export async function captureCards(root: ParentNode, count: number): Promise<HTMLCanvasElement[] | null> {
  const faces = [...root.querySelectorAll<HTMLElement>(".flip-card .flip-face:not(.flip-back)")].slice(0, count);
  if (faces.length < count) return null;
  faces.forEach((f) => f.classList.add("card-capture")); // see TradingCard.css
  try {
    return await Promise.all(
      faces.map((face) =>
        toCanvas(face, {
          pixelRatio: Math.max(3, (CARD_HEIGHT * 2) / face.offsetHeight),
          // Leave out the hover shine (it follows the mouse) and the "tap to flip" hint, which
          // means nothing in a picture.
          filter: (node) => !(node instanceof HTMLElement && (node.classList.contains("hover-shine") || node.classList.contains("flip-hint"))),
        }),
      ),
    );
  } catch {
    return null;
  } finally {
    faces.forEach((f) => f.classList.remove("card-capture"));
  }
}
