// 3D/2D scatter of fighters, built on react-three-fiber + drei.
// Points are plain meshes; photos and labels are HTML pinned to 3D positions.

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { MOUSE, SphereGeometry } from "three";

import type { Fighter, StyleMapData } from "../../data/types";
import { type Dims, GOLD } from "./model";

type Vec3 = [number, number, number];

interface Props {
  data: StyleMapData;
  dims: Dims;
  colorOf: (f: Fighter) => string;
  label: (f: Fighter) => string;
  isShown: (f: Fighter) => boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const RADIUS = 0.06;
const HIT_SCALE = 2.5;
const noRaycast = () => null;
const AXIS_LENGTH = 4.5;
const LABEL_Z = [100, 0]; // keep HTML labels below the app's own overlays

const position = (f: Fighter, dims: Dims): Vec3 => [
  f.coords[0] ?? 0,
  f.coords[1] ?? 0,
  dims === 3 ? (f.coords[2] ?? 0) : 0,
];

export function Scene({ data, dims, colorOf, label, isShown, selectedId, onSelect }: Props) {
  const [hovered, setHovered] = useState<Fighter | null>(null);
  const geometry = useMemo(() => new SphereGeometry(RADIUS, 12, 12), []);

  const byId = useMemo(() => new Map(data.fighters.map((f) => [f.id, f])), [data]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const neighbourIds = new Set(selected?.neighbours.map((n) => n.id));

  return (
    // Remount on 2D/3D switch so the camera resets.
    <Canvas key={dims} camera={{ position: dims === 3 ? [7, 5, 9] : [0, 0, 11], fov: 45 }}>
      <OrbitControls
        makeDefault
        enableDamping
        enableRotate={dims === 3}
        mouseButtons={dims === 3 ? undefined : { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      />
      <Axes data={data} dims={dims} />

      {data.fighters.map((f) => {
        const isSelected = f.id === selectedId;
        const isNeighbour = neighbourIds.has(f.id);
        const shown = isShown(f) || isSelected || isNeighbour;
        const scale = isSelected ? 2.6 : isNeighbour || f.champion ? 1.7 : 1;
        return (
          <group key={f.id} position={position(f, dims)} scale={scale}>
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
                points={[position(selected, dims), position(f, dims)]}
                color="white"
                transparent
                opacity={0.35}
                lineWidth={1}
              />
            )
          );
        })}

      {data.fighters
        .filter((f) => f.champion && f.id !== selectedId && isShown(f))
        .map((f) => (
          <Html key={f.id} position={position(f, dims)} zIndexRange={LABEL_Z}>
            <ChampionLabel fighter={f} onClick={() => onSelect(f.id)} />
          </Html>
        ))}

      {selected && (
        <Html position={position(selected, dims)} zIndexRange={LABEL_Z}>
          <ChampionLabel fighter={selected} onClick={() => undefined} selected />
        </Html>
      )}

      {hovered && hovered.id !== selectedId && !hovered.champion && (
        <Html position={position(hovered, dims)} zIndexRange={LABEL_Z} style={{ pointerEvents: "none" }}>
          <div style={tooltipStyle}>
            <b>{hovered.name}</b>
            <br />
            {label(hovered)}
          </div>
        </Html>
      )}
    </Canvas>
  );
}

function ChampionLabel({ fighter, onClick, selected }: { fighter: Fighter; onClick: () => void; selected?: boolean }) {
  const color = fighter.champion ? GOLD : "white";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        transform: "translate(-50%, -130%)",
        background: "rgba(20,20,20,0.75)",
        border: `1px solid ${selected ? "white" : color}`,
        borderRadius: 999,
        padding: fighter.image ? "1px 8px 1px 1px" : "2px 8px",
        color,
        fontSize: 11,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {fighter.image && (
        <img
          src={fighter.image.url}
          alt=""
          style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", objectPosition: "top" }}
        />
      )}
      {fighter.champion ? "🏆 " : ""}
      {fighter.name}
    </button>
  );
}

function Axes({ data, dims }: { data: StyleMapData; dims: Dims }) {
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
          <group key={axis.label}>
            <Line points={[end(-1), end(1)]} color="#444" lineWidth={1} />
            <Html position={end(1.08)} center zIndexRange={LABEL_Z} style={axisLabelStyle}>
              {axis.high} →
            </Html>
            <Html position={end(-1.08)} center zIndexRange={LABEL_Z} style={axisLabelStyle}>
              ← {axis.low}
            </Html>
          </group>
        );
      })}
    </>
  );
}

const axisLabelStyle = { color: "#888", fontSize: 11, whiteSpace: "nowrap", pointerEvents: "none" } as const;

const tooltipStyle = {
  transform: "translate(-50%, -120%)",
  background: "rgba(20,20,20,0.9)",
  border: "1px solid #444",
  borderRadius: 6,
  padding: "4px 8px",
  color: "#ddd",
  fontSize: 12,
  whiteSpace: "nowrap",
} as const;
