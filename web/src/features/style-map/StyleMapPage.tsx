import { Alert, Box, Button, Center, CloseButton, Grid, Group, Loader, MultiSelect, Paper, SegmentedControl, Select, Stack, Switch, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import "./StyleMap.css";

import { useCallback, useMemo, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useSearchParams } from "react-router-dom";

import { useStyleMap } from "../../data/client";
import type { Fighter, LayoutId, StyleMapData } from "../../data/types";
import { ChampionsStrip } from "./ChampionsStrip";
import { MathBar, MathDetails } from "./FighterMath";
import { chain, closest, combine, formatTerms, hasMath, isStyleRef, parseTerms, place, PRESETS, presetTerms, styleRef, type Term, termName, termVector } from "./mathModel";
import type { MathView } from "./MathArrows";
import { FighterPanel } from "./FighterPanel";
import { type ColorBy, type Dims, SHOW_OPTIONS, type Scope, type Show, WEIGHT_CLASSES, colorOfGroup, groupOf, legend, positionOf, similarTo } from "./model";
import { Scene } from "./Scene";

// What the current layout is, shown next to the plot.
const METHOD_NOTE: Record<LayoutId, string> = {
  axes: "Style axes: each axis mixes a few stats into a grappling, striking or defence score",
  similarity: "t-SNE: nearby means similar, the axes have no meaning",
};

export default function StyleMapPage() {
  const { data, error, isPending } = useStyleMap();
  const [params, setParams] = useSearchParams();
  const [layout, setLayout] = useState<LayoutId>("axes");
  const [dims, setDims] = useState<Dims>(3);
  const [colorBy, setColorBy] = useState<ColorBy>("style");
  const [show, setShow] = useState<Show>("all");
  const [weightClasses, setWeightClasses] = useState<string[]>([]);
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([]); // toggled via the legend
  const [highlightChampions, setHighlightChampions] = useState(true);
  const [scope, setScope] = useState<Scope>("all"); // similar fighters: anyone, or same division
  const [focusId, setFocusId] = useState<string | null>(null); // a similar fighter being hovered
  const [similarView, setSimilarView] = useState(true); // map shows only the selection's top 5
  const narrow = useMediaQuery("(max-width: 480px)");
  // Fighter math lives in the address too (?math=alex-pereira,-s:0,+s:2), so a sum can be shared.
  // It's what the page opens with ("default": the first preset, once the data is in), unless
  // the address asks for a fighter.
  const [mathTerms, setMathTerms] = useState<Term[] | null | "default">(() =>
    params.has("math") ? parseTerms(params.get("math")) : params.has("fighter") ? null : "default",
  );
  const [sameDivision, setSameDivision] = useState(false);
  const [replays, setReplays] = useState(0);
  const changeTerms = useCallback(
    (terms: Term[] | null) => {
      setMathTerms(terms);
      if (!terms) return setParams({}, { replace: true });
      if (terms.every((t) => t.ref)) setParams({ math: formatTerms(terms) }, { replace: true });
    },
    [setParams],
  );

  // Selected fighter lives in the URL (?fighter=islam-makhachev) so it can be shared.
  const selectedId = params.get("fighter");
  const select = useCallback(
    (id: string | null) => {
      if (id) setMathTerms(null); // a fighter takes over from the sum
      setFocusId(null);
      setSimilarView(true); // picking a fighter always opens their top 5; × closes it
      setParams(id ? { fighter: id } : {}, { replace: true });
    },
    [setParams],
  );

  const math = useMemo(() => {
    if (!data || !hasMath(data) || !mathTerms) return null;
    const terms = mathTerms === "default" ? PRESETS.map((p) => presetTerms(data, p)).find((t) => t) : mathTerms;
    if (!terms) return null;
    if (terms.length < 2 || terms.some((t) => !t.ref)) return { terms, result: null, matches: [], view: null };
    const result = combine(data, terms);
    const points = chain(data, terms, dims);
    if (!result || !points) return { terms, result: null, matches: [], view: null };
    const first = data.fighters.find((f) => f.id === terms[0]!.ref);
    const exclude = new Set(terms.map((t) => t.ref));
    const matches = closest(data, result, exclude, 3, sameDivision ? first?.weight_class : undefined);
    const view: MathView = {
      key: `${formatTerms(terms)}|${dims}|${sameDivision}|${replays}`,
      points,
      terms: terms.map((t) => {
        const f = isStyleRef(t.ref) ? undefined : data.fighters.find((x) => x.id === t.ref);
        const name = termName(data, t.ref);
        return {
          ref: t.ref,
          name,
          sign: t.sign,
          style: !f,
          color: f ? colorOfGroup(groupOf(f, data, "style"), "style") : colorOfGroup(name, "style"),
          image: f?.image?.url ?? null,
          at: f ? positionOf(f, "axes", dims) : place(data.math, termVector(data, t.ref)!, dims),
        };
      }),
      matches: matches.map((m) => ({ ...m, at: positionOf(m.fighter, "axes", dims) })),
    };
    return { terms, result, matches, view };
  }, [data, mathTerms, dims, sameDivision, replays]);

  if (isPending) return <Center h="60vh"><Loader /></Center>;
  if (error) return <Alert color="red" title="Could not load Fighter Lab">{error.message}</Alert>;

  const mathReady = hasMath(data);
  const mathOpen = mathReady && math !== null;
  // Start a sum from the fighter being looked at (their style swapped for another), or a preset.
  const openMath = () => {
    const f = data.fighters.find((x) => x.id === selectedId);
    if (f) {
      const other = data.clusters.find((c) => c.id !== f.cluster)!;
      return changeTerms([
        { sign: 1, ref: f.id },
        { sign: -1, ref: styleRef(f.cluster) },
        { sign: 1, ref: styleRef(other.id) },
      ]);
    }
    changeTerms(PRESETS.map((p) => presetTerms(data, p)).find((t) => t) ?? [{ sign: 1, ref: "" }, { sign: 1, ref: "" }]);
  };
  const shownLayout: LayoutId = mathOpen ? "axes" : layout; // the arrows only add up on Style axes

  const selected = data.fighters.find((f) => f.id === selectedId) ?? null;
  // Worked out from the embedding (data/styleMap.ts); kept stable so the camera doesn't refly.
  const neighbours = useMemo(() => similarTo(data, selected, scope), [data, selected, scope]);
  const showSimilar = similarView && selected !== null;
  const present = new Set(data.fighters.map((f) => f.weight_class));
  const isShown = (f: Fighter) =>
    SHOW_OPTIONS[show].test(f) &&
    (weightClasses.length === 0 || weightClasses.includes(f.weight_class)) &&
    !hiddenGroups.includes(groupOf(f, data, colorBy));
  const toggleGroup = (g: string) =>
    setHiddenGroups(hiddenGroups.includes(g) ? hiddenGroups.filter((x) => x !== g) : [...hiddenGroups, g]);
  const shownCount = data.fighters.filter(isShown).length;

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 3 }} order={{ base: mathOpen ? 3 : 2, md: 1 }}>
        <Stack gap="md">
          <ChampionsStrip data={data} selectedId={selectedId} onSelect={select} />
          <Switch
            label="Highlight champions on the map"
            checked={highlightChampions}
            onChange={(e) => setHighlightChampions(e.currentTarget.checked)}
            size="sm"
          />
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
              size={narrow ? "xs" : "sm"}
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
          <LayoutInfo data={data} layout={layout} dims={dims} />
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 1, md: 2 }}>
        <Group justify="space-between" align="center" gap="xs" mb={6} wrap="wrap">
          <Group gap="xs" wrap="wrap">
            {mathReady && (
              <Button size="compact-sm" variant={mathOpen ? "filled" : "default"} onClick={() => (mathOpen ? changeTerms(null) : openMath())}>
                Fighter math
              </Button>
            )}
            <SegmentedControl
              size="xs"
              value={shownLayout}
              onChange={(v) => {
                // Fighter math is drawn on Style axes, where the arrows add up: another layout leaves it.
                if (v !== "axes" && mathOpen) changeTerms(null);
                setLayout(v as LayoutId);
              }}
              data={data.layouts.map((l) => ({ value: l.id, label: l.label }))}
            />
            <SegmentedControl
              size="xs"
              value={colorBy}
              onChange={(v) => {
                setColorBy(v as ColorBy);
                setHiddenGroups([]); // legend groups differ per colouring
              }}
              data={[{ value: "style", label: "Colour: style" }, { value: "weight_class", label: "Colour: weight" }]}
            />
            <SegmentedControl
              size="xs"
              value={String(dims)}
              onChange={(v) => setDims(Number(v) as Dims)}
              data={[{ value: "3", label: "3D" }, { value: "2", label: "2D" }]}
            />
          </Group>
          <Text size="xs" c="dimmed">
            {mathOpen ? "Fighter math: each arrow adds or takes away one term, on Style axes" : METHOD_NOTE[layout]}
          </Text>
        </Group>
        {/* The plot lit like the page around it: warm light from the top, a red haze below. */}
        <Paper
          withBorder
          pos="relative"
          h={{ base: "65vh", md: "calc(100vh - 150px)" }}
          style={{ overflow: "hidden", background:
              "radial-gradient(65% 50% at 50% -5%, rgba(255, 214, 160, 0.2), transparent 72%), radial-gradient(85% 42% at 50% 108%, rgba(250, 82, 82, 0.18), transparent 72%), linear-gradient(180deg, #1c1d22, #131417)" }}
        >
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
            layout={shownLayout}
            dims={dims}
            colorOf={(f) => colorOfGroup(groupOf(f, data, colorBy), colorBy)}
            label={(f) => groupOf(f, data, colorBy)}
            isShown={isShown}
            highlightChampions={highlightChampions}
            selectedId={mathOpen ? null : selectedId}
            onSelect={select}
            neighbours={showSimilar && !mathOpen ? neighbours : []}
            focusId={focusId}
            onFocus={setFocusId}
            math={mathOpen ? math?.view : null}
          />
          </ErrorBoundary>
          <Stack pos="absolute" top={8} left={10} right={10} gap={6} style={{ pointerEvents: "none" }}>
          <Group gap="sm" style={{ pointerEvents: "auto" }}>
            {legend(data, colorBy).map((g) => {
              const off = hiddenGroups.includes(g.name);
              return (
                <UnstyledButton key={g.name} onClick={() => toggleGroup(g.name)} title={off ? "Show" : "Hide"} style={{ opacity: off ? 0.35 : 1 }}>
                  <Group gap={4}>
                    <Box w={8} h={8} bg={g.color} style={{ borderRadius: "50%" }} />
                    <Text size="xs" c="dimmed" td={off ? "line-through" : undefined}>{g.name}</Text>
                  </Group>
                </UnstyledButton>
              );
            })}
          </Group>
          {selected && showSimilar && !mathOpen && (
            <Group gap={6} wrap="nowrap" align="flex-start" style={{ alignSelf: "flex-end", pointerEvents: "auto" }}>
              <Box ta="right">
                <Text size="xs" fw={600}>
                  {neighbours.length} most similar to {selected.name}
                  {scope === "division" && ` in ${selected.weight_class}`}
                </Text>
                <Text size="xs" c="dimmed">
                  ranked 1–{neighbours.length} · similarity out of 100
                </Text>
              </Box>
              <CloseButton size="sm" onClick={() => setSimilarView(false)} aria-label="Back to the full map" title="Back to the full map" />
            </Group>
          )}
          </Stack>
          <Text pos="absolute" bottom={8} left={10} size="xs" c="dimmed" style={{ pointerEvents: "none" }}>
            {shownCount} of {data.fighters.length} fighters · {dims === 3 ? "drag to rotate, " : "drag to pan, "}{narrow ? "pinch" : "scroll"} to zoom
          </Text>
        </Paper>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 3 }} order={{ base: mathOpen ? 2 : 3, md: 3 }}>
        {mathOpen && math ? (
          <Stack gap="md">
          <MathBar
            data={data}
            terms={math.terms}
            onTerms={changeTerms}
            best={math.matches[0]}
            onOpenFighter={(id) => select(id)}
            onClose={() => changeTerms(null)}
            answer={false}
          />
          <MathDetails
            data={data}
            terms={math.terms}
            result={math.result}
            matches={math.matches}
            sameDivision={sameDivision}
            onSameDivision={setSameDivision}
            onReplay={() => setReplays((r) => r + 1)}
            onOpenFighter={(id) => select(id)}
          />
          </Stack>
        ) : (
        <FighterPanel
          data={data}
          fighter={selected}
          onSelect={select}
          neighbours={neighbours}
          scope={scope}
          onScope={setScope}
          focusId={focusId}
          onFocus={setFocusId}
          onShowOnMap={showSimilar ? undefined : () => setSimilarView(true)}
        />
        )}
      </Grid.Col>
    </Grid>
  );
}

