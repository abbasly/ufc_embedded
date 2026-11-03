// 3D/2D scatter of fighters, built on react-three-fiber + drei.
// Points are plain meshes; photos and labels are HTML pinned to 3D positions.
// Selecting a fighter flies the camera to them, dims everyone else and draws a line out to
// each of their most similar fighters, who get photo labels with how alike they are.

import { useReducedMotion } from "@mantine/hooks";
import { Billboard, Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Mesh, MOUSE, SphereGeometry, Vector3 } from "three";
import type { Line2, LineSegmentsGeometry } from "three-stdlib";

import type { Fighter, LayoutId, Neighbour, StyleMapData } from "../../data/types";
import { type Box, nearestEdge, placeLabels } from "./labelLayout";
import { type Dims, GOLD, positionOf } from "./model";

type Vec3 = [number, number, number];

interface Props {
  data: StyleMapData;
  layout: LayoutId;
  dims: Dims;
  colorOf: (f: Fighter) => string;
  label: (f: Fighter) => string;
  isShown: (f: Fighter) => boolean;
  highlightChampions: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  neighbours: Neighbour[]; // the selected fighter's most similar fighters
  focusId: string | null; // a neighbour being looked at (hovered here or in the panel)
  onFocus: (id: string | null) => void;
}

const RADIUS = 0.06;
const SPIN_SPEED = 1.2; // OrbitControls units: 2 = one turn per 30 s, so ~50 s per turn
const SPIN_RESUME_MS = 3000; // start spinning again after this long without interaction
const CAMERA: Record<Dims, Vec3> = { 3: [9.6, 7.2, 12.6], 2: [0, 0, 14] };
const PORTRAIT_ZOOM_OUT = 1.4;
const HIT_SCALE = 2.5;
const noRaycast = () => null;
const AXIS_LENGTH = 4.5;
const LABEL_Z = [100, 0]; // keep HTML labels below the app's own overlays
const FLY_SECONDS = 1.1;
const DIMMED = 0.16; // opacity of fighters outside the selection's neighbourhood

