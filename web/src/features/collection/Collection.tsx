// The collection on a player's profile: every card their right calls have earned. Tap one to see
// it up close, flip it and, on your own, share it.

import "./Collection.css";

import { Button, Group, Modal, Paper, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useMemo, useRef, useState } from "react";

import type { PastPick } from "../../backend";
import { useMmaMath, usePredictor } from "../../data/client";
import { FighterTradingCard } from "../predictor/FighterTradingCard";
import { recentResults } from "../predictor/model";
import { captureCards } from "../share/captureCards";
import { fighterImage } from "../share/fighterImage";
import { ShareButton } from "../share/ShareButton";
import { byShinyThenElo, type EarnedCard, earnedCards } from "./earned";

const SHOWN = 12; // cards before "Show all"

export const pct = (chance: number) => `${Math.round(chance * 100)}%`;
const surname = (name: string) => name.split(" ").at(-1)!;

/** How a card was earned, in a line. */
export function earnedLine(card: EarnedCard, who: string) {
  const event = card.eventName.split(":")[0];
  return card.shiny && card.chance !== null
    ? `${who} called ${surname(card.name)} at ${pct(card.chance)} with the bookies · ${event}`
    : `${who} called ${surname(card.name)} · ${event}`;
}

/** The back of a card: what you see before it's opened, and in an empty collection. */
export function CardBack({ shiny }: { shiny?: boolean }) {
  return (
    <div className="card-back" data-shiny={shiny || undefined}>
      <div className="card-back-inner">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
      </div>
    </div>
  );
}

/** A fighter who isn't in the predictor's data yet (their first UFC fight): a simple card. */
export function DebutCard({ card }: { card: EarnedCard }) {
  return (
    <div className="debut-card" data-shiny={card.shiny || undefined}>
      <span className="debut-card-initials">{card.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
      <span className="debut-card-name">{card.name}</span>
      <span className="debut-card-note">UFC debut</span>
    </div>
  );
}

export function CardCollection({ history, isMe, displayName }: { history: PastPick[]; isMe: boolean; displayName: string }) {
  const fighters = usePredictor().data?.fighters;
  const cards = useMemo(() => {
    const elo = new Map(fighters?.map((f) => [f.id, f.elo]));
    return byShinyThenElo(earnedCards(history), (id) => elo.get(id));
  }, [history, fighters]);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<EarnedCard | null>(null);
  if (!cards.length && !isMe) return null;
  const shiny = cards.filter((c) => c.shiny).length;
  const shown = all ? cards : cards.slice(0, SHOWN);

  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Group justify="space-between" align="baseline" mb="sm" gap="xs">
        <Title order={4}>Card collection</Title>
        {cards.length > 0 && (
          <Text size="sm" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
            {cards.length} {cards.length === 1 ? "card" : "cards"}
            {shiny > 0 && (
              <>
                {" · "}
                <span className="shiny-text">{shiny} shiny</span>
              </>
            )}
          </Text>
        )}
      </Group>

      {!cards.length ? (
        <Group wrap="nowrap" gap="md" align="center">
          <div className="collection-empty" aria-hidden>
            <CardBack />
            <CardBack />
            <CardBack shiny />
          </div>
          <Text size="sm" c="dimmed">
            Call a winner on the main card and you earn their trading card. Call an underdog and it comes out shiny.
          </Text>
        </Group>
      ) : (
        <div className="collection-grid">
          {shown.map((c) => (
            <UnstyledButton key={c.fighter} className="collection-slot" onClick={() => setOpen(c)} aria-label={`${c.name}${c.shiny ? ", shiny" : ""}: open card`}>
              <FighterTradingCard id={c.fighter} foil={c.shiny} still fallback={<DebutCard card={c} />} />
              {c.times > 1 && <span className="collection-times">×{c.times}</span>}
            </UnstyledButton>
          ))}
        </div>
      )}
      {cards.length > SHOWN && (
        <Button size="xs" variant="subtle" color="gray" mt="xs" fullWidth onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${cards.length}`}
        </Button>
      )}

      <Modal opened={!!open} onClose={() => setOpen(null)} centered size={380} title={open?.shiny ? "Shiny card" : "Card"}>
        {open && <CardCloseUp card={open} isMe={isMe} displayName={displayName} />}
      </Modal>
    </Paper>
  );
}

function CardCloseUp({ card, isMe, displayName }: { card: EarnedCard; isMe: boolean; displayName: string }) {
  const root = useRef<HTMLDivElement>(null);
  const fighter = usePredictor().data?.fighters.find((f) => f.id === card.fighter);
  const mma = useMmaMath().data;
  const line = earnedLine(card, isMe ? "You" : displayName);
  return (
    <Stack gap="sm" ref={root}>
      <FighterTradingCard id={card.fighter} foil={card.shiny} fallback={<DebutCard card={card} />} />
      <Text size="sm" c="dimmed" ta="center">
        {line}
        {card.times > 1 && ` · called right ${card.times} times`}
      </Text>
      {isMe && fighter && (
        <ShareButton
          label="Share this card"
          fullWidth
          make={async () => {
            const cards = await captureCards(root.current!, 1);
            return fighterImage({
              heading: card.shiny ? "Shiny card" : "Card earned",
              name: fighter.name,
              photo: fighter.image?.url,
              detail: card.shiny && card.chance !== null ? `Called at ${pct(card.chance)} with the bookies` : "Called it right",
              record: `${fighter.record.wins}-${fighter.record.losses}-${fighter.record.draws}`,
              elo: fighter.elo,
              recent: mma ? recentResults(mma, card.fighter).map((r) => r.result) : [],
              next: null,
              card: cards?.[0],
            });
          }}
          fileName={`card-${card.fighter}`}
          text={
            card.shiny && card.chance !== null
              ? `I called ${surname(card.name)} at ${pct(card.chance)} and pulled a shiny card. Think you can do better?`
              : `I called ${surname(card.name)} and earned the card. Think you can do better?`
          }
          url={`${window.location.origin}${import.meta.env.BASE_URL}u/${encodeURIComponent(displayName)}`}
        />
      )}
    </Stack>
  );
}
