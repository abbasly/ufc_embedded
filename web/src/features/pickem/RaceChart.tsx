// The race between players over the finished cards: their place on the board after each card,
// one line each (a bump chart). The top five at the latest card, plus you and the model when
// they're further down, where everyone below fifth shares one band at the bottom. Grey lines, you
// in red, the model dashed; hovering a line picks it out and says where it stood.

import "./RaceChart.css";

import { Text, UnstyledButton } from "@mantine/core";
import { useEffect, useId, useMemo, useState } from "react";

import { PlayerAvatar } from "../../auth/PlayerAvatar";
import type { RaceScore } from "../../backend";
import { type Race, race } from "./race";
import { MODEL_PLAYER } from "./scoring";

const TOP = 5;
const MAX_CARDS = 8;
const ROW = 30; // px between places
const PAD_TOP = 12;
const LEFT = 26; // the place numbers
const AXIS = 40; // card names under the plot
const LABEL_W = 150; // the names at the end of the lines (at most)

const cardName = (name: string) => (name.split(":")[0] ?? name).replace("UFC Fight Night", "Fight Night").trim();
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

interface Props {
  scores: RaceScore[];
  players?: string[]; // the board's players (a league, friends); everyone if left out
  me?: string;
  withModel?: boolean;
}

export function RaceChart({ scores, players, me, withModel }: Props) {
  const always = [me, withModel ? MODEL_PLAYER : undefined].filter((n): n is string => !!n);
  const full = useMemo(() => race(scores, { players, top: TOP, always }), [scores, players, me, withModel]);
  // The latest cards only, on a wide history.
  const shown: Race = useMemo(() => {
    const from = Math.max(0, full.cards.length - MAX_CARDS);
    return { ...full, cards: full.cards.slice(from), lines: full.lines.map((l) => ({ ...l, steps: l.steps.slice(from) })) };
  }, [full]);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const clip = useId().replace(/:/g, "");
  const [seen, setSeen] = useState(false);
  const [active, setActive] = useState<{ name: string; card: number } | null>(null);

  // Draw the lines in once the chart is on screen.
  useEffect(() => {
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return setSeen(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, el]);

  if (shown.cards.length < 2)
    return (
      <Text size="sm" c="dimmed">
        The race starts once two cards are done: see who climbs and who drops, card by card.
      </Text>
    );

  const n = shown.cards.length;
  const outside = shown.lines.some((l) => l.steps.some((s) => s.position > TOP));
  const rows = TOP + (outside ? 1 : 0);
  const labelW = Math.min(LABEL_W, Math.max(96, width * 0.36));
  const plotW = Math.max(60, width - LEFT - labelW - 14);
  const x = (i: number) => LEFT + (i * plotW) / (n - 1);
  const yRow = (row: number) => PAD_TOP + (row - 1) * ROW;
  const y = (position: number) => yRow(Math.min(position, TOP + 1));
  // Lines that end below the top five share the band: their names stack under it.
  const endsBelow = shown.lines.filter((l) => l.steps.at(-1)!.position > TOP).map((l) => l.displayName);
  const labelY = (name: string, position: number) => (position > TOP ? yRow(TOP + 1) + endsBelow.indexOf(name) * 20 : y(position));
  const plotH = yRow(rows) + Math.max(0, endsBelow.length - 1) * 20;
  const height = plotH + 10 + AXIS;
  const roomy = plotW / (n - 1) >= 58; // room for every card's name under the axis
  // The first name starts at its tick (centred it would run off the left edge); with sparse
  // names, the last one ends at its tick.
  const anchor = (i: number) => (i === 0 ? "start" : i === n - 1 && !roomy ? "end" : "middle");

  const kind = (name: string) => (name === me ? "me" : name === MODEL_PLAYER ? "model" : "other");
  const curve = (pts: [number, number][]) =>
    pts.map(([px, py], i) => {
      if (!i) return `M${px},${py}`;
      const [qx, qy] = pts[i - 1]!;
      const mid = (px - qx) / 2;
      return `C${qx + mid},${qy} ${px - mid},${py} ${px},${py}`;
    }).join(" ");

  const focus = active ? shown.lines.find((l) => l.displayName === active.name) : null;
  const step = focus ? focus.steps[active!.card] : null;
  const leader = shown.lines[0]!;

  return (
    <div className="race" onMouseLeave={() => setActive(null)}>
      <div ref={setEl} className="race-plot" style={{ height }}>
        {width > 0 && (
          <>
            <svg width={width} height={height} role="img" aria-label={`The race over the last ${n} cards: ${shown.lines.map((l) => `${l.displayName} #${l.steps.at(-1)!.place}`).join(", ")}`}>
              <defs>
                <clipPath id={clip}>
                  <rect x={0} y={0} width={width} height={height} className="race-reveal" data-seen={seen || undefined} />
                </clipPath>
              </defs>
              {/* Places down the side, a quiet rule per place, the card ticks along the bottom. */}
              {Array.from({ length: rows }, (_, i) => (
                <g key={i}>
                  <line x1={LEFT} x2={LEFT + plotW} y1={yRow(i + 1)} y2={yRow(i + 1)} className="race-rule" />
                  <text x={LEFT - 10} y={yRow(i + 1) + 4} textAnchor="end" className="race-place">
                    {i < TOP ? i + 1 : `${TOP + 1}+`}
                  </text>
                </g>
              ))}
              {shown.cards.map((c, i) => (
                <g key={c.eventId} className="race-card" data-on={active?.card === i || undefined}>
                  <line x1={x(i)} x2={x(i)} y1={PAD_TOP - 6} y2={plotH + 4} className="race-tick" />
                  {(roomy || i === 0 || i === n - 1 || active?.card === i) && (
                    <>
                      <text x={x(i)} y={plotH + 20} textAnchor={anchor(i)} className="race-card-name">
                        {cardName(c.eventName)}
                      </text>
                      <text x={x(i)} y={plotH + 33} textAnchor={anchor(i)} className="race-card-date">
                        {day(c.startsOn)}
                      </text>
                    </>
                  )}
                </g>
              ))}
              <g clipPath={`url(#${clip})`}>
                {/* Others first, so you and the model are drawn on top. */}
                {[...shown.lines].sort((a, b) => Number(kind(a.displayName) !== "other") - Number(kind(b.displayName) !== "other")).map((l) => {
                  const pts = l.steps.map((s, i) => [x(i), y(s.position)] as [number, number]);
                  const dim = active && active.name !== l.displayName;
                  return (
                    <g key={l.displayName} className="race-line" data-kind={kind(l.displayName)} data-dim={dim || undefined} data-on={active?.name === l.displayName || undefined}>
                      <path d={curve(pts)} className="race-path" />
                      <path d={curve(pts)} className="race-hit" onMouseEnter={() => setActive({ name: l.displayName, card: n - 1 })} />
                      {pts.map(([px, py], i) => (
                        <circle
                          key={i}
                          cx={px}
                          cy={py}
                          r={active?.name === l.displayName && active.card === i ? 5 : 3.5}
                          className="race-dot"
                          onMouseEnter={() => setActive({ name: l.displayName, card: i })}
                        />
                      ))}
                    </g>
                  );
                })}
              </g>
            </svg>
            {/* The names at the end of the lines. */}
            {shown.lines.map((l) => {
              const last = l.steps.at(-1)!;
              return (
                <UnstyledButton
                  key={l.displayName}
                  className="race-name"
                  data-kind={kind(l.displayName)}
                  data-dim={(active && active.name !== l.displayName) || undefined}
                  data-seen={seen || undefined}
                  style={{ left: x(n - 1) + 10, top: labelY(l.displayName, last.position) - 10, width: labelW }}
                  onMouseEnter={() => setActive({ name: l.displayName, card: n - 1 })}
                  onFocus={() => setActive({ name: l.displayName, card: n - 1 })}
                  onBlur={() => setActive(null)}
                  aria-label={`${l.displayName}: #${last.place}, ${last.total} points`}
                >
                  <PlayerAvatar name={l.displayName} avatar={l.avatar} size={18} />
                  <span className="race-name-text">{l.displayName}</span>
                  <span className="race-name-pts">{last.total}</span>
                </UnstyledButton>
              );
            })}
          </>
        )}
      </div>
      <Text size="xs" c="dimmed" className="race-info">
        {focus && step ? (
          <>
            <b className="race-info-name">{focus.displayName}</b> after {cardName(shown.cards[active!.card]!.eventName)}: #{step.place}
            {step.tied ? " (tied)" : ""} · {step.total} pts
            {step.gained > 0 ? ` (+${step.gained} on the card)` : " (no points on the card)"}
          </>
        ) : (
          <>
            {leader.displayName} leads with {leader.steps.at(-1)!.total} pts after {full.cards.length} cards · {full.players} players · hover a line to follow it
          </>
        )}
      </Text>
    </div>
  );
}
