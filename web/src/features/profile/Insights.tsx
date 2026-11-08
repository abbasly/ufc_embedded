// The profile's record panels: you vs the model, best call, method record, points over time,
// badges, and head to head against another player. All from usePlayerRecord's data.

import "./Insights.css";

import { Group, Paper, SimpleGrid, Stack, Text, Title, Tooltip } from "@mantine/core";
import { useState } from "react";

import { Link } from "react-router-dom";

import { PlayerAvatar } from "../../auth/PlayerAvatar";
import type { ClosestPredictor, EventScore, PastPick } from "../../backend";
import { ModelTag, playerPath } from "../pickem/Leagues";
import { METHOD_LABEL, MODEL_PLAYER } from "../pickem/scoring";
import { type Badge, bestCall, type HeadToHead, methodRecord, pointsOverTime } from "./record";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={6} style={{ letterSpacing: "0.08em" }}>
        {label}
      </Text>
      {children}
    </Paper>
  );
}

/** "3–1–0" with who's ahead. */
function Versus({ h2h, them }: { h2h: HeadToHead; them: string }) {
  const played = h2h.wins + h2h.losses + h2h.draws;
  if (!played)
    return (
      <Text size="sm" c="dimmed">
        No card in common with {them} yet.
      </Text>
    );
  return (
    <>
      <Text fz={26} fw={800} c={h2h.wins > h2h.losses ? "green.4" : h2h.wins < h2h.losses ? "red.4" : undefined} style={{ fontVariantNumeric: "tabular-nums" }}>
        {h2h.wins}–{h2h.losses}
        {h2h.draws > 0 && `–${h2h.draws}`}
      </Text>
      <Text size="sm" c="dimmed">
        cards won against {them} · {h2h.mine} to {h2h.theirs} pts
      </Text>
    </>
  );
}

/** You vs the model, best call and method record, side by side. */
export function Highlights({ history, vsModel, isModel, whose, picksHidden }: { history: PastPick[]; vsModel: HeadToHead | null; isModel: boolean; whose: "you" | "they"; picksHidden: boolean }) {
  const call = bestCall(history);
  const methods = methodRecord(history).filter((m) => m.total > 0);
  const hidden = (
    <Text size="sm" c="dimmed">
      Only their friends and league-mates can see this.
    </Text>
  );
  return (
    <SimpleGrid cols={{ base: 1, sm: isModel ? 2 : 3 }} spacing="sm">
      {!isModel && <Panel label="Vs the model">{vsModel ? <Versus h2h={vsModel} them="the model" /> : <Text size="sm" c="dimmed">The model hasn't played a card yet.</Text>}</Panel>}
      <Panel label="Best call">
        {picksHidden ? hidden : call ? (
          <>
            <Text fz={22} fw={800} lh={1.2}>
              <Text span c="yellow.4" fw={800} inherit>{call.fighter}</Text> <Text span c="green.4" fw={800} inherit>+{call.points}</Text>
            </Text>
            <Text size="sm" c="dimmed">
              at {pct(call.chance)} with the bookies · {call.pick.eventName.split(":")[0]}
            </Text>
          </>
        ) : (
          <Text size="sm" c="dimmed">
            No right picks yet: {whose === "you" ? "your" : "their"} boldest right call shows here.
          </Text>
        )}
      </Panel>
      <Panel label="Method calls">
        {picksHidden ? hidden : methods.length ? (
          <Stack gap={8}>
            {methods.map((m) => (
              <div key={m.method} className="method-row" data-method={m.method}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm">{METHOD_LABEL[m.method]}</Text>
                  <Text size="sm" fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {m.right}/{m.total}
                  </Text>
                </Group>
                <div className="method-bar">
                  <div style={{ width: `${(100 * m.right) / m.total}%` }} />
                </div>
              </div>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            No method calls yet: pick how a fighter wins for +5.
          </Text>
        )}
      </Panel>
    </SimpleGrid>
  );
}

/** Running points total card by card: one line, a dot per card, a tooltip on each. */
export function PointsChart({ scores }: { scores: EventScore[] }) {
  const series = pointsOverTime(scores);
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2) return null;
  const W = 600;
  const H = 150;
  const pad = { l: 8, r: 8, t: 14, b: 6 };
  const max = Math.max(...series.map((s) => s.total), 1);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (series.length - 1);
  const y = (v: number) => H - pad.b - (v * (H - pad.t - pad.b)) / max;
  const path = series.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s.total)}`).join(" ");
  const shown = hover ?? series.length - 1;
  const point = series[shown]!;
  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <Panel label="Points over time">
      <div className="points-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Points over ${series.length} cards, ${point.total} in total`} onMouseLeave={() => setHover(null)}>
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="points-axis" />
          <path d={path} className="points-line" />
          {series.map((s, i) => (
            <g key={s.startsOn + s.name}>
              <circle cx={x(i)} cy={y(s.total)} r={i === shown ? 5 : 4} className="points-dot" data-active={i === shown || undefined} />
              {/* A hit area bigger than the dot. */}
              <circle cx={x(i)} cy={y(s.total)} r={18} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          ))}
        </svg>
        {/* Outside the drawing, so they stay readable however small the chart gets. */}
        <Group justify="space-between" mt={2}>
          <Text size="xs" c="dimmed">
            {day(series[0]!.startsOn)}
          </Text>
          <Text size="xs" c="dimmed">
            {day(series.at(-1)!.startsOn)}
          </Text>
        </Group>
        {/* Next to its dot (below it when it's high up), kept inside the panel. */}
        <div
          className="points-tip"
          data-align={x(shown) / W > 0.8 ? "end" : x(shown) / W < 0.2 ? "start" : undefined}
          data-below={y(point.total) / H < 0.5 || undefined}
          style={{ left: `${(x(shown) / W) * 100}%`, top: `${(y(point.total) / H) * 100}%` }}
        >
          <b>{point.total} pts</b>
          <span>
            {point.name.split(":")[0]} · +{point.points}
          </span>
        </div>
      </div>
    </Panel>
  );
}

