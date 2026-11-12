// Fighter math drawn on the map: an arrow per term, one after another from the first term's
// point, ending where the sum sits; then a ring at the sum and a line to the closest real
// fighter. Everything is placed by mathModel.chain, so the arrows add up for real.

import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { Billboard, Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, type Mesh, Vector3 } from "three";
import type { Line2, LineSegmentsGeometry } from "three-stdlib";

import type { Fighter } from "../../data/types";
import type { Vec3 } from "./mathModel";

export const PLUS = "#69db7c";
export const MINUS = "#ff8787";
const SUM = "#ffd43b";

const START = 0.35; // seconds before the first arrow
const STEP = 0.85; // seconds per arrow, start to start
const GROW = 0.7; // seconds an arrow takes to grow
const LABEL_Z = [100, 0];

export interface MathTermView {
  ref: string;
  name: string;
  sign: 1 | -1;
  color: string; // its style's colour
  image: string | null;
  at: Vec3; // the term's own point: a fighter, or a style's average
  style: boolean;
}

export interface MathView {
  key: string; // a new key replays the animation
  points: Vec3[]; // the first term's point, then where each arrow ends
  terms: MathTermView[];
  matches: { fighter: Fighter; similarity: number; at: Vec3 }[];
}

/** When the arrows are done and the answer shows (seconds after the start). */
export const answerDelay = (terms: number) => START + (terms - 1) * STEP + 0.1;

