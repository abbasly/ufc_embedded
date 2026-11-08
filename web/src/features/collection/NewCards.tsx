// Newly earned cards, opened one at a time: a banner says how many are waiting, and each card
// starts face down until you tap it. Which ones you've opened is remembered in this browser.

import "./Collection.css";

import { Button, Group, Modal, Paper, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { FighterTradingCard } from "../predictor/FighterTradingCard";
import { CardBack, DebutCard, earnedLine } from "./Collection";
import { cardKey, type EarnedCard, earnedCards, readOpened, unopened, useMyHistory, writeOpened } from "./earned";

const TURN_MS = 260; // half a turn: the back goes edge-on, then the face comes round

export function NewCards() {
  const { user } = useAuth();
  const history = useMyHistory();
  const cards = useMemo(() => earnedCards(history.data ?? []), [history.data]);
  // Set when the banner is opened, so the pack doesn't shrink while it's being opened.
  const [pack, setPack] = useState<EarnedCard[] | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (user && loadedFor !== user.id) {
    setLoadedFor(user.id);
    setOpened(readOpened(user.id));
  }
  if (!user) return null;

  const waiting = unopened(cards, opened);
  const open = (card: EarnedCard) =>
    setOpened((seen) => {
      const next = new Set(seen).add(cardKey(card));
      writeOpened(user.id, next);
      return next;
    });

  return (
    <>
      {waiting.length > 0 && (
        <Paper p="sm" radius="md" className="pickem-board new-cards-banner">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Group wrap="nowrap" gap="sm" style={{ minWidth: 0 }}>
              <div className="new-cards-fan" aria-hidden>
                <CardBack />
                <CardBack shiny={waiting.some((c) => c.shiny)} />
              </div>
              <div style={{ minWidth: 0 }}>
                <Text fw={700} lh={1.25}>
                  {waiting.length === 1 ? "You earned a new card" : `You earned ${waiting.length} new cards`}
                </Text>
                <Text size="xs" c="dimmed">
                  From the fights you called right
                </Text>
              </div>
            </Group>
            <Button size="sm" color="yellow" variant="filled" c="dark" onClick={() => setPack(waiting)} style={{ flexShrink: 0 }}>
              Open
            </Button>
          </Group>
        </Paper>
      )}
      <Modal opened={!!pack} onClose={() => setPack(null)} centered size={380} withCloseButton={false} overlayProps={{ backgroundOpacity: 0.8, blur: 6 }} classNames={{ content: "reveal-modal" }}>
        {pack && <Reveal pack={pack} onOpen={open} onDone={() => setPack(null)} />}
      </Modal>
    </>
  );
}

function Reveal({ pack, onOpen, onDone }: { pack: EarnedCard[]; onOpen: (c: EarnedCard) => void; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"down" | "turning" | "up">("down");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const card = pack[index]!;
  const last = index === pack.length - 1;

  const turn = () => {
    if (phase !== "down") return;
    setPhase("turning");
    timer.current = window.setTimeout(() => {
      setPhase("up");
      onOpen(card);
    }, TURN_MS);
  };
  const next = () => {
    if (last) return onDone();
    setIndex((i) => i + 1);
    setPhase("down");
  };

  const up = phase === "up";
  return (
    <Stack gap="md" align="center">
      <Text size="xs" fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.12em" }}>
        Card {index + 1} of {pack.length}
      </Text>
      <div className="reveal-stage" data-shiny={(up && card.shiny) || undefined}>
        {up && card.shiny && <div className="reveal-burst" aria-hidden />}
        <div className="reveal-turn" data-turning={phase === "turning" || undefined} key={`${index}-${up}`}>
          {up ? (
            <FighterTradingCard id={card.fighter} foil={card.shiny} fallback={<DebutCard card={card} />} />
          ) : (
            <button type="button" className="reveal-back" onClick={turn} aria-label="Turn the card over">
              <CardBack />
              <span className="reveal-tap">Tap to open</span>
            </button>
          )}
        </div>
      </div>
      <div className="reveal-caption" data-up={up || undefined}>
        {up && card.shiny && <div className="reveal-shiny shiny-text">Shiny!</div>}
        <Text fw={800} fz="lg" ta="center" lh={1.25}>
          {up ? card.name : " "}
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {up ? earnedLine(card, "You") : " "}
        </Text>
      </div>
      <Button fullWidth color="yellow" c="dark" disabled={!up} onClick={next}>
        {last ? "Add to my collection" : "Next card"}
      </Button>
    </Stack>
  );
}
