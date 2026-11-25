// How players pick, side by side: across, how often they back the bookmakers' underdog; up, how
// often they're right. Only players whose picks this visitor may see (themselves, friends,
// league-mates, the model), and only with enough decided picks to say something.

import "./RiskChart.css";

import { Text, Tooltip } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { PlayerAvatar } from "../../auth/PlayerAvatar";
import type { VisiblePick } from "../../backend";
import { MODEL_PLAYER } from "../pickem/scoring";
import { hitRate, type PickStyle, pickStyles, underdogShare } from "./risk";

const MIN_PICKS = 10;
const H = 280;
const M = { top: 14, right: 18, bottom: 44, left: 58 };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const ticks = (lo: number, hi: number) => Array.from({ length: Math.round((hi - lo) * 10) + 1 }, (_, i) => Math.round((lo + i * 0.1) * 10) / 10);

function Tip({ s }: { s: PickStyle }) {
  return (
    <div>
      <b>{s.displayName}</b>
      <br />
      Backed the underdog in {s.underdogs} of {s.picks} picks ({pct(underdogShare(s))})
      <br />
      Right on {s.right} of {s.picks} ({pct(hitRate(s))})
      {s.underdogs > 0 && (
        <>
          <br />
          Underdogs called right: {s.underdogsRight} of {s.underdogs}
        </>
      )}
    </div>
  );
}

export function RiskChart({ picks, owner, me }: { picks: VisiblePick[]; owner: string; me?: string }) {
  const styles = useMemo(() => pickStyles(picks, MIN_PICKS), [picks]);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  if (styles.length < 3)
    return (
      <Text size="sm" c="dimmed">
        Shows up once a few players you can see (friends, league-mates, the model) have {MIN_PICKS} or more decided picks each.
      </Text>
    );

  const xs = styles.map(underdogShare);
  const ys = styles.map(hitRate);
  const xMax = Math.min(1, Math.max(0.5, Math.ceil((Math.max(...xs) + 0.05) * 10) / 10));
  let yLo = Math.max(0, Math.floor((Math.min(...ys) - 0.05) * 10) / 10);
  const yHi = Math.min(1, Math.ceil((Math.max(...ys) + 0.05) * 10) / 10);
  if (yHi - yLo < 0.3) yLo = Math.max(0, yHi - 0.3);
  const plotW = Math.max(120, width - M.left - M.right);
  const plotH = H - M.top - M.bottom;
  // A little room inside the plot, so a point on an edge (0% underdogs) stays off the axis labels.
  const INSET = 14;
  const px = (v: number) => M.left + INSET + (v / xMax) * (plotW - 2 * INSET);
  const py = (v: number) => M.top + INSET + (1 - (v - yLo) / (yHi - yLo)) * (plotH - 2 * INSET);
  const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;

  const role = (name: string) => (name === me ? "me" : name === owner ? "owner" : name === MODEL_PLAYER ? "model" : "other");
  // Plain dots first, so the highlighted players sit on top.
  const ordered = [...styles].sort((a, b) => Number(role(a.displayName) !== "other") - Number(role(b.displayName) !== "other"));

  return (
    <div className="risk">
      <div ref={setEl} className="risk-plot" style={{ height: H }}>
        {width > 0 && (
          <>
            <svg width={width} height={H} aria-hidden>
              {ticks(0, xMax).map((t) => (
                <g key={`x${t}`}>
                  <line x1={px(t)} x2={px(t)} y1={M.top} y2={M.top + plotH} className="risk-grid" />
                  <text x={px(t)} y={M.top + plotH + 16} textAnchor="middle" className="risk-tick">
                    {pct(t)}
                  </text>
                </g>
              ))}
              {ticks(yLo, yHi).map((t) => (
                <g key={`y${t}`}>
                  <line x1={M.left} x2={M.left + plotW} y1={py(t)} y2={py(t)} className="risk-grid" />
                  <text x={M.left - 8} y={py(t) + 4} textAnchor="end" className="risk-tick">
                    {pct(t)}
                  </text>
                </g>
              ))}
              <line x1={px(avgX)} x2={px(avgX)} y1={M.top} y2={M.top + plotH} className="risk-avg" />
              <line x1={M.left} x2={M.left + plotW} y1={py(avgY)} y2={py(avgY)} className="risk-avg" />
              <text x={px(avgX) + 4} y={M.top + 10} className="risk-avg-label">
                average
              </text>
              <text x={M.left} y={H - 6} className="risk-axis risk-axis-end">
                ← safer
              </text>
              <text x={M.left + plotW / 2} y={H - 6} textAnchor="middle" className="risk-axis">
                {plotW < 380 ? "underdog picks" : "picks on the bookies' underdog"}
              </text>
              <text x={M.left + plotW} y={H - 6} textAnchor="end" className="risk-axis risk-axis-end">
                bolder →
              </text>
              <text transform={`translate(11 ${M.top + plotH / 2}) rotate(-90)`} textAnchor="middle" className="risk-axis">
                picks right
              </text>
            </svg>
            {ordered.map((s) => {
              const r = role(s.displayName);
              const x = px(underdogShare(s));
              const y = py(hitRate(s));
              return (
                <Tooltip key={s.displayName} label={<Tip s={s} />} withArrow multiline w={250}>
                  <div className="risk-point" data-role={r} style={{ left: x, top: y }} tabIndex={0} aria-label={`${s.displayName}: underdog ${pct(underdogShare(s))}, right ${pct(hitRate(s))}`}>
                    {/* Friends and league-mates small (their name on hover), so the chart stays calm. */}
                    {/* Red is yours here: others without a picture get a grey initial. */}
                    <PlayerAvatar name={s.displayName} avatar={s.avatar} size={r === "other" ? 16 : 24} color={r === "me" ? "red" : "gray"} />
                    <span className="risk-label">{r === "me" ? "you" : s.displayName}</span>
                  </div>
                </Tooltip>
              );
            })}
          </>
        )}
      </div>
      <Text size="xs" c="dimmed" mt={4}>
        Everyone whose picks you can see (you, friends, league-mates, the model), with {MIN_PICKS}+ decided picks that had odds. Hover a face for the numbers.
      </Text>
    </div>
  );
}
