// A heavy bag you can punch, drawn as a layer in front of a page section: a 40 kg bag
// on a rope, simulated with Rapier (via @react-three/rapier). A click applies an
// impulse at the exact point hit, so off-centre punches spin it as well as swing it. Punch
// power comes from how fast the pointer was moving into the click.
//
// The canvas itself ignores the pointer, so the content under it stays usable; events come
// from the section, and a click that hits a bag punches it. A bag swinging in front of the
// section's content (marked data-content) takes the click, so the content under it doesn't.

import { ActionIcon, Box, Group, Text } from "@mantine/core";
import { Billboard } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  CylinderCollider,
  interactionGroups,
  Physics,
  type RapierRigidBody,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
} from "@react-three/rapier";
import { type RefObject, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { bagProfile, leatherTexture } from "./leather";
import { VerletRope } from "./rope";
import { thud } from "./thud";

const ANCHOR_Y = 2.45;
const ROPE = 0.6; // rope length (m)
const ROPE_RADIUS = 0.011;
const BAG_HALF = 0.5; // half the bag's straight section (1.4 m bag overall)
const BAG_RADIUS = 0.22;
const BAG_MASS = 40; // kg, a typical heavy bag
const TOP = BAG_HALF + BAG_RADIUS; // bag top, from its centre
const STRAP_RISE = 0.16; // the straps meet this far above the top, under the rope
const BAG_Y = ANCHOR_Y - ROPE - TOP - STRAP_RISE;
// Speed limits, so a flurry of punches can't launch the bag over the mount.
const MAX_SPEED = 3; // m/s
const MAX_SPIN = 5; // rad/s
const NO_CONTACTS = interactionGroups(0, []); // nothing here needs to collide
const CAMERA_Z = 6; // far enough back that the bag stays a background element

/** Impulse (N·s) for a punch of power 0..1: a jab to a full swing. */
const impulseFor = (power: number) => 40 + 70 * power;

interface Hit {
  point: THREE.Vector3;
  at: number;
  power: number;
}

/** The rope: a maximum distance between the ceiling mount and the bag's strap ring, so the
 *  bag swings and spins freely below it and can't be pulled away. Created on the first frame
 *  both bodies exist (the library's useRopeJoint skips it if they're registered a moment
 *  later, and the bag would fall out of view until something re-rendered). */
type ImpulseJoint = ReturnType<ReturnType<typeof useRapier>["world"]["createImpulseJoint"]>;

function useRope(a: RefObject<RapierRigidBody | null>, b: RefObject<RapierRigidBody | null>) {
  const { world, rapier } = useRapier();
  const joint = useRef<ImpulseJoint | null>(null);
  useBeforePhysicsStep(() => {
    if (joint.current || !a.current || !b.current) return;
    const data = rapier.JointData.rope(ROPE, { x: 0, y: 0, z: 0 }, { x: 0, y: TOP + STRAP_RISE, z: 0 });
    joint.current = world.createImpulseJoint(data, a.current, b.current, true);
  });
  useEffect(
    () => () => {
      const j = joint.current;
      joint.current = null;
      if (j && world.getImpulseJoint(j.handle)) world.removeImpulseJoint(j, true);
    },
    [world],
  );
}

/** Whether a pointer event landed on the page's content (behind the bag) rather than empty space. */
const overContent = (e: ThreeEvent<PointerEvent>) => !!(e.nativeEvent.target as Element | null)?.closest("[data-content]");

/** Swallow the click that follows a punch, so a card or button behind the bag doesn't get it. */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  // A drag ends without a click: don't eat the next real one.
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 600);
}

interface BagProps {
  x: number; // where the bag hangs, in world units across the scene
  onPunch: (power: number) => void;
  pointerSpeed: () => number;
}

