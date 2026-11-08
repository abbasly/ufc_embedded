// "Share" on a fighter's page: their trading card and numbers as an image, and a link back here.

import { captureCards } from "../share/captureCards";
import { fighterImage } from "../share/fighterImage";
import { ShareButton } from "../share/ShareButton";
import type { FighterPage } from "./content";

export function ShareFighter({ page }: { page: FighterPage }) {
  return (
    <ShareButton
      label={`Share ${page.name.split(" ").at(-1)}'s card`}
      fullWidth
      make={async () => {
        const cards = await captureCards(document, 1);
        return fighterImage({
          name: page.name,
          photo: page.image?.url,
          detail: page.stats.rank ?? page.stats.division,
          record: page.stats.record,
          elo: page.stats.elo,
          recent: page.recent.map((r) => r.result),
          next: page.next && { opponent: page.next.opponent, card: page.next.card, chance: page.next.chance },
          card: cards?.[0],
        });
      }}
      fileName={page.id}
      text={`${page.name}: ${page.stats.record}, rated ${page.stats.elo} on UFC Embedded.`}
      url={`${window.location.origin}${import.meta.env.BASE_URL}fighters/${page.id}/`}
    />
  );
}
