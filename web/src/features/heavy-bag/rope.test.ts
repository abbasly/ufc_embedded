import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { VerletRope } from "./rope";

const settle = (rope: VerletRope, start: THREE.Vector3, end: THREE.Vector3) => {
  for (let i = 0; i < 600; i++) rope.step(start, end, 1 / 120);
};

describe("verlet rope", () => {
  it("hangs straight when the bag pulls it taut", () => {
    const start = new THREE.Vector3(0, 2, 0);
    const end = new THREE.Vector3(0, 1.4, 0); // exactly the rope's length below
    const rope = new VerletRope(start, end, 0.6);
    settle(rope, start, end);
    for (const p of rope.points) expect(Math.abs(p.x)).toBeLessThan(1e-3);
  });

  it("sags below the straight line when slack", () => {
    const start = new THREE.Vector3(0, 2, 0);
    const end = new THREE.Vector3(0.3, 2, 0); // ends 0.3 m apart on a 0.6 m rope
    const rope = new VerletRope(start, end, 0.6);
    settle(rope, start, end);
    const mid = rope.points[Math.floor(rope.points.length / 2)]!;
    expect(mid.y).toBeLessThan(1.85);
  });

  it("never stretches beyond its length between pinned ends", () => {
    const start = new THREE.Vector3(0, 2, 0);
    const end = new THREE.Vector3(0.2, 1.45, 0);
    const rope = new VerletRope(start, end, 0.6);
    settle(rope, start, end);
    let length = 0;
    for (let i = 1; i < rope.points.length; i++) length += rope.points[i]!.distanceTo(rope.points[i - 1]!);
    expect(length).toBeLessThan(0.61);
  });
});