function Bag({ x, onPunch, pointerSpeed }: BagProps) {
  const anchor = useRef<RapierRigidBody>(null);
  const bag = useRef<RapierRigidBody>(null);
  useRope(anchor, bag);
  const rope = useRef<THREE.Mesh>(null);
  const strand = useMemo(
    () => new VerletRope(new THREE.Vector3(x, ANCHOR_Y, 0), new THREE.Vector3(x, ANCHOR_Y - ROPE, 0), ROPE),
    [x],
  );
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const hit = useRef<Hit | null>(null);
  const leather = useMemo(leatherTexture, []);
  const geometry = useMemo(() => {
    const g = new THREE.LatheGeometry(bagProfile(BAG_RADIUS, TOP), 48);
    // Lathe UVs follow the outline's points; map the texture by height instead, so the
    // bands and the name sit where they're drawn rather than squashed onto the edges.
    const pos = g.attributes.position!;
    const uv = g.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (pos.getY(i) + TOP) / (2 * TOP));
    return g;
  }, []);
  // Four straps from the rim of the top up to one point under the chain.
  const straps = useMemo(
    () =>
      [0, 1, 2, 3].map((k) => {
        const angle = (k * Math.PI) / 2 + Math.PI / 4;
        const from = new THREE.Vector3(Math.cos(angle) * BAG_RADIUS * 0.7, TOP, Math.sin(angle) * BAG_RADIUS * 0.7);
        const to = new THREE.Vector3(0, TOP + STRAP_RISE, 0);
        const dir = to.clone().sub(from);
        return {
          position: from.clone().add(to).multiplyScalar(0.5),
          quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
          length: dir.length(),
        };
      }),
    [],
  );

  const punch = (e: ThreeEvent<PointerEvent>) => {
    if (!bag.current) return;
    e.stopPropagation();
    if (overContent(e)) {
      e.nativeEvent.preventDefault(); // no focus or text selection behind the bag
      swallowNextClick();
    }
    // Faster pointer into the click = harder punch (a tap is a medium punch).
    const power = Math.min(1, 0.35 + pointerSpeed() / 2500);
    const dir = e.ray.direction.clone().setY(e.ray.direction.y * 0.3).normalize();
    bag.current.applyImpulseAtPoint(dir.multiplyScalar(impulseFor(power)), e.point, true);
    hit.current = { point: e.point.clone(), at: performance.now(), power };
    onPunch(power);
  };

  useFrame((_, delta) => {
    const b = bag.current;
    if (b) {
      const v = b.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > MAX_SPEED) b.setLinvel({ x: (v.x * MAX_SPEED) / speed, y: (v.y * MAX_SPEED) / speed, z: (v.z * MAX_SPEED) / speed }, true);
      const w = b.angvel();
      const spin = Math.hypot(w.x, w.y, w.z);
      if (spin > MAX_SPIN) b.setAngvel({ x: (w.x * MAX_SPIN) / spin, y: (w.y * MAX_SPIN) / spin, z: (w.z * MAX_SPIN) / spin }, true);
      // The rope: simulated between the mount and the bag's strap ring, drawn as a tube.
      if (rope.current) {
        const q = b.rotation();
        const end = new THREE.Vector3(0, TOP + STRAP_RISE, 0)
          .applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w))
          .add(b.translation() as THREE.Vector3);
        // Small fixed steps keep the rope stable when a frame takes long.
        const steps = Math.min(4, Math.ceil(delta / (1 / 120)));
        for (let i = 0; i < steps; i++) strand.step(new THREE.Vector3(x, ANCHOR_Y, 0), end, delta / steps);
        rope.current.geometry.dispose();
        rope.current.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strand.points), 24, ROPE_RADIUS, 6);
      }
    }
    const h = hit.current;
    const t = h ? (performance.now() - h.at) / 1000 : 99;
    // Squash: the bag flattens a touch on impact and springs back.
    const squash = h ? 0.07 * h.power * Math.exp(-t * 14) * Math.cos(t * 40) : 0;
    body.current?.scale.set(1 + squash, 1 - squash * 0.6, 1 + squash);
    // Shockwave ring where the punch landed.
    if (ring.current) {
      ring.current.visible = t < 0.35;
      if (h && t < 0.35) {
        ring.current.position.copy(h.point);
        ring.current.scale.setScalar(0.2 + t * 3.2 * (0.6 + h.power));
        (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t / 0.35);
      }
    }
  });

  return (
    <>
      {/* Ceiling mount */}
      <RigidBody ref={anchor} type="fixed" position={[x, ANCHOR_Y, 0]} colliders={false}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.22, 0.06, 0.22]} />
          <meshStandardMaterial color="#2b2b2e" metalness={0.6} roughness={0.4} />
        </mesh>
      </RigidBody>

      {/* Rope (drawn each frame between the mount and the bag) */}
      <mesh ref={rope}>
        <meshStandardMaterial color="#c9b38a" roughness={0.9} />
      </mesh>

      {/* The bag */}
      <RigidBody ref={bag} position={[x, BAG_Y, 0]} colliders={false} linearDamping={0.25} angularDamping={0.9}>
        <CylinderCollider args={[TOP, BAG_RADIUS]} mass={BAG_MASS} collisionGroups={NO_CONTACTS} />
        <group
          ref={body}
          onPointerDown={punch}
          onPointerMove={() => (document.body.style.cursor = "pointer")}
          onPointerOut={() => (document.body.style.cursor = "")}
        >
          <mesh castShadow geometry={geometry}>
            <meshPhysicalMaterial map={leather} roughness={0.55} clearcoat={0.3} clearcoatRoughness={0.45} />
          </mesh>
          {/* Straps from the top of the bag to the rope */}
          {straps.map((st, k) => (
            <mesh key={k} position={st.position} quaternion={st.quaternion}>
              <boxGeometry args={[0.03, st.length, 0.008]} />
              <meshStandardMaterial color="#161616" roughness={0.8} />
            </mesh>
          ))}
          <mesh position={[0, TOP + STRAP_RISE, 0]}>
            <torusGeometry args={[0.035, 0.009, 8, 20]} />
            <meshStandardMaterial color="#b9bcc2" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      </RigidBody>

      <Billboard>
        <mesh ref={ring} visible={false}>
          <ringGeometry args={[0.08, 0.11, 40]} />
          <meshBasicMaterial color="#ff7a3d" transparent depthWrite={false} />
        </mesh>
      </Billboard>
    </>
  );
}

