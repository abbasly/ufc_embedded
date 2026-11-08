// The admin panel's traffic section: visits and page views per day, and where visitors come from,
// for the last week, month or three months. Counted by Cloudflare Web Analytics and read through
// our own small Worker (worker/visits.js).

import "./Visits.css";

import { Group, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import type { VisitDay, VisitStats } from "../../backend";

const RANGES = [
  { value: "7", label: "Week" },
  { value: "30", label: "Month" },
  { value: "90", label: "3 months" },
];
const TOP_COUNTRIES = 10;

const n = (x: number) => x.toLocaleString("en-US");
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const regions = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
function countryName(code: string): string {
  if (!code) return "Unknown";
  try {
    return regions?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Round axis ticks from zero: steps of 1, 2 or 5 times a power of ten, about four of them. */
function axisTicks(max: number): number[] {
  const rough = Math.max(max, 1) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].find((m) => m * power >= rough)! * power);
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Visits per day: one line on quiet gridlines, with a crosshair that follows the pointer. */
function VisitsChart({ series }: { series: VisitDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the real width, so the labels stay readable on a phone.
  const { ref, width } = useElementSize();
  const W = width || 720;
  const H = W < 500 ? 200 : 240;
  const pad = { l: 40, r: 10, t: 12, b: 26 };
  const ticks = axisTicks(Math.max(...series.map((d) => d.visits), 1));
  const top = ticks.at(-1)!;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(series.length - 1, 1);
  const y = (v: number) => H - pad.b - (v * (H - pad.t - pad.b)) / top;
  const line = series.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.visits)}`).join(" ");
  const area = `${line} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  // As many dates along the bottom as fit, whatever the range.
  const every = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor((W - pad.l) / 80))));
  const shown = hover ?? series.length - 1;
  const point = series[shown]!;

  const track = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (series.length - 1));
    setHover(Math.min(series.length - 1, Math.max(0, i)));
  };
  const left = (x(shown) / W) * 100;

  return (
    <div className="visits-chart" ref={ref}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={`Visits per day from ${dayLabel(series[0]!.date)} to ${dayLabel(series.at(-1)!.date)}. The table below has every value.`}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="visits-grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="visits-tick">
              {n(t)}
            </text>
          </g>
        ))}
        {series.map((d, i) =>
          (series.length - 1 - i) % every === 0 ? (
            <text key={d.date} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="visits-tick">
              {dayLabel(d.date)}
            </text>
          ) : null,
        )}
        <path d={area} className="visits-area" />
        <path d={line} className="visits-line" />
        <line x1={x(shown)} x2={x(shown)} y1={pad.t} y2={y(0)} className="visits-crosshair" />
        <circle cx={x(shown)} cy={y(point.visits)} r={5} className="visits-dot" />
      </svg>
      <div className="visits-tip" data-align={left > 75 ? "end" : left < 25 ? "start" : undefined} style={{ left: `${left}%` }}>
        <b>{n(point.visits)} visits</b>
        <span>
          {n(point.pageViews)} page views · {dayLabel(point.date)}
        </span>
      </div>
    </div>
  );
}

/** Where visitors come from: ranked bars, one colour, the number at each bar's end. */
function Countries({ stats }: { stats: VisitStats }) {
  const top = stats.countries.slice(0, TOP_COUNTRIES);
  const rest = stats.countries.slice(TOP_COUNTRIES).reduce((sum, c) => sum + c.visits, 0);
  const rows = rest ? [...top.map((c) => ({ name: countryName(c.country), visits: c.visits })), { name: `${stats.countries.length - TOP_COUNTRIES} more countries`, visits: rest }] : top.map((c) => ({ name: countryName(c.country), visits: c.visits }));
  const max = Math.max(...rows.map((r) => r.visits), 1);
  const total = stats.countries.reduce((sum, c) => sum + c.visits, 0);
  return (
    <Stack gap={8}>
      {rows.map((r) => (
        <div key={r.name} className="country-row" title={`${r.name}: ${n(r.visits)} visits`}>
          <Text size="sm" truncate>
            {r.name}
          </Text>
          <div className="country-track">
            <div className="country-bar" style={{ width: `${(100 * r.visits) / max}%` }} />
          </div>
          <Text size="sm" fw={700} ta="right" className="country-value">
            {n(r.visits)}
            <Text span size="xs" c="dimmed" fw={500}>
              {" "}
              {Math.round((100 * r.visits) / total)}%
            </Text>
          </Text>
        </div>
      ))}
    </Stack>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text fz={26} fw={800} lh={1.15}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </div>
  );
}

export function VisitsPanel() {
  const { backend } = useAuth();
  const [days, setDays] = useState("30");
  const query = useQuery({
    queryKey: ["admin", "visits", days],
    queryFn: () => backend!.admin.visits(Number(days)),
    enabled: !!backend,
    staleTime: 10 * 60_000,
    retry: false,
    placeholderData: keepPreviousData, // the chart stays in place, dimmed, while a new range loads
  });
  const stats = query.data;
  const busiest = useMemo(() => (stats?.series.length ? stats.series.reduce((a, b) => (b.visits > a.visits ? b : a)) : null), [stats]);

  return (
    <Paper p="md" radius="md" className="pickem-board">
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Title order={4}>Visits</Title>
        <SegmentedControl size="xs" value={days} onChange={setDays} data={RANGES} aria-label="Time range" />
      </Group>
      {query.isError ? (
        <Text size="sm" c="dimmed">
          Couldn't load visits: {query.error.message}
        </Text>
      ) : !stats ? (
        <Text size="sm" c="dimmed">
          {query.isPending ? "Loading…" : "Visit stats are off on this site (no VITE_VISITS_URL)."}
        </Text>
      ) : (
        <Stack gap="lg" style={{ opacity: query.isPlaceholderData ? 0.5 : 1, transition: "opacity 0.15s" }}>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <StatTile label="visits" value={n(stats.visits)} />
            <StatTile label="page views" value={n(stats.pageViews)} />
            <StatTile label="pages per visit" value={stats.visits ? (stats.pageViews / stats.visits).toFixed(1) : "–"} />
            <StatTile label={busiest ? `busiest day · ${dayLabel(busiest.date)}` : "busiest day"} value={busiest ? n(busiest.visits) : "–"} />
          </SimpleGrid>
          <div>
            <Text size="sm" fw={700} mb={6}>
              Visits per day
            </Text>
            <VisitsChart series={stats.series} />
            <details className="visits-table">
              <summary>See as a table</summary>
              <Table.ScrollContainer minWidth={280} maxHeight={260}>
                <Table fz="sm" verticalSpacing={2} stickyHeader>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Day</Table.Th>
                      <Table.Th ta="right">Visits</Table.Th>
                      <Table.Th ta="right">Page views</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {[...stats.series].reverse().map((d) => (
                      <Table.Tr key={d.date}>
                        <Table.Td>{dayLabel(d.date)}</Table.Td>
                        <Table.Td ta="right">{n(d.visits)}</Table.Td>
                        <Table.Td ta="right">{n(d.pageViews)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </details>
          </div>
          {stats.countries.length > 0 && (
            <div>
              <Text size="sm" fw={700} mb={8}>
                Visits by country
              </Text>
              <Countries stats={stats} />
            </div>
          )}
        </Stack>
      )}
    </Paper>
  );
}
