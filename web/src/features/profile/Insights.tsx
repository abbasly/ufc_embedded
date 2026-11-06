// The profile's record panels: you vs the model, best call, method record, points over time,
// badges, and head to head against another player. All from usePlayerRecord's data.

import "./Insights.css";

import { Group, Paper, SimpleGrid, Stack, Text, Title, Tooltip } from "@mantine/core";
import { useState } from "react";

import type { EventScore, PastPick } from "../../backend";
import { METHOD_LABEL } from "../pickem/scoring";
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
      <Text fz={26} fw={800} style={{ fontVariantNumeric: "tabular-nums" }}>
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
export function Highlights({ history, vsModel, isModel, whose }: { history: PastPick[]; vsModel: HeadToHead | null; isModel: boolean; whose: "you" | "they" }) {
  const call = bestCall(history);
  const methods = methodRecord(history).filter((m) => m.total > 0);
  return (
    <SimpleGrid cols={{ base: 1, sm: isModel ? 2 : 3 }} spacing="sm">
      {!isModel && <Panel label="Vs the model">{vsModel ? <Versus h2h={vsModel} them="the model" /> : <Text size="sm" c="dimmed">The model hasn't played a card yet.</Text>}</Panel>}
      <Panel label="Best call">
        {call ? (
          <>
            <Text fz={22} fw={800} lh={1.2}>
              {call.fighter} <Text span c="green.4" fw={800}>+{call.points}</Text>
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
        {methods.length ? (
          <Stack gap={2}>
            {methods.map((m) => (
              <Group key={m.method} justify="space-between" wrap="nowrap">
                <Text size="sm">{METHOD_LABEL[m.method]}</Text>
                <Text size="sm" fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {m.right}/{m.total}
                </Text>
              </Group>
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

/** Small line icons for the badges. */
const BADGE_ICONS: Record<string, React.ReactNode> = {
  perfect: <path d="M5 12.5 9.5 17 19 7.5" />,
  underdog: (
    <>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </>
  ),
  streak: <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />,
  model: (
    <>
      <rect x="5" y="7" width="14" height="11" rx="2" />
      <path d="M9 12h.01M15 12h.01M12 3v4" />
    </>
  ),
};

export function Badges({ list }: { list: Badge[] }) {
  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Badges</Title>
        <Text size="sm" c="dimmed">
          {list.filter((b) => b.earned).length} of {list.length}
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        {list.map((b) => (
          <Tooltip key={b.key} label={b.how} withArrow events={{ hover: true, focus: true, touch: true }}>
            <div className="badge-tile" data-earned={b.earned || undefined}>
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {BADGE_ICONS[b.key]}
              </svg>
              <Text size="sm" fw={700} lh={1.2} ta="center">
                {b.name}
              </Text>
              <Text size="xs" c="dimmed" ta="center" lineClamp={1}>
                {b.progress}
              </Text>
            </div>
          </Tooltip>
        ))}
      </SimpleGrid>
    </Paper>
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
