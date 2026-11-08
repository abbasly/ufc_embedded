// A collection that doesn't take over the page: Legendary, Epic and shiny cards stay on show, and
// the Rares and Commons sit in a pile each until it's tapped.

import "./Collection.css";

import { UnstyledButton } from "@mantine/core";
import { type ReactNode, useState } from "react";

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
  const toggle = (r: Rarity) => setOpen((o) => (o.includes(r) ? o.filter((x) => x !== r) : [...o, r]));
  const piles = PILED.map((rarity) => ({ rarity, cards: cards.filter((c) => c.rarity === rarity && !c.shiny) })).filter((p) => p.cards.length > 1);
  const piled = new Set(piles.flatMap((p) => p.cards.map((c) => c.key)));
  const loose = cards.filter((c) => !piled.has(c.key));
  const closed = piles.filter((p) => !open.includes(p.rarity));
  const opened = piles.filter((p) => open.includes(p.rarity));

  return (
    <>
      {loose.length + closed.length > 0 && (
        <div className="collection-grid">
          {loose.map((c) => (
            <Slot key={c.key} card={c} />
          ))}
          {closed.map((p) => (
            <UnstyledButton key={p.rarity} className="card-pile" data-rarity={p.rarity} onClick={() => toggle(p.rarity)} aria-expanded={false} aria-label={`Show ${p.cards.length} ${rarityLabel(p.rarity)} cards`}>
              <span className="card-pile-under" aria-hidden />
              <span className="card-pile-under" aria-hidden />
              <div className="card-pile-top">{p.cards[0]!.card}</div>
              <RarityPill rarity={p.rarity} />
              <span className="card-pile-count">{p.cards.length} cards</span>
            </UnstyledButton>
          ))}
        </div>
      )}
      {opened.map((p) => (
        <div key={p.rarity} className="card-pile-open" data-rarity={p.rarity}>
          <div className="card-pile-open-head">
            <span className="rarity-count" data-rarity={p.rarity}>
              {p.cards.length} {rarityLabel(p.rarity)}
            </span>
            <UnstyledButton className="pickem-method" onClick={() => toggle(p.rarity)} aria-expanded>
              Stack them
            </UnstyledButton>
          </div>
          <div className="collection-grid">
            {p.cards.map((c) => (
              <Slot key={c.key} card={c} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
