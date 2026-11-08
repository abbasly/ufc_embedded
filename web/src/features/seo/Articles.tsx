// The pages search engines read (fighters, cards, fights, indexes), in plain HTML with no app
// dependencies, so the same components can be turned into static files at build time
// (scripts/route-previews.mjs) and shown inside the app (SeoPage.tsx). Links are ordinary links:
// every one of these pages exists as its own file.

import type { ReactNode } from "react";

import type { CardPage, FighterPage, FightPage, IndexPage, Link, SeoPageModel } from "./content";

const base = import.meta.env.BASE_URL;
const href = (path: string) => `${base}${path}/`;
const dateText = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function Name({ link }: { link: Link }) {
  return link.path ? <a href={href(link.path)}>{link.name}</a> : <>{link.name}</>;
}

function Crumbs({ trail }: { trail: { name: string; path: string | null }[] }) {
  return (
    <nav className="seo-crumbs" aria-label="Breadcrumb">
      <a href={base}>Home</a>
      {trail.map((t) => (
        <span key={t.name}>
          {" / "}
          {t.path ? <a href={href(t.path)}>{t.name}</a> : t.name}
        </span>
      ))}
    </nav>
  );
}

function Fighter({ page, card }: { page: FighterPage; card?: ReactNode }) {
  return (
    <>
      <Crumbs trail={[{ name: "Fighters", path: "fighters" }, { name: page.name, path: null }]} />
      <div className="seo-profile">
        <div>
          <header className="seo-head">
            <div>
              <h1>{page.name}</h1>
              <p>{page.intro}</p>
            </div>
          </header>
          <dl className="seo-facts">
            {page.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* In the static page the photo holds the card's place, so nothing jumps when it arrives. */}
        <div className="seo-card">{card ?? (page.image && <img className="seo-card-photo" src={page.image.url} alt={page.name} width={300} height={150} loading="eager" />)}</div>
      </div>
      {page.next && (
        <section>
          <h2>Next fight</h2>
          <p>
            <a href={href(page.next.fight)}>
              vs {page.next.opponent}
            </a>{" "}
            at {page.next.card}, {dateText(page.next.date)}.
            {page.next.chance !== null && ` Our model gives ${page.name} a ${page.next.chance}% chance.`}
          </p>
        </section>
      )}
      {page.recent.length > 0 && (
        <section>
          <h2>Recent UFC results</h2>
          <ul className="seo-list">
            {page.recent.map((r) => (
              <li key={`${r.date}${r.opponent.name}`}>
                <span className="seo-result" data-result={r.result}>
                  {r.result === "W" ? "Win" : "Loss"}
                </span>{" "}
                vs <Name link={r.opponent} /> · {r.method} · {dateText(r.date)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {page.style && (
        <section>
          <h2>Fighting style: {page.style.name}</h2>
          <p>{page.style.description}</p>
          {page.style.traits.length > 0 && <p>Stands out for: {page.style.traits.join(", ").toLowerCase()}.</p>}
        </section>
      )}
      {page.similar.length > 0 && (
        <section>
          <h2>Most similar fighters</h2>
          <ul className="seo-list">
            {page.similar.map((s) => (
              <li key={s.name}>
                <Name link={s} /> · {s.similarity}/100
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="seo-links">
        <a href={`${base}style-map?fighter=${page.id}`}>See on the style map</a>
        <a href={`${base}predictor?a=${page.id}`}>Predict a fight</a>
      </p>
    </>
  );
}

function Card({ page }: { page: CardPage }) {
  return (
    <>
      <Crumbs trail={[{ name: "UFC cards", path: "cards" }, { name: page.name, path: null }]} />
      <header>
        <h1>{page.name} predictions</h1>
        <p>{page.intro}</p>
      </header>
      <section>
        <h2>The fights</h2>
        <ul className="seo-fights">
          {page.fights.map((f) => (
            <li key={f.path}>
              <a className="seo-fight-title" href={href(f.path)}>
                {f.a.name} vs {f.b.name}
              </a>
              {f.main && <span className="seo-main">Main event</span>}
              <p>
                {f.pick ? (
                  <>
                    <b>{f.pick.name}</b> {f.pick.pct}%{f.pick.method ? `, most likely by ${f.pick.method}` : ""} ({f.pick.source === "model" ? "our model" : "bookmakers"})
                  </>
                ) : (
                  "No prediction yet."
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <p className="seo-links">
        <a href={base}>Play Pick'em on this card</a>
      </p>
    </>
  );
}

function Odds({ label, a, b, aPct, bPct }: { label: string; a: string; b: string; aPct: number; bPct: number }) {
  return (
    <div className="seo-odds">
      <h3>{label}</h3>
      <p>
        {a} <b>{aPct}%</b> · {b} <b>{bPct}%</b>
      </p>
    </div>
  );
}

function Fight({ page }: { page: FightPage }) {
  return (
    <>
      <Crumbs trail={[{ name: "UFC cards", path: "cards" }, { name: page.card.name, path: page.card.path }, { name: page.title, path: null }]} />
      <header>
        <h1>{page.title} prediction</h1>
        <p>{page.intro}</p>
      </header>
      <section className="seo-odds-row">
        {page.model && <Odds label="Our model" a={page.a.name} b={page.b.name} aPct={page.model.aPct} bPct={page.model.bPct} />}
        {page.market && <Odds label="Bookmakers" a={page.a.name} b={page.b.name} aPct={page.market.aPct} bPct={page.market.bPct} />}
      </section>
      {page.model && (
        <section>
          <h2>Likeliest endings</h2>
          <ul className="seo-list">
            {page.model.outcomes.map((o) => (
              <li key={o.text}>
                {o.text} · {o.pct}%
              </li>
            ))}
          </ul>
        </section>
      )}
      {page.tape.length > 0 && (
        <section>
          <h2>Tale of the tape</h2>
          <table className="seo-tape">
            <thead>
              <tr>
                <th />
                <th>
                  <Name link={page.a} />
                </th>
                <th>
                  <Name link={page.b} />
                </th>
              </tr>
            </thead>
            <tbody>
              {page.tape.map((t) => (
                <tr key={t.label}>
                  <th scope="row">{t.label}</th>
                  <td>{t.a}</td>
                  <td>{t.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {page.history.length > 0 && (
        <section>
          <h2>Past meetings</h2>
          <ul className="seo-list">
            {page.history.map((h) => (
              <li key={h.date}>
                {h.winner} won by {h.method} · {dateText(h.date)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="seo-links">
        {page.predictorHref && <a href={`${base}${page.predictorHref}`}>Full prediction</a>}
        <a href={base}>Play Pick'em on this card</a>
      </p>
    </>
  );
}

function Index({ page, search }: { page: IndexPage; search?: ReactNode }) {
  return (
    <>
      <Crumbs trail={[{ name: page.heading, path: null }]} />
      <header>
        <h1>{page.heading}</h1>
        <p>{page.intro}</p>
      </header>
      {/* Empty in the static page: the space is kept, so the list doesn't jump when the box arrives. */}
      {page.meta.path === "fighters" && <div className="seo-search">{search}</div>}
      {page.groups.map((g) => (
        <section key={g.heading}>
          <h2>{g.heading}</h2>
          <ul className="seo-index">
            {g.links.map((l) => (
              <li key={l.path}>
                <a href={href(l.path)}>{l.name}</a>
                {l.note && <span> {l.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Inside the app: ``card`` is the fighter's trading card, ``search`` the box on the fighters list. */
export function SeoArticle({ page, card, search }: { page: SeoPageModel; card?: ReactNode; search?: ReactNode }) {
  return (
    <article className="seo-article">
      {page.kind === "fighter" && <Fighter page={page} card={card} />}
      {page.kind === "card" && <Card page={page} />}
      {page.kind === "fight" && <Fight page={page} />}
      {page.kind === "index" && <Index page={page} search={search} />}
      <footer>
        <a href={href("fighters")}>All UFC fighters</a> · <a href={href("cards")}>Upcoming UFC cards</a> · Unofficial fan project, not affiliated with the UFC.
      </footer>
    </article>
  );
}
