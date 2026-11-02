import { Anchor, Avatar, Badge, Group, HoverCard, Stack, Text, Tooltip } from "@mantine/core";
import { Link } from "react-router-dom";

import type { Fighter as StyleFighter, MmaFighter, StyleMapData } from "../../data/types";
import { RecordText } from "../../components/RecordText";
import { GOLD, STYLE_COLORS, ordinal } from "../style-map/model";
import { type Fight, isUpset } from "./graph";

export interface Lookup {
  fighters: MmaFighter[];
  styleMap?: StyleMapData; // optional: enriches hover cards when loaded
  styleById: Map<string, StyleFighter>;
}

interface ChainProps {
  fights: Fight[];
  lookup: Lookup;
  loop?: boolean; // show the first fighter again at the end
}

/** A beat B beat C ... rendered as fighter chips joined by fight arrows. */
export function Chain({ fights, lookup, loop }: ChainProps) {
  const first = fights[0];
  if (!first) return null;
  return (
    <Group gap={4} align="flex-start" wrap="wrap">
      <FighterChip fighter={lookup.fighters[first.winner]!} lookup={lookup} />
      {fights.map((f, i) => (
        <Group key={f.index} gap={4} align="flex-start" wrap="nowrap">
          <FightArrow fight={f} />
          <FighterChip
            fighter={lookup.fighters[f.loser]!}
            lookup={lookup}
            faded={loop && i === fights.length - 1}
          />
        </Group>
      ))}
    </Group>
  );
}

function FightArrow({ fight }: { fight: Fight }) {
  return (
    <Stack gap={0} align="center" w={56} pt={8}>
      <Text size="xs" c="dimmed">
        {fight.method}
        {fight.title && " 🏆"}
      </Text>
      <Text size="lg" lh={1} c="red">
        ⟶
      </Text>
      <Text size="xs" c="dimmed">
        {fight.date.slice(0, 4)}
      </Text>
      {isUpset(fight) && (
        <Tooltip label={`Upset: the winner was a +${fight.winnerOdds} underdog`} withArrow>
          <Badge size="xs" color="orange" variant="light">
            +{fight.winnerOdds}
          </Badge>
        </Tooltip>
      )}
    </Stack>
  );
}

export function FighterChip({ fighter, lookup, faded }: { fighter: MmaFighter; lookup: Lookup; faded?: boolean }) {
  const style = lookup.styleById.get(fighter.id);
  const cluster = style && lookup.styleMap?.clusters.find((c) => c.id === style.cluster);
  const color = cluster ? STYLE_COLORS[cluster.name] : undefined;
  const initials = fighter.name.split(" ").map((w) => w[0]).slice(0, 2).join("");

  return (
    <HoverCard openDelay={120} withArrow shadow="md" width={260}>
      <HoverCard.Target>
        <Stack gap={2} align="center" w={70} style={{ opacity: faded ? 0.5 : 1, cursor: "default" }}>
          <Avatar
            src={fighter.image?.url}
            size={48}
            radius="xl"
            color="gray"
            style={{ border: `2px solid ${fighter.champion ? GOLD : (color ?? "#555")}` }}
          >
            {initials}
          </Avatar>
          <Text size="xs" ta="center" lh={1.2} lineClamp={2}>
            {fighter.champion && "🏆 "}
            {fighter.name}
          </Text>
        </Stack>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack gap={6}>
          <Text fw={600}>{fighter.name}</Text>
          <RecordText record={fighter.record} size="xs" />
          {fighter.champion && (
            <Badge color="yellow" variant="filled" size="sm">
              🏆 {fighter.champion} champion
            </Badge>
          )}
          {style && cluster && lookup.styleMap ? (
            <>
              <Badge variant="light" size="sm" color="gray" style={{ color }}>
                {cluster.name}
              </Badge>
              <Text size="xs" c="dimmed">
                {cluster.description}
              </Text>
              {topTraits(style, lookup.styleMap).map((t) => (
                <Text key={t} size="xs">
                  {t}
                </Text>
              ))}
              <Anchor component={Link} to={`/?fighter=${fighter.id}`} size="xs">
                Show on the style map →
              </Anchor>
            </>
          ) : (
            <Text size="xs" c="dimmed">
              Not on the style map (not active recently or not enough stats).
            </Text>
          )}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

/** The fighter's three most extreme stats, e.g. "Takedowns / 15 min: 97th percentile". */
function topTraits(f: StyleFighter, data: StyleMapData): string[] {
  return data.features
    .map((feat) => ({ feat, pct: f.percentiles[feat.key] ?? 0.5 }))
    .sort((a, b) => Math.abs(b.pct - 0.5) - Math.abs(a.pct - 0.5))
    .slice(0, 3)
    .map(({ feat, pct }) => `${feat.label}: ${ordinal(Math.round(pct * 100))} percentile`);
}
