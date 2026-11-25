// Method calls as a donut: each slice is how often a player calls that method (KO/TKO,
// submission, decision), the centre how many of those calls were right. The slices draw
// themselves in when the chart comes into view.

import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import type { Method } from "../../backend";
import { METHOD_LABEL } from "../pickem/scoring";

// What each way of winning looks like: a knockout red, a submission black, a decision white.
export const METHOD_COLOR: Record<Method, string> = { "KO/TKO": "#e03131", SUB: "#050506", DEC: "#e9ecef" };

const R = 42; // ring radius (viewBox 100 x 100)
const STROKE = 13;
const C = 2 * Math.PI * R;
const GAP = 1.2; // a surface gap between slices (in circumference units)

export function MethodDonut({ methods }: { methods: { method: Method; right: number; total: number }[] }) {
  const called = methods.filter((m) => m.total > 0);
  const total = called.reduce((n, m) => n + m.total, 0);
  const right = called.reduce((n, m) => n + m.right, 0);
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  let start = 0;
  const slices = called.map((m, i) => {
    const length = (m.total / total) * C;
    const slice = { ...m, offset: start, length: Math.max(length - (called.length > 1 ? GAP : 0), 0.5), delay: i * 140 };
    start += length;
    return slice;
  });
  const pct = (a: number, b: number) => `${Math.round((100 * a) / b)}%`;

  return (
    <Group ref={ref} gap="md" wrap="wrap" align="center" justify="center">
      <svg viewBox="0 0 100 100" width={112} height={112} role="img" aria-label={`Method calls: ${right} of ${total} right`} style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
        {slices.map((s) => (
          <Tooltip key={s.method} label={`${METHOD_LABEL[s.method]}: called ${s.total}, right ${s.right} (${pct(s.right, s.total)})`} withArrow>
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={METHOD_COLOR[s.method]}
              strokeWidth={STROKE}
              strokeDasharray={`${seen ? s.length : 0} ${C}`}
              strokeDashoffset={-s.offset}
              className="method-slice"
              style={{ transitionDelay: `${s.delay}ms` }}
            />
          </Tooltip>
        ))}
        <g transform="rotate(90 50 50)">
          <text x="50" y="49" textAnchor="middle" className="method-donut-big">
            {right}/{total}
          </text>
          <text x="50" y="62" textAnchor="middle" className="method-donut-small">
            right
          </text>
        </g>
      </svg>
      <Stack gap={6} style={{ minWidth: 120, flex: 1 }}>
        {called.map((m) => (
          <Group key={m.method} gap={8} wrap="nowrap" justify="space-between">
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <span className="method-swatch" style={{ background: METHOD_COLOR[m.method] }} />
              <Text size="sm" truncate>
                {METHOD_LABEL[m.method]}
              </Text>
            </Group>
            <Text size="sm" fw={700} style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {m.right}/{m.total}
            </Text>
          </Group>
        ))}
      </Stack>
    </Group>
  );
}