/** Every bag, placed at its share `at` of the canvas width, plus the camera shake. */
function Scene({ at, onPunch, pointerSpeed }: { at: number[]; onPunch: (power: number) => void; pointerSpeed: () => number }) {
  const { camera, size } = useThree();
  const lastHit = useRef<{ at: number; power: number } | null>(null);
  // Visible width at the bags' depth, from the field of view: bags at share a of the
  // canvas hang at world x = (a - 0.5) * width.
  const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
  const width = 2 * CAMERA_Z * Math.tan(fov / 2) * (size.width / size.height);
  const xs = at.map((a) => (a - 0.5) * width);
  const measured = size.width > 0 && size.height > 0;

  useFrame((state) => {
    const h = lastHit.current;
    const t = h ? (performance.now() - h.at) / 1000 : 99;
    const shake = h ? 0.025 * h.power * Math.exp(-t * 18) : 0;
    state.camera.position.x = Math.sin(t * 90) * shake;
    state.camera.position.y = 1.25 + Math.cos(t * 75) * shake;
  });

  // Before the canvas has a size the bags' positions aren't numbers yet: wait for it.
  if (!measured) return null;
  return (
    // Re-created on resize, so the bags (fixed in the physics world) move with the layout.
    <Physics key={xs.map((x) => x.toFixed(2)).join()} gravity={[0, -9.81, 0]}>
      {xs.map((x, i) => (
        <Bag
          key={i}
          x={x}
          pointerSpeed={pointerSpeed}
          onPunch={(power) => {
            lastHit.current = { at: performance.now(), power };
            onPunch(power);
          }}
        />
      ))}
    </Physics>
  );
}

