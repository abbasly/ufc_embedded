// A collectible-card view of a fighter: style = card "type", Elo where the HP would be,
// two signature "moves" with stats as damage, weakness / resistance, rarity by status.
// Click / tap (or Enter) flips it in 3D to a back with the record, recent form and stats.

import "./TradingCard.css";

import { Box, Group, Stack, Text } from "@mantine/core";
import { type PointerEvent, useState } from "react";

import type { Cluster, PredictorFighter } from "../../data/types";
import type { RecentResult } from "./model";

interface CardType {
  label: string;
  icon: string;
  color: string; // accent: icon ring, the glow on the back
  light: string; // light tint: stat bars on the back
  face: string; // card face gradient
  frame: string; // metallic border gradient
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

/** A metallic frame: dark edges, a bright band across the middle, in one colour family. */
const metal = (dark: string, mid: string, shine: string) =>
  `linear-gradient(145deg, ${dark}, ${mid} 30%, ${shine} 50%, ${mid} 70%, ${dark})`;

// Faces: a light top running into a saturated bottom; the deepest stop sits past the edge so
// the dark text along the bottom stays readable.
const TYPES: Record<string, CardType> = {
  Kickboxers: {
    label: "Kickboxer", icon: "💥", color: "#e8590c", light: "#ffc078",
    face: "linear-gradient(160deg, #fff4e6 0%, #ffd8a8 28%, #ff922b 72%, #d9480f 125%)",
    frame: metal("#7a2805", "#f76707", "#ffd8a8"),
    moves: [MOVES.combo, MOVES.power],
  },
  "Dominant wrestlers": {
    label: "Wrestler", icon: "🤼", color: "#3b5bdb", light: "#bac8ff",
    face: "linear-gradient(160deg, #f8f9ff 0%, #dbe4ff 28%, #91a7ff 70%, #4c3fc4 125%)",
    frame: metal("#1e2a78", "#5c7cfa", "#e5ebff"),
    moves: [MOVES.takedown, MOVES.control],
  },
  "Clinch fighters": {
    label: "Clinch", icon: "🌀", color: "#ae3ec9", light: "#eebefa",
    face: "linear-gradient(160deg, #fdf4ff 0%, #f3d9fa 28%, #da77f2 70%, #862e9c 125%)",
    frame: metal("#5a1a6b", "#be4bdb", "#f8e1fd"),
    moves: [MOVES.control, MOVES.takedown],
  },
  "Volume boxers": {
    label: "Boxer", icon: "⚡", color: "#0c8599", light: "#99e9f2",
    face: "linear-gradient(160deg, #f0fdff 0%, #c5f6fa 28%, #3bc9db 70%, #0b7285 125%)",
    frame: metal("#08454f", "#15aabf", "#d8fbff"),
    moves: [MOVES.combo, MOVES.power],
  },
  "Low-volume all-rounders": {
    label: "All-rounder", icon: "🌿", color: "#2f9e44", light: "#b2f2bb",
    face: "linear-gradient(160deg, #f4fce3 0%, #d8f5a2 28%, #8ce99a 66%, #2b8a3e 125%)",
    frame: metal("#1b4d24", "#40c057", "#e6fcdc"),
    moves: [MOVES.defence, MOVES.takedown],
  },
};
// Champions get an all-gold card face instead of their type colour.
const CHAMPION_FACE = "linear-gradient(160deg, #fff9db 0%, #ffe066 30%, #f5c518 60%, #e8a400 100%)";

const UNKNOWN: CardType = {
  label: "Fighter", icon: "🥊", color: "#868e96", light: "#dee2e6",
  face: "linear-gradient(160deg, #f8f9fa 0%, #e9ecef 30%, #adb5bd 74%, #495057 125%)",
  frame: metal("#343a40", "#adb5bd", "#f8f9fa"),
  moves: [MOVES.combo, MOVES.takedown],
};

/** The card type a style cluster plays as ("Striker", "Wrestler"...), if it has one. */
export const styleLabel = (clusterName: string | undefined) =>
  clusterName ? TYPES[clusterName]?.label : undefined;

const DESIGN_WIDTH = 320; // px the card was designed at
const PHOTO_HEIGHT = 140; // design px

/** Long names shrink so they fit next to the Elo instead of being cut off. */
const nameSize = (name: string) => (name.length <= 15 ? 17 : name.length <= 19 ? 15 : 13);

/** Design pixels -> a share of the card's width, so the card scales as a whole. */
const u = (px: number) => `${((px / DESIGN_WIDTH) * 100).toFixed(3)}cqw`;

const GOLD_FRAME = "linear-gradient(145deg, #b8860b, #ffd700 30%, #fff3a0 50%, #ffd700 70%, #b8860b)";

interface Props {
  fighter: PredictorFighter;
  cluster?: Cluster;
  stat: (key: string) => number;
  recent: RecentResult[]; // last UFC fights, for the back of the card
}

export function TradingCard({ fighter, cluster, stat, recent }: Props) {
  // Half-turns so far: the card always keeps rotating the same way (0 -> 180 -> 360 ...).
  const [turns, setTurns] = useState(0);
  const flipped = turns % 2 === 1;
  const type = (cluster && TYPES[cluster.name]) ?? UNKNOWN;
  const rarity = fighter.champion ? "★" : fighter.rank !== null ? "◆" : "●";
  const initials = fighter.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const record = `${fighter.record.wins}-${fighter.record.losses}-${fighter.record.draws}`;
  const subtitle = fighter.champion
    ? `${fighter.champion} Champion`
    : `${fighter.weight_class}${fighter.rank ? ` · Ranked #${fighter.rank}` : ""}`;

  const frame = {
    borderRadius: u(18),
    padding: u(10),
    background: fighter.champion ? GOLD_FRAME : type.frame,
    boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
  };
  const flip = () => setTurns((t) => t + 1);
  // Foil shine follows the mouse: position as CSS variables, set directly (no re-render).
  const track = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    e.currentTarget.style.setProperty("--mx", `${x}%`);
    e.currentTarget.style.setProperty("--my", `${y}%`);
  };
  // Alternate class names so the lift + glint animations restart on every flip.
  const lift = turns === 0 ? "" : turns % 2 ? " lift-a" : " lift-b";