/** Each badge's emblem, drawn on a 24 x 24 grid. */
const BADGE_ICONS: Record<string, React.ReactNode> = {
  perfect: <path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.2 6.1-5.5-3-5.5 3 1.2-6.1-4.5-4.2 6.1-.8Z" fill="currentColor" stroke="none" />,
  headliner: <path d="M4 18.5h16l1.4-10.3-5.4 3.9L12 5l-4 7.1-5.4-3.9Z" fill="currentColor" stroke="none" />,
  underdog: (
    <g fill="currentColor" stroke="none">
      <path d="M12 11.5c-3 0-5.4 2.6-5.4 5 0 1.5 1.2 2.3 2.6 2.3 1 0 1.8-.5 2.8-.5s1.8.5 2.8.5c1.4 0 2.6-.8 2.6-2.3 0-2.4-2.4-5-5.4-5Z" />
      <ellipse cx="5.2" cy="10.6" rx="1.8" ry="2.3" />
      <ellipse cx="9.3" cy="6.8" rx="1.9" ry="2.5" />
      <ellipse cx="14.7" cy="6.8" rx="1.9" ry="2.5" />
      <ellipse cx="18.8" cy="10.6" rx="1.8" ry="2.3" />
    </g>
  ),
  streak: <path d="M12.4 2.5c.6 3.9 5.4 5.9 5.4 11.5a5.8 5.8 0 0 1-11.6 0c0-2.5 1.2-4.1 2.5-5.1.2 1.8 1.1 2.7 2.1 3-.5-3.3-.2-6.8 1.6-9.4Z" fill="currentColor" stroke="none" />,
  model: (
    <>
      <rect x="4.5" y="8" width="15" height="11" rx="2.5" fill="currentColor" stroke="none" />
      <path d="M12 3.5V8" />
      <circle cx="12" cy="3.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13" r="1.5" className="badge-cut" stroke="none" />
      <circle cx="15" cy="13" r="1.5" className="badge-cut" stroke="none" />
    </>
  ),
  ko: <path d="m12 2 2.1 5.7 5-3-2.1 5.5 5 1.8-5 1.8 2.1 5.5-5-3L12 22l-2.1-5.7-5 3 2.1-5.5-5-1.8 5-1.8-2.1-5.5 5 3Z" fill="currentColor" stroke="none" />,
  sub: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" stroke="none" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <circle cx="12" cy="15.5" r="1.7" className="badge-cut" stroke="none" />
    </>
  ),
  judge: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.2" fill="currentColor" stroke="none" />
      <path d="M8.5 8h7M8.5 12h7" className="badge-cut-line" />
      <path d="m8.8 16.3 2 2 4.4-4.4" className="badge-cut-line" />
    </>
  ),
};