/** Heavy bags in front of `eventSource`, hanging at the given shares of its width. */
export default function HeavyBag({ eventSource, at }: { eventSource: RefObject<HTMLElement | null>; at: number[] }) {
  const [punched, setPunched] = useState(false);
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(true);
  // Recent pointer positions, to measure how fast the pointer was moving into a punch.
  const trail = useRef<{ x: number; y: number; t: number }[]>([]);

  useEffect(() => {
    const el = eventSource.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      trail.current.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (trail.current.length > 12) trail.current.shift();
    };
    el.addEventListener("pointermove", move);
    return () => {
      el.removeEventListener("pointermove", move);
      document.body.style.cursor = "";
    };
  }, [eventSource]);

  const pointerSpeed = () => {
    const now = performance.now();
    const recent = trail.current.filter((p) => now - p.t < 90);
    if (recent.length < 2) return 0;
    const a = recent[0]!;
    const b = recent[recent.length - 1]!;
    return (Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.t - a.t)) * 1000; // px/s
  };

  return (
    <>
      {/* Fades in once the scene is up, rather than popping in. */}
      <Box
        pos="absolute"
        inset={0}
        // In front of the section's content (z-index 1), under its ticker (3).
        style={{ zIndex: 2, pointerEvents: "none", opacity: ready ? 1 : 0, transition: "opacity 0.8s ease-out" }}
        aria-hidden
      >
        <Canvas
          shadows
          eventSource={eventSource as RefObject<HTMLElement>}
          // Measure on resize only. With scroll tracking on, the measuring waits for scrolling
          // to pause for 50 ms; the upcoming-fights ticker scrolls every frame, so the canvas
          // never got its size and the bags only appeared once the tab was hidden.
          resize={{ scroll: false }}
          style={{ pointerEvents: "none" }}
          camera={{ position: [0, 1.25, CAMERA_Z], fov: 34 }}
          onCreated={({ camera, setEvents }) => {
            camera.lookAt(0, 1.2, 0);
            // Pointer position from the canvas's live position, so punches land right however
            // far the page is scrolled (the size above isn't updated on scroll).
            setEvents({
              compute: (event, state) => {
                const r = state.gl.domElement.getBoundingClientRect();
                state.pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
                state.raycaster.setFromCamera(state.pointer, state.camera);
              },
            });
            setReady(true);
          }}
        >
          <ambientLight intensity={0.5} />
          <spotLight position={[0, 6, 4]} angle={0.9} penumbra={0.7} intensity={90} castShadow />
          <pointLight position={[0, 1.5, 3]} intensity={6} color="#ff8c5a" />
          {/* The physics engine suspends while it starts up. Catch that here, inside the
              scene: if it reached the page's Suspense boundary, React would hide this canvas
              (size 0 x 0) and the canvas would wait for a size that never came. */}
          <Suspense fallback={null}>
            <Scene
              at={at}
              pointerSpeed={pointerSpeed}
              onPunch={(power) => {
                setPunched(true);
                if (sound) thud(power);
              }}
            />
          </Suspense>
        </Canvas>
      </Box>

      {/* Under the right-most bag: a hint until the first punch, and the sound toggle. */}
      <Group
        pos="absolute"
        bottom={12}
        style={{ zIndex: 2, left: `${Math.max(...at) * 100}%`, transform: "translateX(-50%)" }}
        gap={6}
        wrap="nowrap"
      >
        {!punched && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            Punch the bag
          </Text>
        )}
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={() => setSound((s) => !s)}
          aria-label={sound ? "Mute punches" : "Unmute punches"}
        >
          <SpeakerIcon muted={!sound} />
        </ActionIcon>
      </Group>
    </>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? <path d="m22 9-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
    </svg>
  );
}