  return (
    // The card is a size container: everything inside is sized in units of its width (u()),
    // so it scales like an image and the layout is identical on every screen and browser.
    <Box w="100%" maw={DESIGN_WIDTH} mx="auto" style={{ containerType: "inline-size", perspective: u(1400) }}>
      <Box className={`flip-lift${lift}`} style={{ aspectRatio: "63 / 88", position: "relative" }}>
      <Box
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`${fighter.name}: flip card for more stats`}
        onClick={flip}
        onPointerMove={track}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            flip();
          }
        }}
        className="flip-card"
        style={{ transform: `rotateY(${turns * 180}deg)` }}
      >
      <Box className="flip-face" style={frame}>
        <Box className="hover-shine" />
        <Stack
          gap={u(6)}
          h="100%"
          pos="relative"
          style={{
            borderRadius: u(10),
            padding: `${u(8)} ${u(10)}`,
            overflow: "hidden",
            color: "#1a1b1e",
            background: fighter.champion ? CHAMPION_FACE : type.face,
          }}
        >
          {/* Champions shimmer; everyone else gets a still sheen so the face isn't flat. */}
          <Box className={fighter.champion ? "holo" : "sheen"} pos="absolute" inset={0} style={{ pointerEvents: "none" }} />

          {/* Header: name, then "HP" (Elo) and the type icon */}
          <Group justify="space-between" wrap="nowrap" gap={u(4)}>
            <Text fw={800} fz={u(nameSize(fighter.name))} lh={1.1} lineClamp={1}>
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
            <Text fz={u(9)} fw={700} className="flip-hint" style={{ opacity: 0.7 }}>↻ tap to flip</Text>
            <Text fz={u(11)} fw={800}>{rarity}</Text>
          </Group>
        </Stack>
      </Box>
      <Box className="flip-face flip-back" style={frame}>
        <BackFace fighter={fighter} type={type} stat={stat} recent={recent} rarity={rarity} />
      </Box>
      </Box>
      </Box>
    </Box>
  );
}

const STAT_SHEET: [string, string, (v: number) => string, number][] = [
  // feature, label, format, value that fills the bar
  ["slpm", "Strikes landed / min", (v) => v.toFixed(2), 8],
  ["sapm", "Strikes absorbed / min", (v) => v.toFixed(2), 8],
  ["str_acc", "Striking accuracy", pct, 1],
  ["str_def", "Strike defence", pct, 1],
  ["td15", "Takedowns / 15 min", (v) => v.toFixed(2), 6],
  ["td_def", "Takedown defence", pct, 1],
  ["sub15", "Sub attempts / 15 min", (v) => v.toFixed(2), 3],
  ["ctrl_share", "Control time", pct, 0.6],
  ["kd15", "Knockdowns / 15 min", (v) => v.toFixed(2), 2],
];

interface BackProps {
  fighter: PredictorFighter;
  type: CardType;
  stat: (key: string) => number;
  recent: RecentResult[];
  rarity: string;
}

