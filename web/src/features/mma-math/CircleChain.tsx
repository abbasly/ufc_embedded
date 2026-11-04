// A chain of wins drawn around a circle: fighters on the rim, fights as arrows along it,
// and a dashed arc from the last fighter back to the first to close the "full circle".

import "./CircleChain.css";

import { Badge, Box, Stack, Text, Tooltip } from "@mantine/core";
import { useElementSize, useViewportSize } from "@mantine/hooks";

import { Chain, FighterChip, type Lookup } from "./Chain";
import { type Fight, isUpset } from "./graph";

const PX_PER_FIGHTER = 135; // arc length per fighter, so long chains get a bigger circle
const MIN_RADIUS = 200; // short chains still need room for labels plus the verdict inside
const CHIP_MARGIN = 60; // room outside the circle for names
const AVATAR_GAP = 30; // keep arrows clear of the avatars (px)
const LABEL_INSET = 62; // fight labels sit this far inside the rim
const CENTER_PAD = 40; // gap between the fight labels and the verdict in the middle
const ROOM_ABOVE_BELOW = 110; // most of the header and padding around the circle (px)
const DRAW_MS = 1700; // the whole chain draws in about this long (CircleChain.css)

interface Props {
  fights: Fight[];
  lookup: Lookup;
  center?: React.ReactNode;
}

export function CircleChain({ fights, lookup, center }: Props) {
  const { ref, width } = useElementSize();
  const { height: viewport } = useViewportSize();
  const nodes = [fights[0]!.winner, ...fights.map((f) => f.loser)];
  const n = nodes.length;

  const wanted = Math.max(MIN_RADIUS, (n * PX_PER_FIGHTER) / (2 * Math.PI));
  // Fit the width, and the window's height too, so the whole proof is on screen at once.
  const byHeight = viewport > 0 ? viewport / 2 - ROOM_ABOVE_BELOW / 2 - CHIP_MARGIN : Infinity;
  const fits = width === 0 || width / 2 - CHIP_MARGIN >= wanted * 0.8;
  const r = Math.max(MIN_RADIUS * 0.9, Math.min(wanted, width / 2 - CHIP_MARGIN, byHeight));

  const size = 2 * (r + CHIP_MARGIN);
  const c = size / 2;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n; // start at the top, clockwise
  const at = (a: number, radius = r) => [c + radius * Math.cos(a), c + radius * Math.sin(a)] as const;
  const gap = AVATAR_GAP / r;
  // Time per fight in the clockwise drawing: brisk for short chains, quicker for long ones.
  const step = Math.min(170, DRAW_MS / n);
  const timing = (i: number) => ({ "--i": i, "--step": `${step}ms` }) as React.CSSProperties;
  // Arrowhead at the end of fight i's arc, pointing clockwise along the rim.
  const head = (i: number) => {
    const a = angle(i + 1) - gap;
    const [x, y] = at(a);
    const deg = (a * 180) / Math.PI + 90;
    return `translate(${x} ${y}) rotate(${deg})`;
  };

  const arc = (from: number, to: number) => {
    const [x1, y1] = at(from);
    const [x2, y2] = at(to);
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <Box ref={ref} w="100%">
      {!fits ? (
        <Chain fights={fights} lookup={lookup} /> // too narrow for a readable circle (phones)
      ) : (
        width > 0 && (
          // Keyed by the chain, so the drawing replays whenever the matchup changes.
          <Box key={nodes.join("-")} pos="relative" w={size} h={size} mx="auto">
            <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              {fights.map((f, i) => (
                <g key={f.index}>
                  <path className="cc-arc" style={timing(i)} pathLength={1} d={arc(angle(i) + gap, angle(i + 1) - gap)} fill="none" stroke="#fa5252" strokeWidth={2} />
                  <path className="cc-after" style={timing(i)} transform={head(i)} d="M 0 0 L -10 -5 L -10 5 z" fill="#fa5252" />
                </g>
              ))}
              {/* Closing the circle: from the last fighter back to the first. */}
              <path className="cc-after" style={timing(n - 1)} d={arc(angle(n - 1) + gap, angle(n) - gap)} fill="none" stroke="#777" strokeWidth={1.5} strokeDasharray="4 6" />
            </svg>

            {fights.map((f, i) => {
              const [x, y] = at((angle(i) + angle(i + 1)) / 2, r - LABEL_INSET);
              return (
                <Stack key={f.index} className="cc-after" gap={0} align="center" pos="absolute" left={x} top={y} style={{ transform: "translate(-50%, -50%)", ...timing(i) }}>
                  <Text size="xs" c="dimmed" lh={1.2}>
                    {f.method}
                    {f.title && " 🏆"}
                  </Text>
                  <Text size="xs" c="dimmed" lh={1.2}>
                    {f.date.slice(0, 4)}
                  </Text>
                  {isUpset(f) && (
                    <Tooltip label={`Upset: the winner was a +${f.winnerOdds} underdog`} withArrow>
                      <Badge size="xs" color="orange" variant="light">
                        +{f.winnerOdds}
                      </Badge>
                    </Tooltip>
                  )}
                </Stack>
              );
            })}

            {nodes.map((fighter, i) => {
              const [x, y] = at(angle(i));
              return (
                <Box key={`${fighter}-${i}`} className="cc-node" pos="absolute" left={x} top={y} style={{ transform: "translate(-50%, -26px)", ...timing(i) }}>
                  <FighterChip fighter={lookup.fighters[fighter]!} lookup={lookup} />
                </Box>
              );
            })}

            {center && (
              <Stack className="cc-center" pos="absolute" left={c} top={c} gap={4} align="center" maw={2 * (r - LABEL_INSET - CENTER_PAD)} style={{ transform: "translate(-50%, -50%)", textAlign: "center", ...timing(n - 1) }}>
                {center}
              </Stack>
            )}
          </Box>
        )
      )}
    </Box>
  );
}
