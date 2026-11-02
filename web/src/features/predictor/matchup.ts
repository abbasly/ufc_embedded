// Which matchups the predictor allows. The training data never has men against women or
// fighters more than one division apart, so the model can't say anything about those.

const MEN = [
  "Flyweight",
  "Bantamweight",
  "Featherweight",
  "Lightweight",
  "Welterweight",
  "Middleweight",
  "Light Heavyweight",
  "Heavyweight",
];
const WOMEN = ["Women's Strawweight", "Women's Flyweight", "Women's Bantamweight", "Women's Featherweight"];

function place(weightClass: string): { women: boolean; i: number } | null {
  const men = MEN.indexOf(weightClass);
  if (men >= 0) return { women: false, i: men };
  const women = WOMEN.indexOf(weightClass);
  return women >= 0 ? { women: true, i: women } : null;
}

/** Same gender and at most one division apart. A fighter with only catchweight bouts (no
 * known division) is never paired with someone who has one, since even gender is unknown. */
export function canFight(a: string, b: string): boolean {
  const x = place(a);
  const y = place(b);
  if (!x || !y) return !x && !y;
  return x.women === y.women && Math.abs(x.i - y.i) <= 1;
}

/** A sensible opponent for `a` from `pool` (in display order): their own division first. */
export function defaultOpponent<F extends { id: string; weight_class: string }>(a: F, pool: F[]): F | undefined {
  const others = pool.filter((f) => f.id !== a.id && canFight(a.weight_class, f.weight_class));
  return others.find((f) => f.weight_class === a.weight_class) ?? others[0];
}