/** The back of the card: full record, recent form and a stat sheet. */
function BackFace({ fighter, type, stat, recent, rarity }: BackProps) {
  const r = fighter.record;
  const hours = stat("ufc_minutes") / 60;
  const facts: [string, string][] = [
    ["UFC fights", String(Math.round(stat("ufc_fights")))],
    ["Cage time", hours >= 1 ? `${hours.toFixed(1)} h` : `${Math.round(stat("ufc_minutes"))} min`],
    ["Win streak", String(Math.round(stat("win_streak")))],
    ["Last fight", fighter.last_fight.slice(0, 7)],
  ];
  return (
    <Stack
      gap={u(5)}
      h="100%"
      style={{
        borderRadius: u(10),
        padding: `${u(9)} ${u(11)}`,
        overflow: "hidden",
        color: "#f1f3f5",
        background: fighter.champion
          ? "linear-gradient(165deg, #3d3000 0%, #6b5200 55%, #b8860b 130%)"
          : `linear-gradient(165deg, #1b1c22 0%, #24252d 55%, ${type.color} 160%)`,
      }}
      pos="relative"
    >
      {fighter.champion && <Box className="holo holo-dark" pos="absolute" inset={0} style={{ pointerEvents: "none" }} />}
      <Group justify="space-between" wrap="nowrap">
        <Text fw={800} fz={u(15)} lineClamp={1}>
          {fighter.name}
        </Text>
        <Text fz={u(9)} fw={700} tt="uppercase" style={{ opacity: 0.6, letterSpacing: "0.08em" }}>
          Fighter file
        </Text>
      </Group>

      {/* Record, big */}
      <Group justify="center" gap={u(14)}>
        {[
          [r.wins, "wins", "#51cf66"],
          [r.losses, "losses", "#ff6b6b"],
          [r.draws, "draws", "#adb5bd"],
        ].map(([n, label, color]) => (
          <Stack key={label as string} gap={0} align="center">
            <Text fw={800} fz={u(24)} lh={1} c={color as string}>
              {n}
            </Text>
            <Text fz={u(8)} tt="uppercase" style={{ opacity: 0.6 }}>
              {label}
            </Text>
          </Stack>
        ))}
      </Group>

      <Group justify="space-between" gap={u(4)} wrap="nowrap">
        {facts.map(([label, value]) => (
          <Stack key={label} gap={0} align="center" style={{ flex: 1 }}>
            <Text fw={700} fz={u(11)}>
              {value}
            </Text>
            <Text fz={u(7.5)} tt="uppercase" style={{ opacity: 0.6 }} lineClamp={1}>
              {label}
            </Text>
          </Stack>
        ))}
      </Group>

      {/* Recent form */}
      <Box>
        <Text fz={u(9)} fw={700} tt="uppercase" mb={u(3)} style={{ opacity: 0.6, letterSpacing: "0.08em" }}>
          Recent form
        </Text>
        <Stack gap={u(2)}>
          {recent.length ? (
            recent.map((f, i) => (
              <Group key={`${f.opponent}-${i}`} gap={u(6)} wrap="nowrap">
                <Box
                  style={{
                    width: u(16),
                    flexShrink: 0,
                    textAlign: "center",
                    borderRadius: u(3),
                    fontSize: u(9),
                    fontWeight: 800,
                    color: "#1a1b1e",
                    background: f.result === "W" ? "#51cf66" : "#ff6b6b",
                  }}
                >
                  {f.result}
                </Box>
                <Text fz={u(10)} lineClamp={1} style={{ flex: 1 }}>
                  {f.opponent}
                </Text>
                <Text fz={u(9)} style={{ opacity: 0.65, whiteSpace: "nowrap" }}>
                  {f.method} · {f.year}
                </Text>
              </Group>
            ))
          ) : (
            <Text fz={u(10)} style={{ opacity: 0.6 }}>
              No decisive UFC fights yet.
            </Text>
          )}
        </Stack>
      </Box>

      {/* Stat sheet with small bars */}
      <Box>
        <Text fz={u(9)} fw={700} tt="uppercase" mb={u(3)} style={{ opacity: 0.6, letterSpacing: "0.08em" }}>
          Stat sheet
        </Text>
        <Stack gap={u(1.5)}>
          {STAT_SHEET.map(([key, label, fmt, full]) => (
            <Group key={key} gap={u(6)} wrap="nowrap">
              <Text fz={u(9.5)} style={{ width: "46%", flexShrink: 0 }} lineClamp={1}>
                {label}
              </Text>
              <Box style={{ flex: 1, height: u(5), borderRadius: u(3), background: "rgba(255,255,255,0.12)" }}>
                <Box
                  style={{
                    width: `${Math.min(100, (stat(key) / full) * 100)}%`,
                    height: "100%",
                    borderRadius: u(3),
                    background: fighter.champion ? "#ffd43b" : type.light,
                  }}
                />
              </Box>
              <Text fz={u(9.5)} fw={700} style={{ width: u(38), textAlign: "right" }}>
                {fmt(stat(key))}
              </Text>
            </Group>
          ))}
        </Stack>
      </Box>

      <Group justify="space-between" mt="auto">
        <Text fz={u(9)} fw={700} style={{ opacity: 0.7 }}>
          UFC Embedded
        </Text>
        <Text fz={u(9)} fw={700} style={{ opacity: 0.7 }}>
          ↻ tap to flip back
        </Text>
        <Text fz={u(11)} fw={800}>
          {rarity}
        </Text>
      </Group>
    </Stack>
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
