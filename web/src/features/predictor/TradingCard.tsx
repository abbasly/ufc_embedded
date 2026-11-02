// A collectible-card view of a fighter: style = card "type", Elo where the HP would be,
// two signature "moves" with stats as damage, weakness / resistance, rarity by status.

import "./TradingCard.css";

import { Box, Group, Stack, Text } from "@mantine/core";

import type { Cluster, PredictorFighter } from "../../data/types";

interface CardType {
  label: string;
  icon: string;
  color: string; // main colour of the card face
  light: string; // lighter tint for the gradient
  moves: [Move, Move];
}

interface Move {
  name: string;
  stat: string; // feature key in the predictor data
  format: (v: number) => string;
  describe: (v: number) => string;
}

const per = (unit: string) => (v: number) => `${v.toFixed(2)} ${unit}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

const MOVES = {
  combo: { name: "Combination", stat: "slpm", format: (v: number) => v.toFixed(1), describe: per("strikes landed per minute") },
  power: { name: "Knockout Power", stat: "kd15", format: (v: number) => v.toFixed(1), describe: per("knockdowns per 15 min") },
  takedown: { name: "Takedown", stat: "td15", format: (v: number) => v.toFixed(1), describe: per("takedowns per 15 min") },
  control: { name: "Ground Control", stat: "ctrl_share", format: pct, describe: (v: number) => `in control ${pct(v)} of cage time` },
  sub: { name: "Submission Hunt", stat: "sub15", format: (v: number) => v.toFixed(1), describe: per("submission attempts per 15 min") },
  defence: { name: "Slip & Counter", stat: "str_def", format: pct, describe: (v: number) => `avoids ${pct(v)} of strikes` },
} satisfies Record<string, Move>;

const TYPES: Record<string, CardType> = {
  "Pure strikers": { label: "Striker", icon: "💥", color: "#e8590c", light: "#ffc078", moves: [MOVES.combo, MOVES.power] },
  "Dominant wrestlers": { label: "Wrestler", icon: "🤼", color: "#1971c2", light: "#a5d8ff", moves: [MOVES.takedown, MOVES.control] },
  "Scrambly grapplers": { label: "Grappler", icon: "🌀", color: "#7048e8", light: "#d0bfff", moves: [MOVES.sub, MOVES.takedown] },
  "Volume mixers": { label: "Volume", icon: "⚡", color: "#f08c00", light: "#ffec99", moves: [MOVES.combo, MOVES.takedown] },
  "Low-volume all-rounders": { label: "All-rounder", icon: "🌿", color: "#2f9e44", light: "#b2f2bb", moves: [MOVES.defence, MOVES.takedown] },
};
// Champions get an all-gold card face instead of their type colour.
const CHAMPION_FACE = "linear-gradient(160deg, #fff9db 0%, #ffe066 30%, #f5c518 60%, #e8a400 100%)";

const UNKNOWN: CardType = { label: "Fighter", icon: "🥊", color: "#868e96", light: "#dee2e6", moves: [MOVES.combo, MOVES.takedown] };

const DESIGN_WIDTH = 320; // px the card was designed at
const PHOTO_HEIGHT = 140; // design px

/** Design pixels -> a share of the card's width, so the card scales as a whole. */
const u = (px: number) => `${((px / DESIGN_WIDTH) * 100).toFixed(3)}cqw`;

interface Props {
  fighter: PredictorFighter;
  cluster?: Cluster;
  stat: (key: string) => number;
}

export function TradingCard({ fighter, cluster, stat }: Props) {
  const type = (cluster && TYPES[cluster.name]) ?? UNKNOWN;
  const rarity = fighter.champion ? "★" : fighter.rank !== null ? "◆" : "●";
  const initials = fighter.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const record = `${fighter.record.wins}-${fighter.record.losses}-${fighter.record.draws}`;
  const subtitle = fighter.champion
    ? `${fighter.champion} Champion`
    : `${fighter.weight_class}${fighter.rank ? ` · Ranked #${fighter.rank}` : ""}`;

  return (
    // The card is a size container: everything inside is sized in units of its width (u()),
    // so it scales like an image and the layout is identical on every screen and browser.
    <Box w="100%" maw={DESIGN_WIDTH} mx="auto" style={{ containerType: "inline-size" }}>
      <Box
        style={{
          aspectRatio: "63 / 88",
          borderRadius: u(18),
          padding: u(10),
          background: fighter.champion
            ? "linear-gradient(145deg, #b8860b, #ffd700 30%, #fff3a0 50%, #ffd700 70%, #b8860b)"
            : "linear-gradient(145deg, #f8e27a, #e2b33c 45%, #f8e27a)", // the yellow frame
          boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        }}
      >
        <Stack
          gap={u(6)}
          h="100%"
          pos="relative"
          style={{
            borderRadius: u(10),
            padding: `${u(8)} ${u(10)}`,
            overflow: "hidden",
            color: "#1a1b1e",
            background: fighter.champion
              ? CHAMPION_FACE
              : `linear-gradient(170deg, ${type.light} 0%, ${type.color} 120%)`,
          }}
        >
          {fighter.champion && <Box className="holo" pos="absolute" inset={0} style={{ pointerEvents: "none" }} />}

          {/* Header: name, then "HP" (Elo) and the type icon */}
          <Group justify="space-between" wrap="nowrap" gap={u(4)}>
            <Text fw={800} fz={u(17)} lh={1.1} lineClamp={1}>
              {fighter.name}
            </Text>
            <Group gap={u(4)} wrap="nowrap">
              <Text fz={u(9)} fw={700}>ELO</Text>
              <Text fw={800} fz={u(17)}>{fighter.elo}</Text>
              <Box style={{ width: u(24), height: u(24), borderRadius: "50%", background: "white", display: "grid", placeItems: "center", fontSize: u(14), border: `${u(2)} solid ${type.color}` }}>
                {type.icon}
              </Box>
            </Group>
          </Group>
          <Text fz={u(10)} fw={600} mt={u(-6)} lineClamp={1} style={{ opacity: 0.8 }}>
            {type.label} type · {subtitle}
          </Text>

          {/* Picture window */}
          <Box
            style={{
              height: u(PHOTO_HEIGHT),
              flexShrink: 0,
              border: `${u(4)} solid #d9d9d9`,
              boxShadow: "inset 0 0 0 1px #888",
              background: "#2b2b2b",
              overflow: "hidden",
            }}
          >
            {fighter.image ? (
              <img src={fighter.image.url} alt={fighter.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
            ) : (
              <Box h="100%" style={{ display: "grid", placeItems: "center", color: "#ddd", fontSize: u(48), fontWeight: 800 }}>
                {initials}
              </Box>
            )}
          </Box>
          <Text fz={u(9)} fs="italic" ta="center" lineClamp={1} style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)" }}>
            Height {Math.round(stat("height"))} cm · Reach {Math.round(stat("reach"))} cm · Age {Math.round(stat("age"))}
          </Text>

          {/* Two signature moves, stat as the damage */}
          <Stack gap={u(4)}>
            {type.moves.map((move) => (
              <Box key={move.name} style={{ borderBottom: "1px solid rgba(0,0,0,0.2)", paddingBottom: u(3) }}>
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={800} fz={u(14)} lineClamp={1}>
                    {type.icon} {move.name}
                  </Text>
                  <Text fw={800} fz={u(20)}>
                    {move.format(stat(move.stat))}
                  </Text>
                </Group>
                <Text fz={u(10)} lineClamp={1} style={{ opacity: 0.85 }}>
                  {move.describe(stat(move.stat))}
                </Text>
              </Box>
            ))}
          </Stack>

          {/* Weakness / resistance / record, like the bottom row of a card */}
          <Group justify="space-between" gap={u(4)} wrap="nowrap">
            <Footer label="weakness" value={`finished ${pct(stat("finished_rate"))}`} />
            <Footer label="resistance" value={`str. def ${pct(stat("str_def"))}`} />
            <Footer label="record" value={record} />
          </Group>
          {cluster && (
            <Text fz={u(9)} fs="italic" lh={1.2} lineClamp={2} style={{ border: "1px solid rgba(0,0,0,0.35)", borderRadius: u(4), padding: `${u(2)} ${u(6)}`, background: "rgba(255,255,255,0.35)" }}>
              {cluster.description}
            </Text>
          )}
          <Group justify="space-between" mt="auto">
            <Text fz={u(9)} fw={700}>UFC Embedded</Text>
            <Text fz={u(11)} fw={800}>{rarity}</Text>
          </Group>
        </Stack>
      </Box>
    </Box>
  );
}

function Footer({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0} align="center">
      <Text fz={u(8)} fw={700} tt="uppercase" style={{ opacity: 0.75 }}>
        {label}
      </Text>
      <Text fz={u(10)} fw={700}>
        {value}
      </Text>
    </Stack>
  );
}
