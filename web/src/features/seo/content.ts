// What search engines should find: a page per fighter, per upcoming card and per upcoming fight,
// plus an index of each. Pure functions over the site's data, used twice: at build time
// (scripts/route-previews.mjs writes each page as real HTML) and in the browser (SeoPage.tsx
// shows the same page inside the app).

import type { MmaMathData, PredictorData, PredictorFighter, StyleMapData, UpcomingCard, UpcomingFight } from "../../data/types";
import { headToHead, outcomes, winProb } from "../predictor/model";

export interface SeoData {
  predictor: PredictorData;
  mma: MmaMathData;
  styles: StyleMapData;
}

export interface Meta {
  path: string; // no slashes around it, e.g. "fighters/johnny-walker"
  title: string;
  description: string;
  jsonLd: Record<string, unknown>[];
}

export interface Link {
  path: string | null; // null: no page of ours to link to
  name: string;
}

export interface FightSummary {
  path: string;
  a: Link;
  b: Link;
  main: boolean;
  pick: { name: string; pct: number; source: "model" | "bookies"; method: string | null } | null;
}

export interface RecentRow {
  result: "W" | "L";
  opponent: Link;
  method: string;
  date: string;
}

export interface FighterPage {
  kind: "fighter";
  meta: Meta;
  name: string;
  intro: string;
  image: { url: string; creditUrl: string } | null;
  facts: { label: string; value: string }[];
  recent: RecentRow[];
  style: { name: string; description: string; traits: string[] } | null;
  similar: (Link & { similarity: number })[];
  next: { fight: string; opponent: string; card: string; date: string; chance: number | null } | null;
  id: string;
}

export interface CardPage {
  kind: "card";
  meta: Meta;
  name: string;
  date: string;
  city: string | null;
  intro: string;
  fights: FightSummary[];
}

export interface FightPage {
  kind: "fight";
  meta: Meta;
  title: string;
  intro: string;
  card: Link;
  date: string;
  a: Link;
  b: Link;
  model: { aPct: number; bPct: number; outcomes: { text: string; pct: number }[] } | null;
  market: { aPct: number; bPct: number } | null;
  tape: { label: string; a: string; b: string }[];
  history: { winner: string; method: string; date: string }[];
  predictorHref: string | null;
}

export interface IndexPage {
  kind: "index";
  meta: Meta;
  heading: string;
  intro: string;
  groups: { heading: string; links: { path: string; name: string; note?: string }[] }[];
}

export type SeoPageModel = FighterPage | CardPage | FightPage | IndexPage;

const SITE = "UFC Embedded";
const NOT_ADVICE = "Predictions are for fun, not betting advice.";

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const lastName = (name: string) => name.split(" ").at(-1)!;
const pct = (p: number) => Math.round(p * 100);
const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const recordText = (r: { wins: number; losses: number; draws: number }) => `${r.wins}-${r.losses}-${r.draws}`;
const METHOD_WORDS: Record<string, string> = { "KO/TKO": "KO/TKO", SUB: "submission", DEC: "decision" };
const methodWord = (m: string) => METHOD_WORDS[m] ?? m;

const fighterPath = (id: string) => `fighters/${id}`;
const cardName = (card: UpcomingCard) => card.name ?? `UFC card, ${longDate(card.date)}`;
/** "UFC 334" out of "UFC 334: Gane vs. Hokit"; the whole name when there's no colon. */
const shortCard = (name: string) => name.split(":")[0]!;
export const cardPath = (card: UpcomingCard) => `cards/${slug(card.name ?? `ufc-card-${card.date}`)}`;
const fightKey = (f: UpcomingFight) => `${f.a ?? slug(f.a_name)}-vs-${f.b ?? slug(f.b_name)}`;
export const fightPath = (f: UpcomingFight) => `fights/${fightKey(f)}`;

const breadcrumbs = (siteUrl: string, trail: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [{ name: SITE, path: "" }, ...trail].map((t, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: t.name,
    item: t.path ? `${siteUrl}${t.path}/` : siteUrl,
  })),
});

interface Prediction {
  a: PredictorFighter | undefined;
  b: PredictorFighter | undefined;
  pA: number | null; // the model's P(A wins), when it knows both fighters
  method: string | null; // the likeliest way the likelier winner wins
}

function predict(d: SeoData, byId: Map<string, PredictorFighter>, f: UpcomingFight): Prediction {
  const a = f.a ? byId.get(f.a) : undefined;
  const b = f.b ? byId.get(f.b) : undefined;
  if (!a || !b) return { a, b, pA: null, method: null };
  const pA = winProb(d.predictor.win_model, a, b);
  const winner = pA >= 0.5 ? a : b;
  const top = outcomes(d.predictor, a, b).find((o) => o.winner.id === winner.id);
  return { a, b, pA, method: top?.method ?? null };
}

