// 3D/2D scatter of fighters, built on react-three-fiber + drei.
// Points are plain meshes; photos and labels are HTML pinned to 3D positions.

import { useReducedMotion } from "@mantine/hooks";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOUSE, SphereGeometry } from "three";

import type { Fighter, LayoutId, StyleMapData } from "../../data/types";
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

export function Scene({ data, layout, dims, colorOf, label, isShown, highlightChampions, selectedId, onSelect }: Props) {
  const [hovered, setHovered] = useState<Fighter | null>(null);
  const spin = useIdleSpin();
  const geometry = useMemo(() => new SphereGeometry(RADIUS, 12, 12), []);

  const byId = useMemo(() => new Map(data.fighters.map((f) => [f.id, f])), [data]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const neighbourIds = new Set(selected?.neighbours.map((n) => n.id));
  const position = (f: Fighter): Vec3 => positionOf(f, layout, dims);
  const interpretable = data.layouts.find((l) => l.id === layout)?.interpretable ?? false;

  return (
    <Canvas
      camera={{ position: CAMERA[dims], fov: 45 }}
      onPointerDown={spin.pause}
      onPointerUp={spin.resumeLater}
      onPointerCancel={spin.resumeLater}
    >
      <CameraReset resetKey={`${layout}-${dims}`} dims={dims} />
      <OrbitControls
        makeDefault
        enableDamping
        enableRotate={dims === 3}
        autoRotate={dims === 3 && spin.on}
        autoRotateSpeed={SPIN_SPEED}
        mouseButtons={dims === 3 ? undefined : { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      />
      {/* Hidden rather than unmounted: unmounting drei <Html> here trips a React DOM error. */}
      <Axes data={data} dims={dims} hidden={!interpretable} />

      {data.fighters.map((f) => {
        const isSelected = f.id === selectedId;
        const isNeighbour = neighbourIds.has(f.id);
        const shown = isShown(f) || isSelected || isNeighbour;
        const scale = isSelected ? 2.6 : isNeighbour || (f.champion && highlightChampions) ? 1.7 : 1;
        return (
          <group key={f.id} position={position(f)} scale={scale}>
            <mesh geometry={geometry} raycast={noRaycast}>
              <meshBasicMaterial
                color={shown ? colorOf(f) : "#666"}
                transparent
                opacity={shown ? 0.9 : 0.1}
              />
            </mesh>
            {/* Invisible, larger sphere so small dots are easy to hover and click. */}
            {shown && (
              <mesh
                geometry={geometry}
                scale={HIT_SCALE}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(f.id);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHovered(f);
                  document.body.style.cursor = "pointer";
                }}
                onPointerOut={() => {
                  setHovered(null);
                  document.body.style.cursor = "";
                }}
              >
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}

      {selected &&
        selected.neighbours.map((n) => {
          const f = byId.get(n.id);
          return (
            f && (
              <Line
                key={n.id}
                points={[position(selected), position(f)]}
                color="white"
                transparent
                opacity={0.35}
                lineWidth={1}
              />
            )
          );
        })}

      {/* Always mounted, hidden with CSS: unmounting drei <Html> trips a React DOM error. */}
      {data.fighters
        .filter((f) => f.champion)
        .map((f) => {
          const visible = highlightChampions && f.id !== selectedId && isShown(f);
          return (
            <Html key={f.id} position={position(f)} zIndexRange={LABEL_Z} style={{ display: visible ? "block" : "none" }}>
              <ChampionLabel fighter={f} onClick={() => onSelect(f.id)} compact />
            </Html>
          );
        })}

      {selected && (
        <Html position={position(selected)} zIndexRange={LABEL_Z}>
          <ChampionLabel fighter={selected} onClick={() => undefined} selected />
        </Html>
      )}

      {hovered && hovered.id !== selectedId && (
        <Html position={position(hovered)} zIndexRange={LABEL_Z} style={{ pointerEvents: "none" }}>
          <div style={tooltipStyle}>
            {hovered.image && <img src={hovered.image.url} alt="" style={tooltipPhotoStyle} />}
            <div>
              <b>
                {hovered.champion && "🏆 "}
                {hovered.name}
              </b>
              <br />
              {label(hovered)}
            </div>
          </div>
        </Html>
      )}
    </Canvas>
  );
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

interface LabelProps {
  fighter: Fighter;
  onClick: () => void;
  selected?: boolean;
  compact?: boolean; // small photo + last name, for always-on champion labels
}

function ChampionLabel({ fighter, onClick, selected, compact }: LabelProps) {
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
        transform: "translate(-50%, -130%)",
        background: "rgba(20,20,20,0.75)",
        border: `1px solid ${selected ? "white" : color}`,
        borderRadius: 999,
        padding: fighter.image ? "1px 6px 1px 1px" : "1px 6px",
        color,
        fontSize: compact ? 10 : 11,
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

function Axes({ data, dims, hidden }: { data: StyleMapData; dims: Dims; hidden: boolean }) {
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
            <Html position={end(1.08)} center zIndexRange={LABEL_Z} style={labelStyle}>
              {axis.high} →
            </Html>
            <Html position={end(-1.08)} center zIndexRange={LABEL_Z} style={labelStyle}>
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
