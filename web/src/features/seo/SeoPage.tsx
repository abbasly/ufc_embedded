// A fighter, card, fight or index page inside the app. The same page is already on screen as
// static HTML when the site loads (see scripts/route-previews.mjs): it stays up until the data
// has arrived, so there's no flash of a spinner.

import { Stack } from "@mantine/core";
import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useMmaMath, usePredictor, useStyleMap } from "../../data/client";
import { NotFoundPage } from "../../pages/NotFoundPage";
import { FighterTradingCard } from "../predictor/FighterTradingCard";
import { SeoArticle } from "./Articles";
import { buildPages, type FighterPage } from "./content";
import { FightersIndex } from "./FightersIndex";
import { prerendered, prerenderedPath } from "./prerendered";
import { ShareFighter } from "./ShareFighter";

function FighterCard({ page }: { page: FighterPage }) {
  return (
    <Stack gap={10}>
      <FighterTradingCard id={page.id} />
      <ShareFighter page={page} />
    </Stack>
  );
}

export default function SeoPage() {
  const predictor = usePredictor();
  const mma = useMmaMath();
  const styles = useStyleMap();
  const location = useLocation();
  const base = import.meta.env.BASE_URL;
  const path = location.pathname.slice(1).replace(/\/$/, "").replace(base.slice(1), "");

  const pages = useMemo(
    () =>
      predictor.data && mma.data && styles.data
        ? buildPages({ predictor: predictor.data, mma: mma.data, styles: styles.data }, `${window.location.origin}${base}`)
        : null,
    [predictor.data, mma.data, styles.data, base],
  );
  const page = pages?.get(path);

  useEffect(() => {
    if (page) document.title = page.meta.title;
  }, [page]);

  if (!pages) {
    // Still loading: keep showing the static copy of this page, if that's what we have.
    return path === prerenderedPath && prerendered ? <div dangerouslySetInnerHTML={{ __html: prerendered }} /> : null;
  }
  if (page?.kind === "index" && page.meta.path === "fighters") return <FightersIndex page={page} />;
  return page ? <SeoArticle page={page} card={page.kind === "fighter" ? <FighterCard page={page} /> : undefined} /> : <NotFoundPage />;
}
