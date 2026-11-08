// A fighter, card, fight or index page inside the app. The same page is already on screen as
// static HTML when the site loads (see scripts/route-previews.mjs): it stays up until the data
// has arrived, so there's no flash of a spinner.

import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useMmaMath, usePredictor, useStyleMap } from "../../data/client";
import { NotFoundPage } from "../../pages/NotFoundPage";
import { FighterTradingCard } from "../predictor/FighterTradingCard";
import { SeoArticle } from "./Articles";
import { buildPages } from "./content";
import { prerendered, prerenderedPath } from "./prerendered";

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
  return page ? <SeoArticle page={page} card={page.kind === "fighter" ? <FighterTradingCard id={page.id} /> : undefined} /> : <NotFoundPage />;
}
