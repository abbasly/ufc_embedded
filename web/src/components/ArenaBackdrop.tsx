import "./ArenaBackdrop.css";

/** A spotlit arena behind the whole page (ArenaBackdrop.css), with or without the cage fence. */
export function ArenaBackdrop({ fence = false }: { fence?: boolean }) {
  return <div className={fence ? "arena-bg with-fence" : "arena-bg"} aria-hidden />;
}
