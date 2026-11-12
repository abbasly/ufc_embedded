// Fighter math, the heart of Fighter Lab: build a sum of fighters and styles (A − B + C) in the
// bar across the top, and see the closest real fighter to it, with the details beside the map.
// The map draws the same sum as arrows (MathArrows).

import { Avatar, Badge, Button, CloseButton, Group, Paper, Select, Stack, Switch, Text, UnstyledButton } from "@mantine/core";
import { useState } from "react";

import type { StyleMapData, StyleMath } from "../../data/types";
import { changes, isStyleRef, MAX_TERMS, type Match, PRESETS, presetTerms, styleRef, type Term } from "./mathModel";
import { MINUS, PLUS } from "./MathArrows";
import { colorOfGroup } from "./model";

type MathData = StyleMapData & { math: StyleMath };

interface BarProps {
  data: MathData;
  terms: Term[];
  onTerms: (terms: Term[]) => void;
  best: Match | undefined;
  onOpenFighter: (id: string) => void;
  onClose: () => void;
  answer?: boolean; // show the answer at the end of the sum (off when MathDetails shows it)
}

/** The sum, written out across the page: terms, the signs between them, and the answer. */
export function MathBar({ data, terms, onTerms, best, onOpenFighter, onClose, answer = true }: BarProps) {
  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  const set = (i: number, term: Partial<Term>) => onTerms(terms.map((t, k) => (k === i ? { ...t, ...term } : t)));
  // Each fighter or style can be in the sum once: adding a style twice only pushes the sum off
  // the map, and adding then taking away the same one cancels out.
  const options = (i: number) => {
    const used = new Set(terms.filter((_, k) => k !== i).map((t) => t.ref));
    return [
      { group: "Styles (their average fighter)", items: data.clusters.map((c) => ({ value: styleRef(c.id), label: c.name, disabled: used.has(styleRef(c.id)) })) },
      {
        group: "Fighters",
        items: data.fighters
          .map((f) => ({ value: f.id, label: f.name, disabled: used.has(f.id) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ];
  };
  const icon = (ref: string) => {
    if (!ref) return null;
    const f = byId.get(ref);
    if (f) return <Avatar src={f.image?.url} size={26} radius="xl">{f.name[0]}</Avatar>;
    const name = data.clusters.find((c) => styleRef(c.id) === ref)?.name ?? "";
    return <span style={{ color: colorOfGroup(name, "style"), fontSize: 16 }}>◆</span>;
  };

  return (
    <Paper className="math-bar" p={{ base: "sm", sm: "md" }} radius="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <div>
          <Text fw={800} fz="lg" lh={1.2}>
            Fighter math
          </Text>
          <Text size="sm" c="dimmed">
            Add and take away fighting styles, the way word embeddings do with meanings.
          </Text>
        </div>
        <CloseButton onClick={onClose} aria-label="Close fighter math" title="Back to the plain map" />
      </Group>

      <div className="math-equation">
        {terms.map((t, i) => (
          <div key={i} className="math-term-wrap">
            {i > 0 && (
              <UnstyledButton
                className="math-sign"
                data-sign={t.sign > 0 ? "plus" : "minus"}
                onClick={() => set(i, { sign: t.sign > 0 ? -1 : 1 })}
                aria-label={t.sign > 0 ? "Adding: switch to taking away" : "Taking away: switch to adding"}
                title="Switch between adding and taking away"
              >
                {t.sign > 0 ? "+" : "−"}
              </UnstyledButton>
            )}
            <Select
              className="math-term"
              size="md"
              radius="md"
              searchable
              placeholder={i === 0 ? "Start with a fighter" : "A fighter or a style"}
              data={options(i)}
              value={t.ref || null}
              onChange={(v) => set(i, { ref: v ?? "" })}
              leftSection={icon(t.ref)}
              rightSection={i >= 2 ? <CloseButton size="sm" onClick={() => onTerms(terms.filter((_, k) => k !== i))} aria-label={`Remove term ${i + 1}`} /> : undefined}
              rightSectionPointerEvents={i >= 2 ? "auto" : "none"}
              renderOption={({ option }) => (
                <Group gap={8} wrap="nowrap">
                  {icon(option.value)}
                  <span>{option.label}</span>
                </Group>
              )}
              aria-label={`Term ${i + 1}`}
            />
          </div>
        ))}
        {terms.length < MAX_TERMS && (
          <Button variant="default" radius="md" size="md" onClick={() => onTerms([...terms, { sign: 1, ref: "" }])}>
            + Add
          </Button>
        )}
        {answer && <span className="math-eq">=</span>}
        {!answer ? null : best ? (
          <UnstyledButton className="math-result" onClick={() => onOpenFighter(best.fighter.id)} title={`Open ${best.fighter.name} on the map`}>
            <Avatar src={best.fighter.image?.url} size={40} radius="xl">
              {best.fighter.name[0]}
            </Avatar>
            <span style={{ minWidth: 0 }}>
              <Text fw={800} lh={1.2} truncate>
                {best.fighter.name}
              </Text>
              <Text size="xs" c="dimmed">
                {best.similarity}/100 match
              </Text>
            </span>
          </UnstyledButton>
        ) : (
          <Text c="dimmed" size="sm">
            Pick at least two terms
          </Text>
        )}
      </div>

      <Group gap={6} mt="sm">
        <Text size="xs" c="dimmed">
          Try:
        </Text>
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
    </Paper>
  );
}

interface DetailProps {
  data: MathData;
  terms: Term[];
  result: number[] | null;
  matches: Match[];
  sameDivision: boolean;
  onSameDivision: (on: boolean) => void;
  onReplay: () => void;
  onOpenFighter: (id: string) => void;
}

/** Beside the map: the answer up close, what changed, and how it works. */
export function MathDetails({ data, terms, result, matches, sameDivision, onSameDivision, onReplay, onOpenFighter }: DetailProps) {
  const [copied, setCopied] = useState(false);
  const first = terms[0];
  const firstFighter = first && !isStyleRef(first.ref) ? data.fighters.find((f) => f.id === first.ref) : undefined;
  const changed = result && firstFighter?.vec ? changes(data, firstFighter.vec, result) : [];
  const best = matches[0];

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
      {result && best ? (
        <>
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
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Pick at least two terms in the bar above to see who comes out.
        </Text>
      )}

      <Text size="xs" c="dimmed">
        <span style={{ color: PLUS, fontWeight: 700 }}>+</span> adds a fighter's or style's way of fighting,{" "}
        <span style={{ color: MINUS, fontWeight: 700 }}>−</span> takes it away. Each fighter is their {data.features.length}{" "}
        style stats, standardised, and a style is the average of its fighters. The sum is worked out in all{" "}
        {data.features.length} stats and the answer is the real fighter closest to it (the terms themselves don't
        count). On the Style axes the arrows add up exactly, but they show only 3 combinations of the stats, so the
        answer can sit a little off the arrow's tip.
      </Text>
    </Stack>
  );
}