/** A hexagonal medal in the badge's own colours; grey with a dashed edge until it's earned. */
function Medal({ badge }: { badge: Badge }) {
  const gradient = `badge-fill-${badge.key}`;
  return (
    <svg className="badge-medal" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="badge-stop-top" />
          <stop offset="1" className="badge-stop-bottom" />
        </linearGradient>
      </defs>
      <path d="M32 3.5 56.7 17.7v28.6L32 60.5 7.3 46.3V17.7Z" fill={badge.earned ? `url(#${gradient})` : "rgba(255, 255, 255, 0.04)"} className="badge-hex" />
      {badge.earned && <path d="M32 9 52 20.5v9.3C43 24 21 24 12 29.8v-9.3Z" fill="rgba(255, 255, 255, 0.14)" />}
      <g transform="translate(17 17) scale(1.25)" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="badge-icon">
        {BADGE_ICONS[badge.key]}
      </g>
    </svg>
  );
}

export function Badges({ list }: { list: Badge[] }) {
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Badges</Title>
        <Text size="sm" c="dimmed">
          {list.filter((b) => b.earned).length} of {list.length}
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="sm">
        {list.map((b) => (
          <Tooltip key={b.key} label={b.how} withArrow multiline maw={220} events={{ hover: true, focus: true, touch: true }}>
            <div className="badge-tile" data-badge={b.key} data-earned={b.earned || undefined} tabIndex={0}>
              <Medal badge={b} />
              <Text size="sm" fw={700} lh={1.2} ta="center">
                {b.name}
              </Text>
              {b.earned ? (
                <Text size="xs" c="dimmed" ta="center" lineClamp={1}>
                  {b.progress}
                </Text>
              ) : (
                <>
                  <Text size="xs" c="dimmed" ta="center" lineClamp={1}>
                    {b.progress}
                  </Text>
                  <div className="badge-progress">
                    <div style={{ width: `${b.fraction * 100}%` }} />
                  </div>
                </>
              )}
            </div>
          </Tooltip>
        ))}
      </SimpleGrid>
    </Paper>
  );
}

const agreement = (p: ClosestPredictor) => p.agreed / p.shared;

function Predictor({ player, label, tone }: { player: ClosestPredictor; label: string; tone: "close" | "far" }) {
  const pctAgreed = Math.round(agreement(player) * 100);
  return (
    <div className="closest-card" data-tone={tone}>
      <Text size="xs" tt="uppercase" fw={700} className="closest-label">
        {label}
      </Text>
      <Group gap="sm" wrap="nowrap" mt={8}>
        <PlayerAvatar name={player.displayName} avatar={player.avatar} size={48} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text component={Link} to={playerPath(player.displayName)} fw={700} truncate display="block">
            {player.displayName}
            {player.displayName === MODEL_PLAYER && <ModelTag />}
          </Text>
          <Text size="xs" c="dimmed">
            agreed on {player.agreed} of {player.shared} fights
          </Text>
        </div>
        <Text fz={26} fw={800} className="closest-pct">
          {pctAgreed}%
        </Text>
      </Group>
      <div className="closest-bar">
        <div style={{ width: `${pctAgreed}%` }} />
      </div>
    </div>
  );
}

/** Who picks most like this player, and who least, among the picks you're allowed to see. */
export function ClosestPredictors({ players, isMe }: { players: ClosestPredictor[]; isMe: boolean }) {
  if (!players.length) return null;
  const closest = players[0]!;
  const farthest = players.at(-1)!;
  const showFar = players.length > 1 && agreement(farthest) < agreement(closest);
  return (
    <SimpleGrid cols={{ base: 1, xs: showFar ? 2 : 1 }} spacing="sm">
      <Paper p="md" radius="md" className="pickem-board">
        <Predictor player={closest} label={isMe ? "Picks most like you" : "Picks most like them"} tone="close" />
      </Paper>
      {showFar && (
        <Paper p="md" radius="md" className="pickem-board">
          <Predictor player={farthest} label={isMe ? "Your opposite" : "Their opposite"} tone="far" />
        </Paper>
      )}
    </SimpleGrid>
  );
}

/** On someone else's page: how you do against them. */
export function HeadToHeadPanel({ h2h, them }: { h2h: HeadToHead; them: string }) {
  return (
    <Panel label={`You vs ${them}`}>
      <Versus h2h={h2h} them={them} />
    </Panel>
  );
}
