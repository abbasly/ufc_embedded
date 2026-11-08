// The "badge unlocked" notification: drops in under the header with the medal popping up, and
// leaves by itself. Badges earned close together share one.

import { CloseButton, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Medal } from "./Insights";
import { readAnnounced, starterBadges, STARTERS, writeAnnounced } from "./starter";

const SHOWN_MS = 6000;

/** ``earned``: the starter badges so far, undefined until they're known. */
export function StarterToast({ earned, guest }: { earned: string[] | undefined; guest: boolean }) {
  const [batch, setBatch] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);

  const list = earned?.join(",");
  useEffect(() => {
    if (list === undefined) return;
    const announced = readAnnounced();
    const fresh = list.split(",").filter((k) => k && !announced.has(k));
    if (!fresh.length) return;
    fresh.forEach((k) => announced.add(k));
    writeAnnounced(announced);
    setLeaving(false);
    setBatch((shown) => [...shown, ...fresh.filter((k) => !shown.includes(k))]);
  }, [list]);

  useEffect(() => {
    if (!batch.length) return;
    const id = window.setTimeout(() => setLeaving(true), SHOWN_MS);
    return () => window.clearTimeout(id);
  }, [batch]);

  if (!batch.length) return null;
  const medals = starterBadges(batch).filter((b) => b.earned);
  const single = medals.length === 1 ? STARTERS.find((s) => s.key === medals[0]!.key) : undefined;
  return (
    <div className="starter-toast-wrap">
      <div
        className="starter-toast"
        role="status"
        data-leaving={leaving || undefined}
        onAnimationEnd={(e) => {
          if (leaving && e.target === e.currentTarget) {
            setBatch([]);
            setLeaving(false);
          }
        }}
      >
        <div className="starter-toast-medals">
          {medals.slice(0, 3).map((b) => (
            <div key={b.key} className="badge-tile" data-badge={b.key} data-earned>
              <Medal badge={b} />
            </div>
          ))}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" fw={800} c="yellow.4" tt="uppercase" style={{ letterSpacing: "0.1em" }}>
            {single ? "Badge unlocked" : `${medals.length} badges unlocked`}
          </Text>
          <Text fw={800} lh={1.25}>
            {single ? single.name : medals.map((b) => b.name).join(" · ")}
          </Text>
          <Text size="xs" c="dimmed">
            {guest ? "Save your picks to keep it." : <Link to="/me" className="starter-toast-link">See your badges →</Link>}
          </Text>
        </div>
        <CloseButton size="sm" variant="transparent" c="gray.5" aria-label="Dismiss" onClick={() => setLeaving(true)} />
        <div className="starter-toast-time" key={batch.length} aria-hidden />
      </div>
    </div>
  );
}
