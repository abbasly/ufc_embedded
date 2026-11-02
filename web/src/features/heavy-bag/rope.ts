// The visible rope: a verlet rope (points pulled by gravity, kept at fixed spacing) pinned
// to the mount and to the bag. The physics joint carries the bag; this rope just moves like
// a real one, lagging and rippling when the bag is jerked and sagging when it goes slack.

import * as THREE from "three";

const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const DAMPING = 0.985; // share of velocity kept each step
const ITERATIONS = 20; // constraint passes per step: higher = stiffer rope

export class VerletRope {
  readonly points: THREE.Vector3[];
  private readonly previous: THREE.Vector3[];
  private readonly segment: number;

  constructor(start: THREE.Vector3, end: THREE.Vector3, length: number, count = 12) {
    this.segment = length / (count - 1);
    this.points = Array.from({ length: count }, (_, i) => start.clone().lerp(end, i / (count - 1)));
    this.previous = this.points.map((p) => p.clone());
  }

  /** Advance by dt seconds with both ends pinned. */
  step(start: THREE.Vector3, end: THREE.Vector3, dt: number) {
    const n = this.points.length;
    const gravity = GRAVITY.clone().multiplyScalar(dt * dt);
    const velocity = new THREE.Vector3();
    for (let i = 1; i < n - 1; i++) {
      const p = this.points[i]!;
      velocity.subVectors(p, this.previous[i]!).multiplyScalar(DAMPING);
      this.previous[i]!.copy(p);
      p.add(velocity).add(gravity);
    }
    const delta = new THREE.Vector3();
    for (let k = 0; k < ITERATIONS; k++) {
      this.points[0]!.copy(start);
      this.points[n - 1]!.copy(end);
      for (let i = 0; i < n - 1; i++) {
        const a = this.points[i]!;
        const b = this.points[i + 1]!;
        delta.subVectors(b, a);
        const dist = delta.length() || 1e-6;
        // Only pull points together (a rope can go slack, it can't push).
        if (dist <= this.segment) continue;
        const fix = delta.multiplyScalar((dist - this.segment) / dist / 2);
        if (i > 0) a.add(fix);
        if (i + 1 < n - 1) b.sub(fix);
      }
    }
  }
}
