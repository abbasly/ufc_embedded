import { Alert, Box, Center, Grid, Group, Loader, MultiSelect, Paper, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useSearchParams } from "react-router-dom";

import { useStyleMap } from "../../data/client";
import type { Fighter } from "../../data/types";
import { ChampionsStrip } from "./ChampionsStrip";
import { FighterPanel } from "./FighterPanel";
import { type ColorBy, type Dims, SHOW_OPTIONS, type Show, WEIGHT_CLASSES, colorOfGroup, groupOf, legend } from "./model";
import { Scene } from "./Scene";

export default function StyleMapPage() {
  const { data, error, isPending } = useStyleMap();
  const [params, setParams] = useSearchParams();
  const [dims, setDims] = useState<Dims>(3);
  const [colorBy, setColorBy] = useState<ColorBy>("style");
  const [show, setShow] = useState<Show>("all");
  const [weightClasses, setWeightClasses] = useState<string[]>([]);

  // Selected fighter lives in the URL (?fighter=islam-makhachev) so it can be shared.
  const selectedId = params.get("fighter");
  const select = (id: string | null) => setParams(id ? { fighter: id } : {}, { replace: true });

  if (isPending) return <Center h="60vh"><Loader /></Center>;
  if (error) return <Alert color="red" title="Could not load the style map">{error.message}</Alert>;

  const selected = data.fighters.find((f) => f.id === selectedId) ?? null;
  const present = new Set(data.fighters.map((f) => f.weight_class));
  const isShown = (f: Fighter) =>
    SHOW_OPTIONS[show].test(f) && (weightClasses.length === 0 || weightClasses.includes(f.weight_class));
  const shownCount = data.fighters.filter(isShown).length;

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 3 }}>
        <Stack gap="md">
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
          <div>
            <Text size="sm" fw={500} mb={4}>Show</Text>
            <SegmentedControl
              fullWidth
              value={show}
              onChange={(v) => setShow(v as Show)}
              data={Object.entries(SHOW_OPTIONS).map(([value, o]) => ({ value, label: o.label }))}
            />
          </div>
          <MultiSelect
            label="Weight classes"
            placeholder="All"
            clearable
            data={WEIGHT_CLASSES.filter((wc) => present.has(wc))}
            value={weightClasses}
            onChange={setWeightClasses}
          />
          <Group grow>
            <div>
              <Text size="sm" fw={500} mb={4}>Colour by</Text>
              <SegmentedControl
                fullWidth
                value={colorBy}
                onChange={(v) => setColorBy(v as ColorBy)}
                data={[{ value: "style", label: "Style" }, { value: "weight_class", label: "Weight" }]}
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
          </Group>
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
        <Paper withBorder pos="relative" h={{ base: 480, md: "calc(100vh - 110px)" }} style={{ overflow: "hidden" }}>
          <ErrorBoundary
            fallback={
              <Center h="100%">
                <Text c="dimmed">The 3D view needs WebGL, which isn't available in this browser.</Text>
              </Center>
            }
            onError={(e) => console.error("Style map scene failed:", e)}
          >
          <Scene
            data={data}
            dims={dims}
            colorOf={(f) => colorOfGroup(groupOf(f, data, colorBy), colorBy)}
            label={(f) => groupOf(f, data, colorBy)}
            isShown={isShown}
            selectedId={selectedId}
            onSelect={select}
          />
          </ErrorBoundary>
          <Box pos="absolute" top={8} left={10} style={{ pointerEvents: "none" }}>
            <Group gap="sm">
              {legend(data, colorBy).map((g) => (
                <Group key={g.name} gap={4}>
                  <Box w={8} h={8} bg={g.color} style={{ borderRadius: "50%" }} />
                  <Text size="xs" c="dimmed">{g.name}</Text>
                </Group>
              ))}
            </Group>
          </Box>
          <Text pos="absolute" bottom={8} left={10} size="xs" c="dimmed" style={{ pointerEvents: "none" }}>
            {shownCount} of {data.fighters.length} fighters · {dims === 3 ? "drag to rotate, " : "drag to pan, "}scroll to zoom
          </Text>
        </Paper>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 3 }}>
        <FighterPanel data={data} fighter={selected} onSelect={select} />
      </Grid.Col>
    </Grid>
  );
}