/** What the current layout's axes mean, and how faithfully it keeps similar fighters together. */
function LayoutInfo({ data, layout, dims }: { data: StyleMapData; layout: LayoutId; dims: Dims }) {
  const meta = data.layouts.find((l) => l.id === layout);
  if (!meta) return null;
  const labelOf = (key: string) => data.features.find((f) => f.key === key)?.label ?? key;
  const kept = Math.round(meta.quality[String(dims) as "2" | "3"].knn_kept * 100);

  return (
    <Stack gap={4}>
      {meta.interpretable &&
        data.axes.slice(0, dims).map((a) => (
          <Text key={a.label} size="xs" c="dimmed">
            <b>{a.label}</b>: {a.low} → {a.high}
            <br />
            <Text span size="xs" c="dimmed" fs="italic">
              from{" "}
              {Object.entries(a.weights)
                .map(([k, w]) => `${w < 0 ? "less " : ""}${labelOf(k).toLowerCase()}${Math.abs(w) > 1 ? ` (×${Math.abs(w)})` : ""}`)
                .join(", ")}
            </Text>
          </Text>
        ))}
      <Text size="xs" c="dimmed">
        Keeps {kept}% of each fighter's 10 most similar fighters (by all {data.features.length} stats) nearby in this view.
      </Text>
    </Stack>
  );
}
