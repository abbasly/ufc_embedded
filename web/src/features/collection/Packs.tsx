// Opening packs: a banner when some are waiting, then tear one open and turn its three cards over
// one at a time, best last. And the player's pulled cards, on their profile.

import "./Collection.css";

import { Button, Group, Modal, Paper, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import type { OwnedCard, PackCard, Rarity, UnopenedPack } from "../../backend";
import { useMmaMath, usePredictor } from "../../data/client";
import { FighterTradingCard } from "../predictor/FighterTradingCard";
import { recentResults } from "../predictor/model";
import { captureCards } from "../share/captureCards";
import { fighterImage } from "../share/fighterImage";
import { ShareButton } from "../share/ShareButton";
import { CardBack, DebutCard } from "./Collection";
import { byRarityThenElo, RARITIES, rarityLabel, REASON_LABEL, revealOrder, useMyPacks, useOpenPack, usePulledCards } from "./pulls";

const TEAR_MS = 750; // at least this long, so the tear plays out however fast the draw is
const TURN_MS = 260;
const SHOWN = 12;

export function RarityPill({ rarity }: { rarity: Rarity }) {
  return (
    <span className="rarity-pill" data-rarity={rarity}>
      {rarityLabel(rarity)}
    </span>
  );
}

function PackArt({ pack, tearing }: { pack?: UnopenedPack; tearing?: boolean }) {
  return (
    <div className="pack" data-tearing={tearing || undefined}>
      <div className="pack-top" />
      <div className="pack-body">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <span className="pack-name">Fight Pack</span>
        {pack && <span className="pack-note">{REASON_LABEL[pack.reason]}</span>}
      </div>
    </div>
  );
}

/** "You have 2 packs to open", and the opening itself. */
export function PacksBanner() {
  const packs = useMyPacks();
  const client = useQueryClient();
  // Fixed when opening starts, so the list doesn't change underneath it.
  const [queue, setQueue] = useState<UnopenedPack[] | null>(null);
  const waiting = packs.data ?? [];
  const close = () => {
    setQueue(null);
    void client.invalidateQueries({ queryKey: ["packs"] });
  };
  return (
    <>
      {waiting.length > 0 && (
        <Paper p="sm" radius="md" className="pickem-board packs-banner">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Group wrap="nowrap" gap="sm" style={{ minWidth: 0 }}>
              <div className="packs-banner-art" aria-hidden>
                <PackArt />
              </div>
              <div style={{ minWidth: 0 }}>
                <Text fw={700} lh={1.25}>
                  {waiting.length === 1 ? "You have a pack to open" : `You have ${waiting.length} packs to open`}
                </Text>
                <Text size="xs" c="dimmed">
                  3 random fighters in each
                </Text>
              </div>
            </Group>
            <Button size="sm" onClick={() => setQueue(waiting)} style={{ flexShrink: 0 }}>
              Open
            </Button>
          </Group>
        </Paper>
      )}
      <Modal opened={!!queue} onClose={close} centered size={380} withCloseButton={false} overlayProps={{ backgroundOpacity: 0.82, blur: 6 }} classNames={{ content: "reveal-modal" }}>
        {queue && <PackOpening queue={queue} onDone={close} />}
      </Modal>
    </>
  );
}

function PackOpening({ queue, onDone }: { queue: UnopenedPack[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<"sealed" | "tearing" | "cards" | "summary">("sealed");
  const [cards, setCards] = useState<PackCard[]>([]);
  const [at, setAt] = useState(0); // the card being turned over
  const [phase, setPhase] = useState<"down" | "turning" | "up">("down");
  const open = useOpenPack();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const pack = queue[index]!;
  const left = queue.length - index - 1;

  const tear = async () => {
    if (stage !== "sealed") return;
    setStage("tearing");
    try {
      const [drawn] = await Promise.all([open.mutateAsync(pack.id), new Promise((r) => setTimeout(r, TEAR_MS))]);
      setCards(revealOrder(drawn));
      setAt(0);
      setPhase("down");
      setStage("cards");
    } catch {
      setStage("sealed");
    }
  };

  const nextPack = () => {
    open.reset();
    setCards([]);
    setIndex((i) => i + 1);
    setStage("sealed");
  };

  if (stage === "sealed" || stage === "tearing") {
    return (
      <Stack gap="md" align="center">
        <Text size="xs" fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.12em" }}>
          Pack {index + 1} of {queue.length}
        </Text>
        <button type="button" className="pack-button" onClick={() => void tear()} disabled={stage === "tearing"} aria-label="Tear the pack open">
          <PackArt pack={pack} tearing={stage === "tearing"} />
        </button>
        <Text size="sm" c="dimmed" ta="center">
          {pack.eventName.split(":")[0]}
        </Text>
        {open.error ? (
          <Text size="sm" c="red.4" ta="center">
            Couldn't open it: {open.error.message}
          </Text>
        ) : (
          <Text fw={700}>{stage === "tearing" ? " " : "Tap to tear it open"}</Text>
        )}
      </Stack>
    );
  }

  if (stage === "summary") {
    return (
      <Stack gap="md" align="center">
        <Text size="xs" fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.12em" }}>
          Your pull
        </Text>
        <div className="pull-summary">
          {cards.map((c) => (
            <div key={c.slot} className="pull-slot" data-rarity={c.rarity}>
              <FighterTradingCard id={c.fighterId} still fallback={<DebutCard card={{ name: c.name, shiny: false }} />} />
              <RarityPill rarity={c.rarity} />
            </div>
          ))}
        </div>
        {left > 0 ? (
          <Button fullWidth onClick={nextPack}>
            Next pack ({left} left)
          </Button>
        ) : (
          <Button fullWidth onClick={onDone}>
            Add to my collection
          </Button>
        )}
      </Stack>
    );
  }

  const card = cards[at]!;
  const up = phase === "up";
  const last = at === cards.length - 1;
  const turn = () => {
    if (phase !== "down") return;
    setPhase("turning");
    timer.current = window.setTimeout(() => setPhase("up"), TURN_MS);
  };
  const advance = () => {
    if (last) return setStage("summary");
    setAt((i) => i + 1);
    setPhase("down");
  };
  return (
    <Stack gap="md" align="center">
      <Text size="xs" fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.12em" }}>
        Card {at + 1} of {cards.length}
      </Text>
      <div className="reveal-stage">
        {up && card.rarity !== "common" && <div className="pull-burst" data-rarity={card.rarity} aria-hidden />}
        <div className="reveal-turn" data-turning={phase === "turning" || undefined} key={`${at}-${up}`}>
          {up ? (
            <div className="pull-slot" data-rarity={card.rarity}>
              <FighterTradingCard id={card.fighterId} fallback={<DebutCard card={{ name: card.name, shiny: false }} />} />
            </div>
          ) : (
            <button type="button" className="reveal-back" onClick={turn} aria-label="Turn the card over">
              <CardBack />
              <span className="reveal-tap">Tap to turn</span>
            </button>
          )}
        </div>
      </div>
      <div className="reveal-caption" data-up={up || undefined}>
        <div className="pull-rarity" data-rarity={up ? card.rarity : undefined}>
          {up ? rarityLabel(card.rarity) : "\u00a0"}
        </div>
        <Text fw={800} fz="lg" ta="center" lh={1.25}>
          {up ? card.name : "\u00a0"}
        </Text>
      </div>
      <Button fullWidth disabled={!up} onClick={advance}>
        {last ? "See my pull" : "Next card"}
      </Button>
    </Stack>
  );
}

/** The cards a player has pulled from packs. */
export function PulledCards({ userId, isMe, displayName }: { userId: string; isMe: boolean; displayName: string }) {
  const pulled = usePulledCards(userId);
  const fighters = usePredictor().data?.fighters;
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<OwnedCard | null>(null);
  const cards = useMemo(() => {
    const elo = new Map(fighters?.map((f) => [f.id, f.elo]));
    return byRarityThenElo(pulled.data ?? [], (id) => elo.get(id));
  }, [pulled.data, fighters]);
  if (!pulled.isSuccess || (!cards.length && !isMe)) return null;
  const shown = all ? cards : cards.slice(0, SHOWN);
  const best = RARITIES.filter((r) => r.key !== "common")
    .map((r) => ({ ...r, n: cards.filter((c) => c.rarity === r.key).length }))
    .filter((r) => r.n > 0)
    .reverse();

  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Group justify="space-between" align="baseline" mb="sm" gap="xs">
        <Title order={4}>Pack pulls</Title>
        {cards.length > 0 && (
          <Group gap={6}>
            {best.map((r) => (
              <span key={r.key} className="rarity-count" data-rarity={r.key}>
                {r.n} {r.label}
              </span>
            ))}
            <Text size="sm" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
              {cards.length} {cards.length === 1 ? "card" : "cards"}
            </Text>
          </Group>
        )}
      </Group>
      {cards.length > 0 ? (
        <div className="collection-grid">
          {shown.map((c) => (
            <UnstyledButton key={`${c.fighterId}-${c.rarity}`} className="collection-slot pull-slot" data-rarity={c.rarity} onClick={() => setOpen(c)} aria-label={`${c.name}, ${rarityLabel(c.rarity)}: open card`}>
              <FighterTradingCard id={c.fighterId} still fallback={<DebutCard card={{ name: c.name, shiny: false }} />} />
              <RarityPill rarity={c.rarity} />
              {c.copies > 1 && <span className="collection-times">×{c.copies}</span>}
            </UnstyledButton>
          ))}
        </div>
      ) : (
        <Text size="sm" c="dimmed">
          Every card you play earns a free pack of 3 random fighters. A top 3 finish or a league title earns a bonus one.
        </Text>
      )}
      {cards.length > SHOWN && (
        <Button size="xs" variant="subtle" color="gray" mt="xs" fullWidth onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${cards.length}`}
        </Button>
      )}
      {isMe && (
        <Text size="xs" c="dimmed" mt="sm">
          Packs are free and can't be bought. Odds per card: {RARITIES.map((r) => `${r.label} ${r.odds}`).join(" · ")}. The third card is always Rare or better.
        </Text>
      )}
      <Modal opened={!!open} onClose={() => setOpen(null)} centered size={380} title={open ? `${rarityLabel(open.rarity)} card` : ""}>
        {open && <PullCloseUp card={open} isMe={isMe} displayName={displayName} />}
      </Modal>
    </Paper>
  );
}

function PullCloseUp({ card, isMe, displayName }: { card: OwnedCard; isMe: boolean; displayName: string }) {
  const root = useRef<HTMLDivElement>(null);
  const fighter = usePredictor().data?.fighters.find((f) => f.id === card.fighterId);
  const mma = useMmaMath().data;
  const label = rarityLabel(card.rarity);
  return (
    <Stack gap="sm" ref={root}>
      <FighterTradingCard id={card.fighterId} fallback={<DebutCard card={{ name: card.name, shiny: false }} />} />
      {isMe && fighter && (
        <ShareButton
          label="Share this pull"
          fullWidth
          make={async () => {
            const cards = await captureCards(root.current!, 1);
            return fighterImage({
              heading: `${label} pull`,
              name: fighter.name,
              photo: fighter.image?.url,
              detail: `${label} card from a Fight Pack`,
              record: `${fighter.record.wins}-${fighter.record.losses}-${fighter.record.draws}`,
              elo: fighter.elo,
              recent: mma ? recentResults(mma, card.fighterId).map((r) => r.result) : [],
              next: null,
              card: cards?.[0],
            });
          }}
          fileName={`pull-${card.fighterId}`}
          text={`I pulled a ${label} ${fighter.name} from a Fight Pack. What's in yours?`}
          url={`${window.location.origin}${import.meta.env.BASE_URL}u/${encodeURIComponent(displayName)}`}
        />
      )}
    </Stack>
  );
}
