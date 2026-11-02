// Upcoming UFC fights as a broadcast-style ticker across the top of the predictor. It scrolls
// on its own, slows down under the mouse, and can be scrolled by hand (trackpad, mouse wheel
// or swipe) in either direction without ever reaching an end. Clicking a fight loads it.

import "./Upcoming.css";

import { Fragment, useEffect, useRef } from "react";

import { type Bout, cardDate, eventShort, type upcomingCards } from "./upcomingCards";

type Cards = ReturnType<typeof upcomingCards>;

const SPEED = 45; // px per second
const HOVER_SPEED = 10; // px per second while the pointer is over the ticker
const COPIES = 3; // the content is repeated, and scrolling wraps by one copy's width

const surname = (name: string) => name.split(" ").at(-1) ?? name;
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Who the model favours, as "Suarez 62%". */
function pick(b: Bout): string | null {
  if (b.pModel === null) return null;
  return b.pModel >= 0.5 ? `${surname(b.a_name)} ${pct(b.pModel)}` : `${surname(b.b_name)} ${pct(1 - b.pModel)}`;
}

export function UpcomingTicker({ cards, onPick }: { cards: Cards; onPick: (a: string, b: string) => void }) {
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const slow = useRef(false);

  useEffect(() => {
    const win = view.current;
    const content = track.current;
    if (!win || !content) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const period = () => content.scrollWidth / COPIES;
    // Keep the position inside the middle copy, so there's always content either side.
    const wrap = (x: number) => {
      const p = period();
      if (p <= 0) return x;
      if (x < p) return x + p;
      if (x >= 2 * p) return x - p;
      return x;
    };
    let pos = period();
    win.scrollLeft = pos;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!still) pos += (slow.current ? HOVER_SPEED : SPEED) * dt;
      pos = wrap(pos);
      win.scrollLeft = pos;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Manual scrolling (trackpad, swipe): pick up wherever the user left it.
    const onScroll = () => {
      if (Math.abs(win.scrollLeft - pos) > 2) pos = wrap(win.scrollLeft);
    };
    // A plain mouse wheel only scrolls vertically: turn it sideways while over the ticker.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      pos = wrap(pos + e.deltaY);
      win.scrollLeft = pos;
    };
    win.addEventListener("scroll", onScroll, { passive: true });
    win.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      win.removeEventListener("scroll", onScroll);
      win.removeEventListener("wheel", onWheel);
    };
  }, [cards]);

  if (!cards.length) return null;

  const items = (copy: number) =>
    cards.map((c) => (
      <Fragment key={`${copy}-${c.date}`}>
        <span className="ticker-event" title={[c.name, c.city].filter(Boolean).join(" · ")}>
          {eventShort(c.name) && <b>{eventShort(c.name)}</b>}
          {cardDate(c.date)}
        </span>
        {c.bouts.map((b) =>
          b.fa && b.fb ? (
            <button
              key={`${b.a_name}-${b.b_name}`}
              type="button"
              className="ticker-fight"
              tabIndex={copy === 1 ? 0 : -1}
              onClick={() => onPick(b.a!, b.b!)}
            >
              {surname(b.a_name)} <span className="ticker-vs">vs</span> {surname(b.b_name)}
              <span className="ticker-pick">{pick(b)}</span>
            </button>
          ) : (
            <span key={`${b.a_name}-${b.b_name}`} className="ticker-fight ticker-off" title="UFC debut: not enough data">
              {surname(b.a_name)} <span className="ticker-vs">vs</span> {surname(b.b_name)}
            </span>
          ),
        )}
      </Fragment>
    ));

  return (
    <div className="ticker">
      <div className="ticker-label">Upcoming</div>
      <div
        ref={view}
        className="ticker-window"
        onPointerEnter={() => (slow.current = true)}
        onPointerLeave={() => (slow.current = false)}
      >
        <div ref={track} className="ticker-track">
          {Array.from({ length: COPIES }, (_, copy) => (
            <span key={copy} className="ticker-copy" aria-hidden={copy !== 1}>
              {items(copy)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
