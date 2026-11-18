// The loading mark: the logo (the cage graph), its fighters lighting up one after another
// round the cage, as if the graph were being searched. Same drawing as public/logo.svg
// (scripts/logo.py).

import "./LogoLoader.css";

const SIZES = [4.6, 2.8, 3.2, 6, 2.6, 3.8, 3, 2.6];
const CHORDS: [number, number][] = [
  [3, 0],
  [3, 5],
  [5, 0],
  [1, 5],
];
const V = SIZES.map((_, k) => {
  const a = ((22.5 + 45 * k) * Math.PI) / 180;
  return [32 + 25 * Math.cos(a), 32 + 25 * Math.sin(a)] as const;
});
const FENCE = V.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

export function LogoLoader({ size = 56, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <svg className="logo-loader" viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={label}>
      <polygon points={FENCE} className="logo-loader-fence" />
      {CHORDS.map(([a, b], i) => (
        <line key={i} x1={V[a]![0]} y1={V[a]![1]} x2={V[b]![0]} y2={V[b]![1]} className="logo-loader-chord" style={{ animationDelay: `${i * 0.25}s` }} />
      ))}
      {V.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={SIZES[i]}
          className="logo-loader-node"
          data-red={i === 3 || undefined}
          // Clockwise from the red one, an eighth of the turn apart.
          style={{ animationDelay: `${(((i - 3 + 8) % 8) * 0.12).toFixed(2)}s`, transformOrigin: `${x}px ${y}px` }}
        />
      ))}
    </svg>
  );
}

/** The loader, centred in a tall space: what a page shows while its first data comes in. */
export function PageLoader() {
  return (
    <div className="page-loader">
      <LogoLoader />
    </div>
  );
}
