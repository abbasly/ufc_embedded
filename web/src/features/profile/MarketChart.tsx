// The model's page: its winners against the betting market's, card by card. Two bars per card
// (the share of fights each called right), our logo riding on ours and a betting chip on the
// market's. The bars grow in, card after card, when the chart scrolls into view.

import "./MarketChart.css";

import { Group, Paper, Text, Tooltip, VisuallyHidden } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import type { PastPick } from "../../backend";
import { type CardDuel, historyDuel } from "../pickem/market";

const MAX_CARDS = 10;
const LOGO = `${import.meta.env.BASE_URL}favicon.svg`;
const pct = (right: number, of: number) => Math.round((100 * right) / of);
const shortName = (name: string) => name.split(":")[0]!.replace("UFC Fight Night", "Fight Night");
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The market's mark: a betting chip. */
export function MarketChip({ size = 16 }: { size?: number }) {
  return (
    <svg className="market-chip" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="var(--market)" />
      <g fill="#fff" opacity="0.92">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect key={a} x="10.4" y="1" width="3.2" height="4.2" rx="0.8" transform={`rotate(${a} 12 12)`} />
        ))}
      </g>
      <circle cx="12" cy="12" r="6" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2.2" fill="#fff" opacity="0.92" />
    </svg>
  );
}

/** Our mark: the logo. */
export function ModelLogo({ size = 16 }: { size?: number }) {
  return <img className="market-logo" src={LOGO} width={size} height={size} alt="" />;
}

/** True once the element has been on screen (so the animation plays where it's seen). */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setSeen(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

function Bar({ right, of, who, seen, delay }: { right: number; of: number; who: "model" | "market"; seen: boolean; delay: number }) {
  return (
    <div className="market-bar-slot">
      <div className="market-bar" data-who={who} style={{ height: seen ? `${(100 * right) / of}%` : 0, transitionDelay: `${delay}ms` }}>
        <span className="market-bar-icon">{who === "model" ? <ModelLogo size={22} /> : <MarketChip size={22} />}</span>
      </div>
    </div>
  );
}

function CardBars({ card, index, seen }: { card: CardDuel; index: number; seen: boolean }) {
  const label = (
    <div>
      <b>{shortName(card.eventName)}</b> · {day(card.startsOn)}
      <br />
      The model: {card.model}/{card.fights} ({pct(card.model, card.fights)}%)
      <br />
      The market: {card.market}/{card.fights} ({pct(card.market, card.fights)}%)
      {card.disagreed > 0 && (
        <>
          <br />
          They split on {card.disagreed}
        </>
      )}
    </div>
  );
  const delay = index * 90;
  return (
    <Tooltip label={label} withArrow multiline position="top">
      <div className="market-card" tabIndex={0}>
        <div className="market-bars">
          <Bar right={card.model} of={card.fights} who="model" seen={seen} delay={delay} />
          <Bar right={card.market} of={card.fights} who="market" seen={seen} delay={delay + 60} />
        </div>
        <Text className="market-card-name" size="xs" c="dimmed" truncate>
          {shortName(card.eventName)}
        </Text>
        <Text className="market-card-name" size="xs" c="dimmed" mt={0}>
          {day(card.startsOn)}
        </Text>
      </div>
    </Tooltip>
  );
}

export function MarketChart({ history }: { history: PastPick[] }) {
  const { total, cards } = historyDuel(history);
  const shown = cards.slice(0, MAX_CARDS).reverse(); // oldest on the left
  const [ref, seen] = useSeen<HTMLDivElement>();
  if (!total.fights) return null;
  const lead = total.model - total.market;
  return (
    <Paper p="lg" radius="md" className="pickem-board market-chart" style={{ "--model": "#e03131", "--market": "#5c7cfa" } as React.CSSProperties}>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md" mb="md">
        <div>
          <Text fw={800} fz="lg">
            The model vs the betting market
          </Text>
          <Text size="sm" c="dimmed">
            Winners called right on each card against the bookmakers' favourite, on every fight with odds (prelims too).
          </Text>
        </div>
        <Text size="sm" ta={{ base: "left", sm: "right" }} style={{ fontVariantNumeric: "tabular-nums" }}>
          <b>
            {total.model}–{total.market}
          </b>{" "}
          over {total.fights} fights
          <br />
          <Text span size="xs" c="dimmed">
            {lead > 0 ? `the model leads by ${lead}` : lead < 0 ? `the market leads by ${-lead}` : "level"} · split on {total.disagreed}
          </Text>
        </Text>
      </Group>

      <Group gap="lg" mb="sm">
        <Group gap={6}>
          <span className="market-swatch" data-who="model" />
          <ModelLogo size={18} />
          <Text size="xs">The model ({pct(total.model, total.fights)}%)</Text>
        </Group>
        <Group gap={6}>
          <span className="market-swatch" data-who="market" />
          <MarketChip size={18} />
          <Text size="xs">The market ({pct(total.market, total.fights)}%)</Text>
        </Group>
      </Group>

      <div className="market-plot" ref={ref}>
        <div className="market-grid" aria-hidden="true">
          {[100, 75, 50, 25, 0].map((v) => (
            <div key={v} className="market-gridline">
              <span>{v}%</span>
            </div>
          ))}
        </div>
        <div className="market-cards">
          {shown.map((c, i) => (
            <CardBars key={c.eventId} card={c} index={i} seen={seen} />
          ))}
        </div>
      </div>

      <VisuallyHidden>
        <table>
          <caption>Winners called right per card: the model vs the betting market</caption>
          <thead>
            <tr>
              <th>Card</th>
              <th>Fights</th>
              <th>The model</th>
              <th>The market</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.eventId}>
                <td>{c.eventName}</td>
                <td>{c.fights}</td>
                <td>{c.model}</td>
                <td>{c.market}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </Paper>
  );
}
