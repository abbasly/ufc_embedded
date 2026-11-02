// The most likely outcome, acted out: three judges' scorecards for a decision, three
// heavy impacts for a KO/TKO, and a closing choke with three taps for a submission.

import type { CSSProperties } from "react";

interface Props {
  method: string; // "KO/TKO" | "SUB" | "DEC"
  name: string;
  p: number;
  color: string; // the winner's corner colour, as a CSS colour
  delayMs: number; // start once the win-chance bar has filled
}

/** What a judge would write on the card: the surname, skipping suffixes like "Jr.". */
function surname(name: string): string {
  const parts = name.split(" ").filter((w) => !/^(jr\.?|sr\.?|ii|iii)$/i.test(w));
  return parts[parts.length - 1] ?? name;
}

export function OutcomeReveal({ method, name, p, color, delayMs }: Props) {
  const kind = method === "KO/TKO" ? "ko" : method === "SUB" ? "sub" : "dec";
  const style = { "--accent": color, "--reveal-delay": `${delayMs}ms` } as CSSProperties;
  const chance = `${Math.round(p * 100)}% chance`;

  if (kind === "dec") {
    return (
      <div className={`outcome outcome-dec`} style={style}>
        <div className="outcome-label">The judges' scorecards</div>
        <div className="scorecards">
          {[1, 2, 3].map((i) => (
            <div key={i} className="scorecard" style={{ "--i": i } as CSSProperties}>
              <div className="scorecard-judge">Judge {i}</div>
              <div className="scorecard-name">{surname(name)}</div>
            </div>
          ))}
        </div>
        <div className="outcome-name">{name}</div>
        <div className="outcome-after">
          <div className="outcome-method">wins by decision</div>
          <div className="outcome-p">{chance}</div>
        </div>
      </div>
    );
  }

  if (kind === "ko") {
    return (
      <div className="outcome outcome-ko" style={style}>
        <div className="outcome-label">Most likely ending</div>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`impact impact-${i}`} style={{ "--i": i } as CSSProperties} aria-hidden />
        ))}
        <div className="outcome-name">{name}</div>
        <div className="outcome-after">
          <div className="outcome-method">by KO / TKO</div>
          <div className="outcome-p">{chance}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="outcome outcome-sub" style={style}>
      <div className="outcome-label">Most likely ending</div>
      <div className="outcome-name">{name}</div>
      <div className="taps" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="tap" style={{ "--i": i } as CSSProperties}>
            TAP
          </span>
        ))}
      </div>
      <div className="outcome-after">
        <div className="outcome-method">by submission</div>
        <div className="outcome-p">{chance}</div>
      </div>
    </div>
  );
}