export function Scene(props: Props) {
  const { data, layout, dims, colorOf, label, isShown, highlightChampions, selectedId, onSelect } = props;
  const { neighbours, focusId, onFocus } = props;
  const [hovered, setHovered] = useState<Fighter | null>(null);
  const spin = useIdleSpin();
  const geometry = useMemo(() => new SphereGeometry(RADIUS, 12, 12), []);

  const byId = useMemo(() => new Map(data.fighters.map((f) => [f.id, f])), [data]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const matchOf = new Map(neighbours.map((n) => [n.id, n.similarity]));
  const labels = useRef<HTMLDivElement>(null!);
  const overlay = useRef<Overlay>({ selected: null, items: new Map(), lines: new Map() });
  const position = (f: Fighter): Vec3 => positionOf(f, layout, dims);
  const interpretable = data.layouts.find((l) => l.id === layout)?.interpretable ?? false;

  const hover = useCallback(
    (f: Fighter | null) => {
      setHovered(f);
      document.body.style.cursor = f ? "pointer" : "";
      // Hovering one of the selection's neighbours on the map highlights it in the panel too.
      onFocus(f && matchOf.has(f.id) ? f.id : null);
    },
    // matchOf is rebuilt every render; its contents only change with the neighbours.
    [neighbours, onFocus],
  );
  const select = useCallback((id: string) => onSelect(id), [onSelect]);

  // Where the camera should look: the selection and its neighbours, or the whole map.
  const flyTarget = selected ? position(selected) : null;
  // How far out the neighbours are: the median one, so a single outlier doesn't zoom out the view.
  const spread = selected
    ? neighbours
        .map((n) => byId.get(n.id))
        .filter((f) => f !== undefined)
        .map((f) => distance(position(f), position(selected)))
        .sort((a, b) => a - b)
    : [];
  const reach = Math.max(0.8, spread[Math.floor(spread.length / 2)] ?? 0);

  return (
    // Labels render into `labels`, a React-owned layer over the canvas. drei's default target
    // (the canvas wrapper) is torn down first when the page unmounts, which made React throw
    // "removeChild: not a child" on every navigation away from this page.
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
    <Canvas
      camera={{ position: CAMERA[dims], fov: 45 }}
      onPointerDown={spin.pause}
      onPointerUp={spin.resumeLater}
      onPointerCancel={spin.resumeLater}
      onPointerMissed={() => onFocus(null)}
    >
      <CameraReset resetKey={`${layout}-${dims}`} dims={dims} />
      <FlyTo flyKey={`${selectedId}-${layout}-${dims}`} target={flyTarget} reach={reach} dims={dims} />
      <OrbitControls
        makeDefault
        enableDamping
        enableRotate={dims === 3}
        autoRotate={dims === 3 && spin.on && !selected} // hold still while a fighter is selected, so labels stay put
        autoRotateSpeed={SPIN_SPEED}
        mouseButtons={dims === 3 ? undefined : { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      />
      {/* Hidden rather than unmounted: unmounting drei <Html> here trips a React DOM error. */}
      <Axes data={data} dims={dims} hidden={!interpretable} portal={labels} />

      {data.fighters.map((f) => {
        const isSelected = f.id === selectedId;
        const isNeighbour = matchOf.has(f.id);
        const isFocused = f.id === focusId;
        const shown = isShown(f) || isSelected || isNeighbour;
        const scale = isSelected ? 2.6 : isFocused ? 2.4 : isNeighbour ? 1.8 : f.champion && highlightChampions ? 1.7 : 1;
        const opacity = !shown ? 0.1 : selected && !isSelected && !isNeighbour ? DIMMED : 0.9;
        return (
          <Dot
            key={f.id}
            fighter={f}
            position={position(f)}
            geometry={geometry}
            color={shown ? colorOf(f) : "#666"}
            opacity={opacity}
            scale={scale}
            pickable={shown}
            onSelect={select}
            onHover={hover}
          />
        );
      })}

      {selected && <Pulse key={`pulse-${selected.id}`} position={position(selected)} color={colorOf(selected)} />}

      {selected &&
        neighbours.map((n, i) => {
          const f = byId.get(n.id);
          if (!f) return null;
          const focused = n.id === focusId;
          return (
            <GrowLine
              key={`${selected.id}-${n.id}-${layout}-${dims}`}
              from={position(selected)}
              to={position(f)}
              delay={lineDelay(i)}
              color={focused ? colorOf(f) : "white"}
              opacity={focused ? 1 : focusId ? 0.12 : 0.22 + 0.3 * closeness(n.similarity)}
              width={focused ? 3 : 1 + closeness(n.similarity)}
            />
          );
        })}

      {/* Always mounted, hidden with CSS: unmounting drei <Html> trips a React DOM error. */}
      {data.fighters
        .filter((f) => f.champion)
        .map((f) => {
          const visible = highlightChampions && !selected && isShown(f);
          return (
            <Html portal={labels} key={f.id} position={position(f)} zIndexRange={LABEL_Z} style={{ display: visible ? "block" : "none", pointerEvents: "auto" }}>
              <ChampionLabel fighter={f} onClick={() => onSelect(f.id)} compact />
            </Html>
          );
        })}

      {selected && (
        <LabelLayout
          key={`labels-${selected.id}`}
          overlay={overlay}
          center={position(selected)}
          anchors={neighbours.flatMap((n) => {
            const f = byId.get(n.id);
            return f ? [{ id: n.id, pos: position(f) }] : [];
          })}
        />
      )}

      {hovered && hovered.id !== selectedId && !matchOf.has(hovered.id) && (
        <Html portal={labels} position={position(hovered)} zIndexRange={LABEL_Z} style={{ pointerEvents: "none" }}>
          <div style={tooltipStyle}>
            {hovered.image && <img src={hovered.image.url} alt="" style={tooltipPhotoStyle} />}
            <div>
              <b>{hovered.name}</b>
              <br />
              {label(hovered)} · {hovered.weight_class}
            </div>
          </div>
        </Html>
      )}
    </Canvas>
    <div ref={labels} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} />
    {selected && (
      <div key={selected.id} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
          {neighbours.map((n, i) => {
            const f = byId.get(n.id);
            const focused = n.id === focusId;
            return (
              f && (
                <line
                  key={n.id}
                  ref={(el) => setRef(overlay.current.lines, n.id, el)}
                  stroke={focused ? colorOf(f) : "rgba(255,255,255,0.35)"}
                  strokeWidth={focused ? 1.5 : 1}
                  style={{ animation: `nb-in 0.4s ease-out ${labelDelay(i)}s backwards`, opacity: focusId && !focused ? 0.3 : 1 }}
                />
              )
            );
          })}
        </svg>
        <div ref={(el) => void (overlay.current.selected = el)} style={placedStyle}>
          <ChampionLabel fighter={selected} onClick={() => undefined} selected placed />
        </div>
        {neighbours.map((n, i) => {
          const f = byId.get(n.id);
          return (
            f && (
              <div key={n.id} ref={(el) => setRef(overlay.current.items, n.id, el)} style={{ ...placedStyle, zIndex: n.id === focusId ? 2 : 1 }}>
                <NeighbourLabel
                  fighter={f}
                  rank={i + 1}
                  similarity={n.similarity}
                  color={colorOf(f)}
                  focused={n.id === focusId}
                  faded={focusId !== null && n.id !== focusId}
                  delay={labelDelay(i)}
                  onClick={() => onSelect(f.id)}
                  onFocus={onFocus}
                />
              </div>
            )
          );
        })}
      </div>
    )}
    </div>
  );
}

/** The neighbour labels and leader lines over the canvas, positioned by LabelLayout. */
interface Overlay {
  selected: HTMLDivElement | null;
  items: Map<string, HTMLDivElement>;
  lines: Map<string, SVGLineElement>;
}

function setRef<T>(map: Map<string, T>, id: string, el: T | null) {
  if (el) map.set(id, el);
  else map.delete(id);
}

// Off-screen until LabelLayout has placed them on the first frame.
const placedStyle = { position: "absolute", left: 0, top: 0, transform: "translate(-9999px, 0)", pointerEvents: "auto" } as const;

/** Labels appear as the line out to their fighter finishes growing (see GrowLine). */
const lineDelay = (i: number) => 0.25 + i * 0.07;
const labelDelay = (i: number) => lineDelay(i) + 0.3;

/**
 * Every frame: project the selected fighter and their neighbours to the screen, lay the
 * labels out around them (labelLayout.ts) and move the overlay's labels and leader lines
 * there. Writes straight to the DOM, so the camera can move without React re-rendering.
 */
function LabelLayout({ overlay, center, anchors }: { overlay: React.RefObject<Overlay>; center: Vec3; anchors: { id: string; pos: Vec3 }[] }) {
  const { camera, size } = useThree();
  const shown = useRef(new Map<string, Box>()); // where each label is now (it glides to its spot)
  const v = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const { selected, items, lines } = overlay.current;
    const project = (p: Vec3) => {
      v.set(p[0], p[1], p[2]).project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, behind: v.z > 1 };
    };
    const c = project(center);
    const blocked: Box[] = [];
    if (selected) {
      const box = { x: c.x - selected.offsetWidth / 2, y: c.y - selected.offsetHeight - 12, w: selected.offsetWidth, h: selected.offsetHeight };
      blocked.push(box);
      selected.style.transform = `translate(${box.x}px, ${box.y}px)`;
    }
    const placed = anchors.flatMap((a) => {
      const el = items.get(a.id);
      return el ? [{ id: a.id, el, p: project(a.pos), w: el.offsetWidth, h: el.offsetHeight }] : [];
    });
    const boxes = placeLabels(c, placed.map((l) => ({ ax: l.p.x, ay: l.p.y, w: l.w, h: l.h })), blocked, size.width, size.height);
    const glide = Math.min(1, dt * 10);
    placed.forEach((l, i) => {
      const target = boxes[i]!;
      const from = shown.current.get(l.id) ?? target;
      const box = { ...target, x: from.x + (target.x - from.x) * glide, y: from.y + (target.y - from.y) * glide };
      shown.current.set(l.id, box);
      l.el.style.transform = `translate(${box.x}px, ${box.y}px)`;
      l.el.style.visibility = l.p.behind ? "hidden" : "visible";
      const line = lines.get(l.id);
      if (line) {
        const end = nearestEdge(box, l.p.x, l.p.y);
        line.setAttribute("x1", String(l.p.x));
        line.setAttribute("y1", String(l.p.y));
        line.setAttribute("x2", String(end.x));
        line.setAttribute("y2", String(end.y));
        line.style.visibility = l.p.behind ? "hidden" : "visible";
      }
    });
  });
  return null;
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Neighbours' similarity scores mostly sit between 30 and 70; spread that over 0..1. */
const closeness = (score: number) => Math.min(1, Math.max(0, (score - 30) / 40));

