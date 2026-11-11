// The Fighter math panel: build a sum of fighters and styles (A − B + C), see the closest real
// fighter to it, and what changed on the way. The map draws the same sum as arrows (MathArrows).

import { Avatar, Badge, Button, CloseButton, Group, Paper, SegmentedControl, Select, Stack, Switch, Text, Title, UnstyledButton } from "@mantine/core";
import { useState } from "react";

import type { StyleMapData, StyleMath } from "../../data/types";
import { changes, isStyleRef, MAX_TERMS, type Match, PRESETS, presetTerms, styleRef, type Term, termName } from "./mathModel";
import { MINUS, PLUS } from "./MathArrows";
import { colorOfGroup } from "./model";

interface Props {
  data: StyleMapData & { math: StyleMath };
  terms: Term[];
  onTerms: (terms: Term[]) => void;
  result: number[] | null; // the sum, once every term is filled in
  matches: Match[];
  sameDivision: boolean;
  onSameDivision: (on: boolean) => void;
  onReplay: () => void;
  onOpenFighter: (id: string) => void;
  onClose: () => void;
}

export function FighterMath({ data, terms, onTerms, result, matches, sameDivision, onSameDivision, onReplay, onOpenFighter, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const options = [
    { group: "Styles (their average fighter)", items: data.clusters.map((c) => ({ value: styleRef(c.id), label: c.name })) },
    { group: "Fighters", items: data.fighters.map((f) => ({ value: f.id, label: f.name })).sort((a, b) => a.label.localeCompare(b.label)) },
  ];
  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  const first = terms[0];
  const firstFighter = first && !isStyleRef(first.ref) ? byId.get(first.ref) : undefined;
  const firstVec = first ? (isStyleRef(first.ref) ? null : firstFighter?.vec) : null;
  const changed = result && firstVec ? changes(data, firstVec, result) : [];
  const best = matches[0];
  const set = (i: number, term: Partial<Term>) => onTerms(terms.map((t, k) => (k === i ? { ...t, ...term } : t)));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", window.location.href);
    }
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={3}>Fighter math</Title>
          <Text size="sm" c="dimmed">
            Add and take away fighting styles, the way word embeddings do with meanings.
          </Text>
        </div>
        <CloseButton onClick={onClose} aria-label="Close fighter math" />
      </Group>

      <Paper withBorder p="sm" radius="md">
        <Stack gap={8}>
          {terms.map((t, i) => (
            <Group key={i} gap={6} wrap="nowrap">
              {i === 0 ? (
                <Text w={58} size="xs" c="dimmed" ta="center">
                  Start
                </Text>
              ) : (
                <SegmentedControl
                  size="xs"
                  w={58}
                  value={String(t.sign)}
                  onChange={(v) => set(i, { sign: Number(v) as 1 | -1 })}
                  data={[
                    { value: "1", label: <span style={{ color: PLUS, fontWeight: 800 }}>+</span> },
                    { value: "-1", label: <span style={{ color: MINUS, fontWeight: 800 }}>−</span> },
                  ]}
                  aria-label={`Add or take away term ${i + 1}`}
                />
              )}
              <Select
                style={{ flex: 1, minWidth: 0 }}
                size="sm"
                searchable
                placeholder="A fighter or a style"
                data={options}
                value={t.ref || null}
                onChange={(v) => set(i, { ref: v ?? "" })}
                renderOption={({ option }) => {
                  const f = byId.get(option.value);
                  return (
                    <Group gap={8} wrap="nowrap">
                      {f ? <Avatar src={f.image?.url} size={22} radius="xl">{f.name[0]}</Avatar> : <span style={{ width: 22, textAlign: "center", color: colorOfGroup(option.label, "style") }}>◆</span>}
                      <span>{option.label}</span>
                    </Group>
                  );
                }}
                aria-label={`Term ${i + 1}`}
              />
              {i >= 2 ? (
                <CloseButton size="sm" onClick={() => onTerms(terms.filter((_, k) => k !== i))} aria-label={`Remove term ${i + 1}`} />
              ) : (
                <span style={{ width: 22 }} />
              )}
            </Group>
          ))}
          {terms.length < MAX_TERMS && (
            <Button variant="subtle" size="xs" color="gray" onClick={() => onTerms([...terms, { sign: 1, ref: "" }])}>
              + Add another
            </Button>
          )}
        </Stack>
      </Paper>

      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Try one:
        </Text>
        <Group gap={6}>
          {PRESETS.map((p) => {
            const ts = presetTerms(data, p);
            return (
              ts && (
                <UnstyledButton key={p.label} className="math-chip" onClick={() => onTerms(ts)}>
                  {p.label}
                </UnstyledButton>
              )
            );
          })}
        </Group>
      </div>

      {result && best ? (
        <Stack gap="xs">
          <UnstyledButton className="math-answer" onClick={() => onOpenFighter(best.fighter.id)} title={`Open ${best.fighter.name} on the map`}>
            <Group wrap="nowrap" gap="sm">
              <Text fz={30} fw={800} c="yellow.4" lh={1}>
                =
              </Text>
              <Avatar src={best.fighter.image?.url} size={54} radius="xl">
                {best.fighter.name[0]}
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <Text fw={800} fz="lg" lh={1.2} truncate>
                  {best.fighter.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {best.fighter.weight_class} · {data.clusters.find((c) => c.id === best.fighter.cluster)?.name}
                </Text>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <Text fw={800} fz="xl" c="yellow.4" lh={1} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {best.similarity}
                </Text>
                <Text size="10px" c="dimmed">
                  match /100
                </Text>
              </div>
            </Group>
          </UnstyledButton>
          {best.similarity < 30 && (
            <Text size="xs" c="dimmed">
              Nobody fights quite like that: the sum lands far from every real fighter, so this is only the least unlike.
            </Text>
          )}
          {matches.length > 1 && (
            <Group gap={6}>
              <Text size="xs" c="dimmed">
                Also close:
              </Text>
              {matches.slice(1).map((m) => (
                <UnstyledButton key={m.fighter.id} className="math-chip" onClick={() => onOpenFighter(m.fighter.id)}>
                  {m.fighter.name} <b>{m.similarity}</b>
                </UnstyledButton>
              ))}
            </Group>
          )}
          {changed.length > 0 && firstFighter && (
            <Group gap={6}>
              <Text size="xs" c="dimmed">
                Next to {firstFighter.name.split(" ").at(-1)}:
              </Text>
              {changed.map((c) => (
                <Badge key={c.label} variant="light" color={c.up ? "green" : "red"} radius="sm">
                  {c.up ? "↑" : "↓"} {c.label}
                </Badge>
              ))}
            </Group>
          )}
          {firstFighter && (
            <Switch size="sm" label={`Only ${firstFighter.weight_class}`} checked={sameDivision} onChange={(e) => onSameDivision(e.currentTarget.checked)} />
          )}
          <Group gap="xs" grow>
            <Button variant="light" size="xs" onClick={onReplay}>
              Replay arrows
            </Button>
            <Button variant="default" size="xs" onClick={copy}>
              {copied ? "Link copied" : "Copy link"}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Pick at least two terms to see who comes out.
        </Text>
      )}

      <Text size="xs" c="dimmed">
        How it works: each fighter is their {data.features.length} style stats, standardised, and a style is the
        average of its fighters. The sum is worked out in all {data.features.length} stats and the answer is the real
        fighter closest to it ({termName(data, first?.ref ?? "")} and the other terms don't count). On the Style
        axes the arrows add up exactly, but they show only 3 combinations of the stats, so the answer can sit a
        little off the arrow's tip.
      </Text>
    </Stack>
  );
}