function summarise(d: SeoData, byId: Map<string, PredictorFighter>, f: UpcomingFight): FightSummary {
  const { pA, method } = predict(d, byId, f);
  const a: Link = { path: f.a && byId.has(f.a) ? fighterPath(f.a) : null, name: f.a_name };
  const b: Link = { path: f.b && byId.has(f.b) ? fighterPath(f.b) : null, name: f.b_name };
  let pick: FightSummary["pick"] = null;
  if (pA !== null) {
    pick = { name: pA >= 0.5 ? f.a_name : f.b_name, pct: pct(Math.max(pA, 1 - pA)), source: "model", method };
  } else if (f.p_market !== null) {
    pick = { name: f.p_market >= 0.5 ? f.a_name : f.b_name, pct: pct(Math.max(f.p_market, 1 - f.p_market)), source: "bookies", method: null };
  }
  return { path: fightPath(f), a, b, main: !!f.main, pick };
}

function rankText(f: PredictorFighter): string | null {
  if (f.champion) return `${f.champion} champion`;
  if (f.rank) return `#${f.rank} ${f.weight_class}`;
  return null;
}

/** Every page, keyed by path. */
export function buildPages(d: SeoData, siteUrl: string): Map<string, SeoPageModel> {
  const pages = new Map<string, SeoPageModel>();
  const add = (p: SeoPageModel) => pages.set(p.meta.path, p);
  const byId = new Map(d.predictor.fighters.map((f) => [f.id, f]));
  const styleById = new Map(d.styles.fighters.map((f) => [f.id, f]));
  const cards = d.predictor.upcoming ?? [];
  const mmaIndex = new Map(d.mma.fighters.map((f, i) => [f.id, i]));
  const namesakes = new Map<string, number>();
  for (const f of d.predictor.fighters) namesakes.set(f.name, (namesakes.get(f.name) ?? 0) + 1);

  // The next scheduled fight of each fighter.
  const nextFight = new Map<string, { card: UpcomingCard; fight: UpcomingFight; opponent: string; me: "a" | "b" }>();
  for (const card of cards) {
    for (const fight of card.fights) {
      if (fight.a && !nextFight.has(fight.a)) nextFight.set(fight.a, { card, fight, opponent: fight.b_name, me: "a" });
      if (fight.b && !nextFight.has(fight.b)) nextFight.set(fight.b, { card, fight, opponent: fight.a_name, me: "b" });
    }
  }

  for (const f of d.predictor.fighters) {
    const path = fighterPath(f.id);
    const style = styleById.get(f.id);
    const cluster = style ? d.styles.clusters.find((c) => c.id === style.cluster) : undefined;
    const traits = style
      ? d.styles.features
          .map((feature) => ({ label: feature.label, p: style.percentiles[feature.key] ?? 0 }))
          .filter((t) => t.p >= 0.8)
          .sort((x, y) => y.p - x.p)
          .slice(0, 4)
          .map((t) => t.label)
      : [];
    const me = mmaIndex.get(f.id);
    const recent: RecentRow[] =
      me === undefined
        ? []
        : d.mma.fights
            .filter(([w, l]) => w === me || l === me)
            .slice(-5)
            .reverse()
            .map(([w, l, date, method]) => {
              const other = d.mma.fighters[w === me ? l : w]!;
              return { result: w === me ? "W" : "L", opponent: { path: byId.has(other.id) ? fighterPath(other.id) : null, name: other.name }, method, date };
            });
    const upcoming = nextFight.get(f.id);
    let next: FighterPage["next"] = null;
    if (upcoming) {
      const { pA } = predict(d, byId, upcoming.fight);
      next = {
        fight: fightPath(upcoming.fight),
        opponent: upcoming.opponent,
        card: cardName(upcoming.card),
        date: upcoming.card.date,
        chance: pA === null ? null : pct(upcoming.me === "a" ? pA : 1 - pA),
      };
    }
    const record = recordText(f.record);
    const rank = rankText(f);
    const intro = [
      `${f.name} is a ${f.weight_class} UFC fighter with a professional record of ${record}${rank ? `, currently ${f.champion ? "the" : "ranked"} ${rank}` : ""}.`,
      `Rated ${f.elo} on our Elo ladder, replayed from every UFC fight since 1994.`,
      cluster ? `By fighting style, ${lastName(f.name)} is one of the ${cluster.name.toLowerCase()}.` : "",
      next ? `Next up: ${next.opponent} at ${shortCard(next.card)} on ${longDate(next.date)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    // Namesakes (there are a few in UFC history) get their division, so titles stay unique.
    const label = namesakes.get(f.name)! > 1 ? `${f.name} (${f.weight_class})` : f.name;
    const title = `${label} UFC record, rating and next fight | ${SITE}`;
    const description = `${f.name}: ${record} record, ${rank ?? f.weight_class}, Elo ${f.elo}.${next ? ` Next fight: ${next.opponent}, ${shortCard(next.card)}.` : ""} Recent results, fighting style and similar fighters.`;
    add({
      kind: "fighter",
      id: f.id,
      name: f.name,
      intro,
      image: f.image ? { url: f.image.url, creditUrl: f.image.credit_url } : null,
      facts: [
        { label: "Record", value: record },
        { label: "Division", value: f.weight_class },
        ...(rank ? [{ label: "Rank", value: rank }] : []),
        { label: "Elo rating", value: String(f.elo) },
        { label: "Peak Elo", value: String(f.elo_peak) },
        { label: "Last fight", value: longDate(f.last_fight) },
      ],
      recent,
      style: cluster ? { name: cluster.name, description: cluster.description, traits } : null,
      similar: (style?.neighbours ?? []).slice(0, 5).flatMap((n) => {
        const other = styleById.get(n.id);
        return other ? [{ path: byId.has(n.id) ? fighterPath(n.id) : null, name: other.name, similarity: Math.round(n.similarity) }] : [];
      }),
      next,
      meta: {
        path,
        title,
        description,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Person",
            name: f.name,
            url: `${siteUrl}${path}/`,
            description: intro,
            jobTitle: "Mixed martial artist",
            ...(f.image ? { image: f.image.url } : {}),
          },
          breadcrumbs(siteUrl, [
            { name: "Fighters", path: "fighters" },
            { name: f.name, path },
          ]),
        ],
      },
    });
  }

  for (const card of cards) {
    const name = cardName(card);
    const short = shortCard(name);
    const path = cardPath(card);
    const fights = card.fights.map((f) => summarise(d, byId, f));
    const headline = fights.find((f) => f.main) ?? fights[0];
    const intro = [
      `Predictions for every announced fight at ${name}, on ${longDate(card.date)}${card.city ? ` in ${card.city}` : ""}.`,
      headline?.pick ? `In the main event our ${headline.pick.source === "model" ? "model" : "bookmakers' line"} favours ${headline.pick.name} at ${headline.pick.pct}%.` : "",
      NOT_ADVICE,
    ]
      .filter(Boolean)
      .join(" ");
    add({
      kind: "card",
      name,
      date: card.date,
      city: card.city ?? null,
      intro,
      fights,
      meta: {
        path,
        title: `${short} predictions and picks: ${name.includes(":") ? `${name.split(": ")[1]}, ` : ""}full card | ${SITE}`,
        description: `${short} predictions for all ${fights.length} announced fights on ${longDate(card.date)}: who our model picks, the win chance and the likeliest method.`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "SportsEvent",
            name,
            startDate: card.date,
            sport: "Mixed martial arts",
            eventStatus: "https://schema.org/EventScheduled",
            url: `${siteUrl}${path}/`,
            description: intro,
            ...(card.city ? { location: { "@type": "Place", name: card.city, address: card.city } } : {}),
          },
          breadcrumbs(siteUrl, [
            { name: "UFC cards", path: "cards" },
            { name: short, path },
          ]),
        ],
      },
    });

    for (const f of card.fights) {
      const fPath = fightPath(f);
      const { a, b, pA } = predict(d, byId, f);
      const titleText = `${f.a_name} vs ${f.b_name}`;
      const allOutcomes = a && b ? outcomes(d.predictor, a, b) : [];
      const market = f.p_market !== null ? { aPct: pct(f.p_market), bPct: 100 - pct(f.p_market) } : null;
      const history = a && b ? headToHead(d.mma, a.id, b.id) : [];
      const favourite = pA === null ? null : { name: pA >= 0.5 ? f.a_name : f.b_name, pct: pct(Math.max(pA, 1 - pA)) };
      const topOutcome = allOutcomes[0];
      const fIntro = [
        `${titleText} is ${f.main ? "the main event of" : "scheduled for"} ${name} on ${longDate(card.date)}${card.city ? ` in ${card.city}` : ""}.`,
        favourite
          ? `Our model picks ${favourite.name} with a ${favourite.pct}% chance of winning${topOutcome ? `; the likeliest ending is ${lastName(topOutcome.winner.name)} by ${methodWord(topOutcome.method)}` : ""}.`
          : "One of these fighters is new to the UFC, so our model has no prediction here.",
        market ? `The bookmakers give ${f.a_name} ${market.aPct}% and ${f.b_name} ${market.bPct}%.` : "",
        NOT_ADVICE,
      ]
        .filter(Boolean)
        .join(" ");
      const tape: FightPage["tape"] = [];
      if (a || b) {
        tape.push({ label: "Record", a: a ? recordText(a.record) : "–", b: b ? recordText(b.record) : "–" });
        tape.push({ label: "Elo rating", a: a ? String(a.elo) : "–", b: b ? String(b.elo) : "–" });
        tape.push({ label: "Rank", a: (a && rankText(a)) ?? "–", b: (b && rankText(b)) ?? "–" });
        tape.push({ label: "Division", a: a?.weight_class ?? "–", b: b?.weight_class ?? "–" });
      }
      add({
        kind: "fight",
        title: titleText,
        intro: fIntro,
        card: { path, name },
        date: card.date,
        a: { path: a ? fighterPath(a.id) : null, name: f.a_name },
        b: { path: b ? fighterPath(b.id) : null, name: f.b_name },
        model:
          pA === null
            ? null
            : {
                aPct: pct(pA),
                bPct: 100 - pct(pA),
                outcomes: allOutcomes.slice(0, 3).map((o) => ({ text: `${lastName(o.winner.name)} by ${methodWord(o.method)}`, pct: pct(o.p) })),
              },
        market,
        tape,
        history: history.map((h) => ({ winner: h.winnerId === a?.id ? f.a_name : f.b_name, method: h.method, date: h.date })),
        predictorHref: a && b ? `predictor?a=${a.id}&b=${b.id}` : null,
        meta: {
          path: fPath,
          title: `${titleText} prediction: who wins at ${short}? | ${SITE}`,
          description: favourite
            ? `${titleText} prediction: our model picks ${favourite.name} at ${favourite.pct}%. Win chance, likeliest method, odds and fighter records for ${short}.`
            : `${titleText} at ${short}: the bookmakers' odds, fighter records and how to play along.`,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "SportsEvent",
              name: `${titleText} at ${shortCard(name)}`,
              startDate: card.date,
              sport: "Mixed martial arts",
              eventStatus: "https://schema.org/EventScheduled",
              url: `${siteUrl}${fPath}/`,
              description: fIntro,
              competitor: [
                { "@type": "Person", name: f.a_name },
                { "@type": "Person", name: f.b_name },
              ],
              ...(card.city ? { location: { "@type": "Place", name: card.city, address: card.city } } : {}),
            },
            breadcrumbs(siteUrl, [
              { name: "UFC cards", path: "cards" },
              { name: short, path },
              { name: titleText, path: fPath },
            ]),
          ],
        },
      });
    }
  }

  const divisions = new Map<string, PredictorFighter[]>();
  for (const f of d.predictor.fighters) divisions.set(f.weight_class, [...(divisions.get(f.weight_class) ?? []), f]);
  add({
    kind: "index",
    heading: "UFC fighters",
    intro: `Records, Elo ratings, fighting styles and next fights for ${d.predictor.fighters.length} UFC fighters, by division.`,
    groups: [...divisions.entries()]
      .sort(([, x], [, y]) => y.length - x.length)
      .map(([heading, fighters]) => ({
        heading,
        links: [...fighters].sort((x, y) => y.elo - x.elo).map((f) => ({ path: fighterPath(f.id), name: f.name, note: recordText(f.record) })),
      })),
    meta: {
      path: "fighters",
      title: `All UFC fighters: records, ratings and styles | ${SITE}`,
      description: `Every UFC fighter by division: record, Elo rating, fighting style, recent results and next fight.`,
      jsonLd: [breadcrumbs(siteUrl, [{ name: "Fighters", path: "fighters" }])],
    },
  });
  add({
    kind: "index",
    heading: "Upcoming UFC cards",
    intro: `Predictions for every announced fight on the next UFC cards. ${NOT_ADVICE}`,
    groups: cards.map((card) => ({
      heading: `${cardName(card)} · ${longDate(card.date)}`,
      links: [{ path: cardPath(card), name: `${shortCard(cardName(card))} full card predictions` }, ...card.fights.map((f) => ({ path: fightPath(f), name: `${f.a_name} vs ${f.b_name}` }))],
    })),
    meta: {
      path: "cards",
      title: `UFC predictions: upcoming cards and picks | ${SITE}`,
      description: `Machine learning predictions for the next UFC cards: who wins each fight, the win chance and the likeliest method.`,
      jsonLd: [breadcrumbs(siteUrl, [{ name: "UFC cards", path: "cards" }])],
    },
  });
  return pages;
}