interface DotProps {
  fighter: Fighter;
  position: Vec3;
  geometry: SphereGeometry;
  color: string;
  opacity: number;
  scale: number;
  pickable: boolean;
  onSelect: (id: string) => void;
  onHover: (f: Fighter | null) => void;
}

/** One fighter. Memoised: hovering re-renders the scene, but only changed dots update. */
const Dot = memo(function Dot({ fighter, position, geometry, color, opacity, scale, pickable, onSelect, onHover }: DotProps) {
  return (
    <group position={position} scale={scale}>
      <mesh geometry={geometry} raycast={noRaycast}>
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={opacity > 0.5} />
      </mesh>
      {/* Invisible, larger sphere so small dots are easy to hover and click. */}
      {pickable && (
        <mesh
          geometry={geometry}
          scale={HIT_SCALE}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(fighter.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(fighter);
          }}
          onPointerOut={() => onHover(null)}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}, (a, b) =>
  a.fighter === b.fighter && a.color === b.color && a.opacity === b.opacity && a.scale === b.scale &&
  a.pickable === b.pickable && a.onSelect === b.onSelect && a.onHover === b.onHover &&
  a.position.every((v, i) => v === b.position[i]),
);

interface GrowLineProps {
  from: Vec3;
  to: Vec3;
  delay: number; // seconds before it starts growing
  color: string;
  opacity: number;
  width: number;
}

/** A line that grows from the selected fighter out to a neighbour. */
function GrowLine({ from, to, delay, color, opacity, width }: GrowLineProps) {
  const line = useRef<Line2>(null);
  const reduceMotion = useReducedMotion();
  const t = useRef(reduceMotion ? 1 : -delay / 0.45);
  useFrame((_, dt) => {
    if (t.current >= 1 || !line.current) return;
    t.current = Math.min(1, t.current + dt / 0.45);
    const k = easeOut(Math.max(0, t.current));
    const tip = from.map((v, i) => v + (to[i]! - v) * k);
    (line.current.geometry as LineSegmentsGeometry).setPositions([...from, ...tip]);
  });
  const start = reduceMotion ? to : from; // before the first frame: nothing to see yet
  return <Line ref={line} points={[from, start]} color={color} transparent opacity={opacity} lineWidth={width} />;
}

/** A soft ring that keeps pulsing out from the selected fighter. */
function Pulse({ position, color }: { position: Vec3; color: string }) {
  const ring = useRef<Mesh>(null);
  const reduceMotion = useReducedMotion();
  useFrame(({ clock }) => {
    if (!ring.current || reduceMotion) return;
    const t = (clock.elapsedTime % 1.8) / 1.8;
    ring.current.scale.setScalar(1 + t * 2.2);
    const material = ring.current.material as { opacity: number };
    material.opacity = 0.7 * (1 - t);
  });
  return (
    <Billboard position={position}>
      <mesh ref={ring} raycast={noRaycast}>
        <ringGeometry args={[0.2, 0.24, 48]} />
        <meshBasicMaterial color={color} transparent opacity={reduceMotion ? 0.5 : 0} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

type Orbit = { target: Vector3; update: () => void };

/**
 * Glide the camera to a selected fighter, close enough to see their neighbours (``reach`` is
 * a typical one's distance), keeping the current viewing angle; back out to the whole map
 * when the selection is cleared. Dragging still works while it flies.
 */
function FlyTo({ flyKey, target, reach, dims }: { flyKey: string; target: Vec3 | null; reach: number; dims: Dims }) {
  const { camera, controls, size } = useThree();
  const reduceMotion = useReducedMotion();
  const flight = useRef<{ t: number; fromT: Vector3; toT: Vector3; fromP: Vector3; toP: Vector3 } | null>(null);
  const flown = useRef(false); // nothing to fly back from until something was selected
  const portrait = size.width < size.height;

  useEffect(() => {
    const orbit = controls as unknown as Orbit | null;
    if (!orbit || (!target && !flown.current)) return;
    flown.current = target !== null;
    const back = portrait ? PORTRAIT_ZOOM_OUT : 1;
    const toT = new Vector3(...(target ?? [0, 0, 0]));
    let toP: Vector3;
    if (target) {
      const dir = dims === 3 ? camera.position.clone().sub(orbit.target).normalize() : new Vector3(0, 0, 1);
      toP = toT.clone().add(dir.multiplyScalar(Math.min(15, Math.max(5, reach * 2.6 + 3)) * back));
    } else {
      toP = new Vector3(...CAMERA[dims]).multiplyScalar(back);
    }
    flight.current = { t: reduceMotion ? 1 : 0, fromT: orbit.target.clone(), toT, fromP: camera.position.clone(), toP };
    // Fly once per selection (or layout change), not on every re-render.
  }, [flyKey, controls]);

  useFrame((_, dt) => {
    const f = flight.current;
    const orbit = controls as unknown as Orbit | null;
    if (!f || !orbit) return;
    f.t = Math.min(1, f.t + dt / FLY_SECONDS);
    const k = easeInOut(f.t);
    orbit.target.lerpVectors(f.fromT, f.toT, k);
    camera.position.lerpVectors(f.fromP, f.toP, k);
    orbit.update();
    if (f.t >= 1) flight.current = null;
  });
  return null;
}

/**
 * Slow auto-spin that pauses while the user presses on the map (a mouse drag or a finger,
 * via pointer events) and resumes after a quiet period. Hovering and scroll-wheel zoom aren't
 * pointer presses, so they don't pause it. Off entirely for people who prefer reduced motion.
 */
function useIdleSpin() {
  const reduceMotion = useReducedMotion();
  const [idle, setIdle] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pause = useCallback(() => {
    clearTimeout(timer.current);
    setIdle(false);
  }, []);
  const resumeLater = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), SPIN_RESUME_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  return { on: idle && !reduceMotion, pause, resumeLater };
}

/**
 * Put the camera back to its default view whenever the layout or 2D/3D changes.
 * Tall, narrow plots (phones) start further back so the sides aren't cropped.
 */
function CameraReset({ resetKey, dims }: { resetKey: string; dims: Dims }) {
  const { camera, controls, size } = useThree();
  const portrait = size.width < size.height;
  useEffect(() => {
    const back = portrait ? PORTRAIT_ZOOM_OUT : 1;
    const [x, y, z] = CAMERA[dims];
    camera.position.set(x * back, y * back, z * back);
    camera.lookAt(0, 0, 0);
    const orbit = controls as unknown as { target?: { set: (x: number, y: number, z: number) => void }; update?: () => void } | null;
    orbit?.target?.set(0, 0, 0);
    orbit?.update?.();
  }, [resetKey, dims, camera, controls, portrait]);
  return null;
}

interface NeighbourLabelProps {
  fighter: Fighter;
  rank: number; // 1 = most similar
  similarity: number; // 0-100
  color: string; // their style colour
  focused: boolean;
  faded: boolean; // another neighbour is focused
  delay: number; // seconds before it fades in
  onClick: () => void;
  onFocus: (id: string | null) => void;
}

/** Photo, surname and similarity score of one of the selected fighter's most similar fighters. */
function NeighbourLabel({ fighter, rank, similarity, color, focused, faded, delay, onClick, onFocus }: NeighbourLabelProps) {
  const top = rank === 1; // the closest match stands out a little
  const photo = focused ? 26 : top ? 22 : 18;
  return (
    <button
      onClick={onClick}
      onPointerEnter={() => onFocus(fighter.id)}
      onPointerLeave={() => onFocus(null)}
      title={`#${rank} most similar: ${fighter.name}, style similarity ${similarity} / 100`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        transition: "opacity 0.15s, border-color 0.15s",
        opacity: faded ? 0.45 : 1,
        background: top ? `color-mix(in srgb, ${color} 18%, rgb(16,16,18) 82%)` : "rgba(16,16,18,0.85)",
        border: `1px solid ${focused || top ? color : "rgba(255,255,255,0.18)"}`,
        boxShadow: top ? `0 0 12px color-mix(in srgb, ${color} 45%, transparent)` : undefined,
        borderRadius: 999,
        padding: fighter.image ? "1px 7px 1px 1px" : "2px 7px",
        color: "#e9ecef",
        fontSize: focused || top ? 12 : 10.5,
        whiteSpace: "nowrap",
        cursor: "pointer",
        animation: `nb-in 0.4s ease-out ${delay}s backwards`,
      }}
    >
      {fighter.image && (
        <img
          src={fighter.image.url}
          alt=""
          style={{ width: photo, height: photo, borderRadius: "50%", objectFit: "cover", objectPosition: "top", transition: "width 0.15s, height 0.15s" }}
        />
      )}
      <span style={{ color: top ? color : "#868e96", fontWeight: 700, fontSize: "0.9em", fontVariantNumeric: "tabular-nums" }}>{rank}</span>
      <span style={{ fontWeight: 600 }}>{focused ? fighter.name : fighter.name.split(" ").at(-1)}</span>
      <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{similarity}</span>
    </button>
  );
}

interface LabelProps {
  fighter: Fighter;
  onClick: () => void;
  selected?: boolean;
  compact?: boolean; // small photo + last name, for always-on champion labels
  placed?: boolean; // positioned by LabelLayout rather than centred above its point
}

function ChampionLabel({ fighter, onClick, selected, compact, placed }: LabelProps) {
  const color = fighter.champion ? GOLD : "white";
  const photo = compact ? 16 : 22;
  return (
    <button
      onClick={onClick}
      title={fighter.name}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        transform: placed ? undefined : "translate(-50%, -130%)",
        background: "rgba(20,20,20,0.75)",
        border: `1px solid ${selected ? "white" : color}`,
        borderRadius: 999,
        padding: fighter.image ? "1px 6px 1px 1px" : "1px 6px",
        color,
        fontSize: compact ? 10 : 11,
        fontWeight: selected ? 700 : undefined,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {fighter.image && (
        <img
          src={fighter.image.url}
          alt=""
          style={{ width: photo, height: photo, borderRadius: "50%", objectFit: "cover", objectPosition: "top" }}
        />
      )}
      {fighter.champion ? "🏆 " : ""}
      {compact ? fighter.name.split(" ").at(-1) : fighter.name}
    </button>
  );
}

interface AxesProps {
  data: StyleMapData;
  dims: Dims;
  hidden: boolean;
  portal: React.RefObject<HTMLDivElement>;
}

function Axes({ data, dims, hidden, portal }: AxesProps) {
  const labelStyle = { ...axisLabelStyle, display: hidden ? "none" : "block" };
  const dirs: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return (
    <>
      {data.axes.slice(0, dims).map((axis, i) => {
        const d = dirs[i]!;
        const end = (s: number): Vec3 => [d[0] * s * AXIS_LENGTH, d[1] * s * AXIS_LENGTH, d[2] * s * AXIS_LENGTH];
        return (
          <group key={axis.label} visible={!hidden}>
            <Line points={[end(-1), end(1)]} color="#444" lineWidth={1} />
            <Html portal={portal} position={end(1.08)} center zIndexRange={LABEL_Z} style={labelStyle}>
              {axis.high} →
            </Html>
            <Html portal={portal} position={end(-1.08)} center zIndexRange={LABEL_Z} style={labelStyle}>
              ← {axis.low}
            </Html>
          </group>
        );
      })}
    </>
  );
}

const axisLabelStyle = { color: "#888", fontSize: 11, whiteSpace: "nowrap", pointerEvents: "none" } as const;

const tooltipPhotoStyle = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  objectFit: "cover",
  objectPosition: "top",
} as const;

const tooltipStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  transform: "translate(-50%, -120%)",
  background: "rgba(20,20,20,0.9)",
  border: "1px solid #444",
  borderRadius: 6,
  padding: "4px 8px",
  color: "#ddd",
  fontSize: 12,
  whiteSpace: "nowrap",
} as const;
