// A collection that doesn't take over the page: Legendary, Epic and shiny cards stay on show, and
// the Rares and Commons sit in a pile each until it's tapped. Opening a pile deals its cards out
// to their places; stacking it gathers them back. The empty pile stays put while it's open, so
// the cards have somewhere to go back to.

import "./Collection.css";

import { UnstyledButton } from "@mantine/core";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import type { Rarity } from "../../backend";
import { rarityLabel } from "./pulls";

export function RarityPill({ rarity }: { rarity: Rarity }) {
  return (
    <span className="rarity-pill" data-rarity={rarity}>
      {rarityLabel(rarity)}
    </span>
  );
}

export interface StackCard {
  key: string;
  rarity: Rarity;
  shiny?: boolean; // always on show, whatever its rarity
  label: string; // for screen readers
  card: ReactNode; // the thumbnail
  extra?: ReactNode; // drawn over the corner, e.g. "×2"
  onOpen: () => void;
}

const PILED: Rarity[] = ["rare", "common"];
const DEAL_MS = 460;
const GATHER_MS = 340;
const SLIDE_MS = 300;
const SMOOTH = "cubic-bezier(0.22, 0.8, 0.3, 1)";

const noMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The pieces of an open pile, found in the page. */
function findPile(root: HTMLElement, rarity: Rarity) {
  const pile = root.querySelector<HTMLElement>(`.card-pile[data-rarity="${rarity}"]`);
  const section = root.querySelector<HTMLElement>(`.card-pile-open[data-rarity="${rarity}"]`);
  if (!pile || !section) return null;
  return { pile, section, head: section.querySelector<HTMLElement>(".card-pile-open-head")!, cards: [...section.querySelectorAll<HTMLElement>(".collection-slot")] };
}

/** Where a card sits when it's on the pile, relative to its own place. */
function onPile(card: HTMLElement, pile: DOMRect, i: number) {
  const here = card.getBoundingClientRect();
  return `translate(${pile.left - here.left}px, ${pile.top - here.top}px) rotate(${((i % 3) - 1) * 5}deg)`;
}

/** The section's height going between nothing and its full size, moving the page below with it. */
function slide(section: HTMLElement, opening: boolean, options: KeyframeAnimationOptions) {
  const closed = { height: "0px", marginTop: "0px" };
  const full = { height: `${section.offsetHeight}px`, marginTop: getComputedStyle(section).marginTop };
  return section.animate(opening ? [closed, full] : [full, closed], options);
}

function Slot({ card }: { card: StackCard }) {
  return (
    <UnstyledButton className="collection-slot pull-slot" data-rarity={card.rarity} onClick={card.onOpen} aria-label={`${card.label}: open card`}>
      {card.card}
      <RarityPill rarity={card.rarity} />
      {card.extra}
    </UnstyledButton>
  );
}

/** ``cards`` in the order to show them: the first of each pile is the one on top. */
export function CardStacks({ cards }: { cards: StackCard[] }) {
  const [open, setOpen] = useState<Rarity[]>([]);
  const [gathering, setGathering] = useState<Rarity | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dealing = useRef<Rarity | null>(null);

  // Runs once the opened cards are in the page, before it's painted.
  useLayoutEffect(() => {
    const rarity = dealing.current;
    dealing.current = null;
    if (!rarity || !root.current || noMotion()) return;
    const found = findPile(root.current, rarity);
    if (!found) return;
    const pile = found.pile.getBoundingClientRect();
    slide(found.section, true, { duration: SLIDE_MS, easing: SMOOTH });
    found.head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 120, fill: "backwards" });
    found.cards.forEach((card, i) =>
      card.animate([{ transform: onPile(card, pile, i), opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: "none", opacity: 1 }], {
        duration: DEAL_MS,
        delay: Math.min(i * 24, 260),
        easing: SMOOTH,
        fill: "backwards",
      }),
    );
  }, [open]);

  const deal = (rarity: Rarity) => {
    dealing.current = rarity;
    setOpen((o) => [...o, rarity]);
  };

  const gather = (rarity: Rarity) => {
    if (gathering) return;
    const shut = () => {
      setOpen((o) => o.filter((x) => x !== rarity));
      setGathering(null);
    };
    const found = root.current && findPile(root.current, rarity);
    if (!found || noMotion()) return shut();
    found.cards.forEach((c) => c.getAnimations().forEach((a) => a.finish())); // tapped mid-deal
    found.section.getAnimations().forEach((a) => a.finish());
    // From far down a long pile, bring the pile back into view.
    found.pile.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setGathering(rarity);
    const pile = found.pile.getBoundingClientRect();
    const last = found.cards.length - 1;
    const moves = found.cards.map((card, i) =>
      card.animate([{ transform: "none", opacity: 1 }, { opacity: 1, offset: 0.82 }, { transform: onPile(card, pile, i), opacity: 0 }], {
        duration: GATHER_MS,
        delay: Math.min((last - i) * 14, 160),
        easing: "cubic-bezier(0.5, 0, 0.3, 1)",
        fill: "both",
      }),
    );
    found.head.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "both" });
    moves.push(slide(found.section, false, { duration: SLIDE_MS, delay: 150, easing: SMOOTH, fill: "both" }));
    void Promise.allSettled(moves.map((m) => m.finished)).then(shut);
  };

  const piles = PILED.map((rarity) => ({ rarity, cards: cards.filter((c) => c.rarity === rarity && !c.shiny) })).filter((p) => p.cards.length > 1);
  const piled = new Set(piles.flatMap((p) => p.cards.map((c) => c.key)));
  const loose = cards.filter((c) => !piled.has(c.key));

  return (
    <div ref={root}>
      <div className="collection-grid">
        {loose.map((c) => (
          <Slot key={c.key} card={c} />
        ))}
        {piles.map((p) => {
          const isOpen = open.includes(p.rarity);
          return (
            <UnstyledButton
              key={p.rarity}
              className="card-pile"
              data-rarity={p.rarity}
              data-open={(isOpen && gathering !== p.rarity) || undefined}
              onClick={() => (isOpen ? gather(p.rarity) : deal(p.rarity))}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Stack" : "Show"} ${p.cards.length} ${rarityLabel(p.rarity)} cards`}
            >
              <span className="card-pile-under" aria-hidden />
              <span className="card-pile-under" aria-hidden />
              <div className="card-pile-top">{p.cards[0]!.card}</div>
              <RarityPill rarity={p.rarity} />
              <span className="card-pile-count">{isOpen ? "Stack" : `${p.cards.length} cards`}</span>
            </UnstyledButton>
          );
        })}
      </div>
      {PILED.filter((r) => open.includes(r)).map((rarity) => {
        const pile = piles.find((p) => p.rarity === rarity);
        if (!pile) return null;
        return (
          <div key={rarity} className="card-pile-open" data-rarity={rarity}>
            <div className="card-pile-open-head">
              <span className="rarity-count" data-rarity={rarity}>
                {pile.cards.length} {rarityLabel(rarity)}
              </span>
              <UnstyledButton className="pickem-method" onClick={() => gather(rarity)}>
                Stack them
              </UnstyledButton>
            </div>
            <div className="collection-grid">
              {pile.cards.map((c) => (
                <Slot key={c.key} card={c} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
