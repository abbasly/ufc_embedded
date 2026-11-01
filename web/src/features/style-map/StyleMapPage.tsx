import { Alert, Center, Grid, Loader, MultiSelect, Paper, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { useSearchParams } from "react-router-dom";

import { useStyleMap } from "../../data/client";
import { ChampionsStrip } from "./ChampionsStrip";
import { FighterPanel } from "./FighterPanel";
import { type ColorBy, type Dims, WEIGHT_CLASSES, buildLayout, buildTraces } from "./plot";

export default function StyleMapPage() {
  const { data, error, isPending } = useStyleMap();
  const [params, setParams] = useSearchParams();
  const [dims, setDims] = useState<Dims>(3);
  const [colorBy, setColorBy] = useState<ColorBy>("style");
  const [weightClasses, setWeightClasses] = useState<string[]>([]);

  // Selected fighter lives in the URL (?fighter=islam-makhachev) so it can be shared.
  const selectedId = params.get("fighter");
  const select = (id: string | null) => setParams(id ? { fighter: id } : {}, { replace: true });

  const traces = useMemo(
    () =>
      data &&
      buildTraces({
        data,
        dims,
        colorBy,
        selectedId,
        visible: (f) => weightClasses.length === 0 || weightClasses.includes(f.weight_class),
      }),
    [data, dims, colorBy, selectedId, weightClasses],
  );
  const layout = useMemo(() => data && buildLayout(data, dims), [data, dims]);

  if (isPending) return <Center h="60vh"><Loader /></Center>;
  if (error) return <Alert color="red" title="Could not load the style map">{error.message}</Alert>;

  const selected = data.fighters.find((f) => f.id === selectedId) ?? null;
  const present = new Set(data.fighters.map((f) => f.weight_class));

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 3 }}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {data.fighters.length} active fighters · {Math.round(
              data.axes.slice(0, dims).reduce((s, a) => s + a.explained_variance, 0) * 100,
            )}% of style variance shown
          </Text>
          <ChampionsStrip data={data} selectedId={selectedId} onSelect={select} />
          <Select
            label="Find a fighter"
            placeholder="Type a name"
            searchable
            clearable
            data={data.fighters.map((f) => ({ value: f.id, label: f.name })).sort((a, b) => a.label.localeCompare(b.label))}
            value={selectedId}
            onChange={select}
          />
          <MultiSelect
            label="Weight classes"
            placeholder="All"
            clearable
            data={WEIGHT_CLASSES.filter((wc) => present.has(wc))}
            value={weightClasses}
            onChange={setWeightClasses}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>Colour by</Text>
            <SegmentedControl
              fullWidth
              value={colorBy}
              onChange={(v) => setColorBy(v as ColorBy)}
              data={[{ value: "style", label: "Style" }, { value: "weight_class", label: "Weight class" }]}
            />
          </div>
          <div>
            <Text size="sm" fw={500} mb={4}>View</Text>
            <SegmentedControl
              fullWidth
              value={String(dims)}
              onChange={(v) => setDims(Number(v) as Dims)}
              data={[{ value: "3", label: "3D" }, { value: "2", label: "2D" }]}
            />
          </div>
          <div>
            <Text size="sm" fw={500} mb={4}>Axes</Text>
            {data.axes.slice(0, dims).map((a) => (
              <Text key={a.label} size="xs" c="dimmed">
                <b>{a.label}</b>: {a.low} → {a.high} ({Math.round(a.explained_variance * 100)}%)
              </Text>
            ))}
          </div>
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 6 }}>
        <Paper withBorder h={{ base: 480, md: "calc(100vh - 110px)" }} style={{ overflow: "hidden" }}>
          <Plot
            data={traces ?? []}
            layout={layout ?? {}}
            config={{ displaylogo: false, responsive: true }}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
            onClick={(e) => {
              const id = e.points[0]?.customdata;
              if (typeof id === "string") select(id);
            }}
          />
        </Paper>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 3 }}>
        <FighterPanel data={data} fighter={selected} onSelect={select} />
      </Grid.Col>
    </Grid>
  );
}