export function MathArrows({ view, portal }: { view: MathView; portal: React.RefObject<HTMLDivElement> }) {
  const reduce = useReducedMotion();
  // Phones: the arrows already name each style, so the styles' own labels would only crowd.
  const narrow = useMediaQuery("(max-width: 600px)");
  const time = (s: number) => (reduce ? 0 : s);
  const sum = view.points.at(-1)!;
  const best = view.matches[0];
  const done = time(answerDelay(view.terms.length));
  return (
    <group>
      {view.points.slice(1).map((to, i) => {
        const term = view.terms[i + 1]!;
        return <Arrow key={`${view.key}-${i}`} from={view.points[i]!} to={to} color={term.sign > 0 ? PLUS : MINUS} delay={time(START + i * STEP)} />;
      })}

      <SumRing key={`${view.key}-ring`} position={sum} delay={done} />
      {best && <ToMatch key={`${view.key}-match`} from={sum} to={best.at} delay={done + 0.35} />}

      {view.terms.map((t, i) => (t.style ? null :
        <Html key={`${view.key}-term-${i}`} portal={portal} position={t.at} zIndexRange={LABEL_Z} style={{ pointerEvents: "none" }}>
          <TermChip term={t} first={i === 0} delay={i === 0 ? 0 : time(START + (i - 1) * STEP)} />
        </Html>
      ))}
      {view.points.slice(1).map((to, i) => {
        const from = view.points[i]!;
        const t = view.terms[i + 1]!;
        const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
        return (
          <Html key={`${view.key}-arrow-${i}`} portal={portal} position={mid} center zIndexRange={LABEL_Z} style={{ pointerEvents: "none" }}>
            <span style={{ ...arrowLabel, color: t.sign > 0 ? PLUS : MINUS, animationDelay: `${time(START + i * STEP + GROW * 0.5)}s` }}>
              {t.sign > 0 ? "+" : "−"} {t.style ? t.name : t.name.split(" ").at(-1)}
            </span>
          </Html>
        );
      })}
      {best && (
        <Html key={`${view.key}-best`} portal={portal} position={best.at} zIndexRange={LABEL_Z} style={{ pointerEvents: "none" }}>
          <div style={{ ...answer, animationDelay: `${done + 0.7}s` }}>
            {best.fighter.image && <img src={best.fighter.image.url} alt="" style={answerPhoto} />}
            <span style={{ color: SUM, fontWeight: 800 }}>=</span>
            <span style={{ fontWeight: 700 }}>{narrow ? best.fighter.name.split(" ").at(-1) : best.fighter.name}</span>
            <span style={{ color: SUM, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{best.similarity}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function TermChip({ term, first, delay }: { term: MathTermView; first: boolean; delay: number }) {
  return (
    // Fighters' labels sit above their point, styles' below, so a fighter and a style that are
    // close together (Topuria and the volume boxers' average) don't cover each other.
    <div style={{ ...chip, borderColor: term.color, animationDelay: `${delay}s`, transform: term.style ? "translate(-50%, 45%)" : chip.transform }}>
      {!first && <span style={{ color: term.sign > 0 ? PLUS : MINUS, fontWeight: 800 }}>{term.sign > 0 ? "+" : "−"}</span>}
      {term.image && <img src={term.image} alt="" style={chipPhoto} />}
      <span>{term.name}</span>
      {term.style && <span style={{ color: "#868e96", fontSize: "0.85em" }}>avg</span>}
    </div>
  );
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const UP = new Vector3(0, 1, 0);
const HEAD = 0.4; // arrowhead length
const WIDTH = 0.17; // half the arrowhead's width

/** One term's arrow, growing from where the sum so far is to where it goes next. Its head is a
 * flat triangle turned to face the camera, so it reads like an arrow drawn on paper from any
 * angle. */
function Arrow({ from, to, color, delay }: { from: Vec3; to: Vec3; color: string; delay: number }) {
  const line = useRef<Line2>(null);
  const glow = useRef<Line2>(null);
  const head = useRef<Mesh>(null);
  const t = useRef(delay > 0 ? -delay / GROW : 1);
  const { dir, length } = useMemo(() => {
    const d = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = d.length();
    return { dir: len > 0 ? d.normalize() : UP.clone(), length: len };
  }, [from, to]);
  const size = Math.min(1, length / (HEAD * 2.5)); // short arrows get a smaller head
  const triangle = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
    return g;
  }, []);
  const tip = useMemo(() => new Vector3(), []);
  const side = useMemo(() => new Vector3(), []);

  useFrame(({ camera }, dt) => {
    if (t.current < 1) t.current = Math.min(1, t.current + dt / GROW);
    const k = easeInOut(Math.max(0, t.current));
    tip.set(...from).addScaledVector(dir, length * k);
    const len = HEAD * size * Math.min(1, k * 4);
    const base = tip.clone().addScaledVector(dir, -len);
    if (t.current < 1 || k === 1) {
      // The line stops at the head's base, so the head makes the point.
      for (const l of [line.current, glow.current]) (l?.geometry as LineSegmentsGeometry | undefined)?.setPositions([...from, base.x, base.y, base.z]);
    }
    // Across the arrow and facing the camera: the head turns as the map does.
    side.copy(camera.position).sub(tip).cross(dir);
    if (side.lengthSq() < 1e-9) side.set(1, 0, 0);
    side.normalize().multiplyScalar(WIDTH * size);
    const pos = triangle.getAttribute("position") as BufferAttribute;
    pos.setXYZ(0, tip.x, tip.y, tip.z);
    pos.setXYZ(1, base.x + side.x, base.y + side.y, base.z + side.z);
    pos.setXYZ(2, base.x - side.x, base.y - side.y, base.z - side.z);
    pos.needsUpdate = true;
    triangle.computeBoundingSphere();
    if (head.current) head.current.visible = k > 0.03;
  });
  const grown = t.current >= 1;
  const end = grown ? new Vector3(...to).addScaledVector(dir, -HEAD * size) : new Vector3(...from);
  return (
    <>
      {/* A soft glow under the line, a dot where it starts, then the line and its head. */}
      <Line ref={glow} points={[from, [end.x, end.y, end.z]]} color={color} lineWidth={14} transparent opacity={0.18} depthTest={false} renderOrder={1} />
      <mesh position={from} renderOrder={3} raycast={() => null}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <Line ref={line} points={[from, [end.x, end.y, end.z]]} color={color} lineWidth={5} depthTest={false} renderOrder={2} />
      <mesh ref={head} geometry={triangle} visible={grown} renderOrder={3} raycast={() => null} frustumCulled={false}>
        <meshBasicMaterial color={color} side={DoubleSide} depthTest={false} transparent />
      </mesh>
    </>
  );
}

/** Where the sum lands: a gold point with a ring pulsing out of it, once the arrows are done. */
function SumRing({ position, delay }: { position: Vec3; delay: number }) {
  const ring = useRef<Mesh>(null);
  const dot = useRef<Mesh>(null);
  const start = useRef<number | null>(null);
  const reduce = useReducedMotion();
  useFrame(({ clock }) => {
    start.current ??= clock.elapsedTime;
    const since = clock.elapsedTime - start.current - delay;
    const shown = since >= 0;
    if (dot.current) dot.current.visible = shown;
    if (!ring.current) return;
    ring.current.visible = shown;
    if (!shown || reduce) return;
    const k = (since % 1.6) / 1.6;
    ring.current.scale.setScalar(1 + k * 2.4);
    (ring.current.material as { opacity: number }).opacity = 0.8 * (1 - k);
  });
  return (
    <group position={position}>
      <mesh ref={dot} visible={false} renderOrder={4} raycast={() => null}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshBasicMaterial color={SUM} depthTest={false} transparent />
      </mesh>
      <Billboard>
        <mesh ref={ring} visible={false} raycast={() => null}>
          <ringGeometry args={[0.2, 0.25, 48]} />
          <meshBasicMaterial color={SUM} transparent opacity={reduce ? 0.6 : 0} depthWrite={false} depthTest={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

/** From the sum to the closest real fighter: the sum rarely lands right on someone. */
function ToMatch({ from, to, delay }: { from: Vec3; to: Vec3; delay: number }) {
  const line = useRef<Line2>(null);
  const t = useRef(delay > 0 ? -delay / 0.45 : 1);
  useFrame((_, dt) => {
    if (t.current >= 1 || !line.current) return;
    t.current = Math.min(1, t.current + dt / 0.45);
    const k = Math.max(0, t.current);
    (line.current.geometry as LineSegmentsGeometry).setPositions([...from, ...from.map((v, i) => v + (to[i]! - v) * k)]);
  });
  return <Line ref={line} points={[from, t.current >= 1 ? to : from]} color={SUM} lineWidth={1.5} transparent opacity={0.8} depthTest={false} renderOrder={2} />;
}

const chip = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  transform: "translate(-50%, -135%)",
  background: "rgba(16,16,18,0.88)",
  border: "1px solid",
  borderRadius: 999,
  padding: "1px 8px 1px 2px",
  color: "#e9ecef",
  fontSize: 11.5,
  whiteSpace: "nowrap",
  animation: "nb-in 0.4s ease-out backwards",
} as const;
const chipPhoto = { width: 20, height: 20, borderRadius: "50%", objectFit: "cover", objectPosition: "top" } as const;
const arrowLabel = {
  display: "block",
  padding: "0 6px",
  borderRadius: 6,
  background: "rgba(16,16,18,0.75)",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
  animation: "nb-in 0.4s ease-out backwards",
} as const;
const answer = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  transform: "translate(-50%, 35%)",
  background: "color-mix(in srgb, #ffd43b 16%, rgb(16,16,18) 84%)",
  border: "1px solid #ffd43b",
  boxShadow: "0 0 16px rgba(255, 212, 59, 0.35)",
  borderRadius: 999,
  padding: "2px 10px 2px 2px",
  color: "#fff",
  fontSize: 13,
  whiteSpace: "nowrap",
  animation: "nb-in 0.5s ease-out backwards",
} as const;
const answerPhoto = { width: 26, height: 26, borderRadius: "50%", objectFit: "cover", objectPosition: "top" } as const;
