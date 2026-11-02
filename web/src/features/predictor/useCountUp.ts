import { useEffect, useState } from "react";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Progress from 0 to 1 over `ms` with an ease-out, restarting whenever `key` changes. */
export function useCountUp(key: string, ms: number): number {
  const [t, setT] = useState(() => (reducedMotion() ? 1 : 0));
  useEffect(() => {
    if (reducedMotion()) {
      setT(1);
      return;
    }
    setT(0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const x = Math.min(1, (now - start) / ms);
      setT(1 - (1 - x) ** 3);
      if (x < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, ms]);
  return t;
}
