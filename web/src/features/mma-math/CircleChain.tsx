// A chain of wins drawn around a circle: fighters on the rim, fights as arrows along it,
// and a dashed arc from the last fighter back to the first to close the "full circle".

import { Badge, Box, Stack, Text, Tooltip } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";

import { Chain, FighterChip, type Lookup } from "./Chain";
import { type Fight, isUpset } from "./graph";

const PX_PER_FIGHTER = 135; // arc length per fighter, so long chains get a bigger circle
const MIN_RADIUS = 200; // short chains still need room for labels plus the verdict inside
const CHIP_MARGIN = 60; // room outside the circle for names
const AVATAR_GAP = 30; // keep arrows clear of the avatars (px)
const LABEL_INSET = 62; // fight labels sit this far inside the rim
const CENTER_PAD = 40; // gap between the fight labels and the verdict in the middle

interface Props {
  fights: Fight[];
  lookup: Lookup;
  center?: React.ReactNode;
}

export function CircleChain({ fights, lookup, center }: Props) {
  const { ref, width } = useElementSize();
  const nodes = [fights[0]!.winner, ...fights.map((f) => f.loser)];
  const n = nodes.length;

  const wanted = Math.max(MIN_RADIUS, (n * PX_PER_FIGHTER) / (2 * Math.PI));
  const r = Math.min(wanted, width / 2 - CHIP_MARGIN);
  const fits = width === 0 || r >= wanted * 0.8;

  const size = 2 * (r + CHIP_MARGIN);
  const c = size / 2;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n; // start at the top, clockwise
  const at = (a: number, radius = r) => [c + radius * Math.cos(a), c + radius * Math.sin(a)] as const;
  const gap = AVATAR_GAP / r;

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
          <Box pos="relative" w={size} h={size} mx="auto">
            <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#fa5252" />
                </marker>
              </defs>
              {fights.map((f, i) => (
                <path key={f.index} d={arc(angle(i) + gap, angle(i + 1) - gap)} fill="none" stroke="#fa5252" strokeWidth={2} markerEnd="url(#arrow)" />
              ))}
              {/* Closing the circle: from the last fighter back to the first. */}
              <path d={arc(angle(n - 1) + gap, angle(n) - gap)} fill="none" stroke="#777" strokeWidth={1.5} strokeDasharray="4 6" />
            </svg>

            {fights.map((f, i) => {
              const [x, y] = at((angle(i) + angle(i + 1)) / 2, r - LABEL_INSET);
              return (
                <Stack key={f.index} gap={0} align="center" pos="absolute" left={x} top={y} style={{ transform: "translate(-50%, -50%)" }}>
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
                <Box key={`${fighter}-${i}`} pos="absolute" left={x} top={y} style={{ transform: "translate(-50%, -26px)" }}>
                  <FighterChip fighter={lookup.fighters[fighter]!} lookup={lookup} />
                </Box>
              );
            })}

            {center && (
              <Stack pos="absolute" left={c} top={c} gap={4} align="center" maw={2 * (r - LABEL_INSET - CENTER_PAD)} style={{ transform: "translate(-50%, -50%)", textAlign: "center" }}>
                {center}
              </Stack>
            )}
          </Box>
        )
      )}
    </Box>
  );
}
