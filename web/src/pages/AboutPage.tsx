import "./About.css";

import { Anchor, Container, Text } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { type CSSProperties, Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { type RecentVisits, recentVisits } from "../app/visits";

const REPO = "https://github.com/abbasly/ufc_embedded";

interface FlowItem {
  title: string;
  text: string;
  to?: string;
}

// How the site fits together: where the data comes from, what the Python side does with it,
// and the pages that come out.
const FLOW: { label: string; hint?: string; core?: boolean; items: FlowItem[] }[] = [
  {
    label: "Data",
    items: [
      { title: "UFCStats", text: "Every fight since 1994, round by round" },
      { title: "Betting odds", text: "Past fights and upcoming cards" },
      { title: "Official rankings", text: "Champions and top 15s" },
      { title: "Wikipedia", text: "Photos and scheduled events" },
    ],
  },
  {
    label: "Python pipeline",
    core: true,
    items: [
      { title: "Point-in-time features", text: "Only fights before the one in question" },
      { title: "Style embedding", text: "14 stats, shrunk and stability-weighted" },
      { title: "Ratings", text: "Elo and Glicko, fight by fight" },
      { title: "Fight models", text: "Who wins, and how" },
      { title: "Win graph", text: "Who beat whom" },
    ],
  },
  {
    label: "On the site",
    hint: "open one",
    // Same order as the navigation bar.
    items: [
      { title: "Style Map", text: "Fighters in 3D by how they fight", to: "/style-map" },
      { title: "Fight Predictor", text: "Win chance and how it ends", to: "/predictor" },
      { title: "Elo Ladder", text: "Chess-style ratings vs official ranks", to: "/ladder" },
      { title: "MMA Math", text: "Anyone beats anyone, in circles", to: "/mma-math" },
    ],
  },
];

const STATS = [
  { value: 9000, prefix: "~", suffix: "", label: "UFC fights" },
  { value: 2700, prefix: "", suffix: "+", label: "fighters" },
  { value: 790, prefix: "", suffix: "+", label: "events" },
  { value: 1994, prefix: "", suffix: "", label: "back to UFC 1", year: true },
];

/** Staggered entrance: element ``i`` of the page comes in ``i`` steps after the first. */
const step = (i: number) => ({ "--i": i }) as CSSProperties;

/** Counts up from 0 once the page has come in. A year instead counts back from this year,
 * rolling back through time to it (2026, 2025 ... 1994). */
function CountUp({ to, start, year }: { to: number; start: number; year?: boolean }) {
  const reduceMotion = useReducedMotion();
  const from = year ? new Date().getFullYear() : 0;
  const [n, setN] = useState(reduceMotion ? to : from);
  useEffect(() => {
    // No animation: show the number itself. (The reduced-motion setting can arrive after the
    // first render, so this also replaces a count that had already started.)
    if (reduceMotion) {
      setN(to);
      return;
    }
    let frame = 0;
    const t0 = performance.now() + start;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / 1100));
      setN(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, from, start, reduceMotion]);
  return <>{year ? n : n.toLocaleString("en-US")}</>;
}

/** "1,234 visits in the last 7 days" (Cloudflare Web Analytics); nothing while loading or
 * when the count is off. */
function Visits({ i }: { i: number }) {
  const [visits, setVisits] = useState<RecentVisits | null>(null);
  const pageShown = useRef(performance.now()); // when the About page itself appeared
  useEffect(() => {
    let live = true;
    recentVisits().then((v) => live && setVisits(v));
    return () => {
      live = false;
    };
  }, []);
  if (visits === null) return null;
  // Come in at this line's turn in the page's entrance, or right away if the count arrived
  // after that; start counting as it fades in, so the count-up is actually seen.
  const wait = Math.max(0, i * 55 - (performance.now() - pageShown.current));
  return (
    <div className="visits reveal" style={{ animationDelay: `${wait}ms` }}>
      <span className="visits-dot" aria-hidden />
      <b>
        <CountUp to={visits.visits} start={wait + 250} />
      </b>{" "}
      visits in the last {visits.days} days
    </div>
  );
}

/** Data -> pipeline -> pages, in three columns joined by rails (stacked on phones). */
function HowItFits({ first }: { first: number }) {
  let i = first;
  return (
    <div className="flow" role="list" aria-label="How the site is built">
      {FLOW.map((col, c) => (
        <Fragment key={col.label}>
          {c > 0 && <div className="flow-rail reveal" style={step(i++)} aria-hidden />}
          <div className={`flow-col${col.core ? " flow-core" : ""}`} role="listitem">
            <div className="flow-label reveal" style={step(i++)}>
              {col.label}
              {col.hint && <span className="flow-hint"> · {col.hint}</span>}
            </div>
            {col.items.map((item) =>
              item.to ? (
                <Link key={item.title} to={item.to} className="flow-item flow-link reveal" style={step(i++)}>
                  <div>
                    <b>{item.title}</b>
                    <span>{item.text}</span>
                  </div>
                  <span className="flow-arrow" aria-hidden>
                    →
                  </span>
                </Link>
              ) : (
                <div key={item.title} className="flow-item reveal" style={step(i++)}>
                  <b>{item.title}</b>
                  <span>{item.text}</span>
                </div>
              ),
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** GitHub's mark (Octicons "mark-github"). */
function GitHubMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

export function AboutPage() {
  const flowStart = 1;
  const statsStart = flowStart + 18; // after the diagram's labels, rails and items
  return (
    // Everything but the disclaimer fits on one laptop screen, so there's no big title.
    <Container size="md" py="lg" className="about">
      <Text size="lg" fw={500} className="about-lead reveal" style={step(0)}>
        A personal machine learning project: <b>three decades of UFC fights</b>, turned into
        interactive models.
      </Text>

      <div className="about-section">
        <HowItFits first={flowStart} />
      </div>

      <div className="about-stats">
        {STATS.map((s, k) => (
          <div key={s.label} className="reveal" style={step(statsStart + k)}>
            <b>
              {s.prefix}
              <CountUp to={s.value} start={(statsStart + k) * 70} year={s.year} />
              {s.suffix}
            </b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="credit reveal" style={step(statsStart + 4)}>
        <img
          className="credit-photo"
          src={`${import.meta.env.BASE_URL}anar-taekwondo.jpg`}
          alt="Anar as a kid, doing the splits in a taekwondo uniform"
          title="Me, doing taekwondo as a kid"
          width={112}
          height={86}
        />
        <div className="credit-text">
          <Text fw={700}>
            Made by Anar Abbasli
          </Text>
          <Text size="sm" c="dimmed">
            Full-time student, part-time fight fan.
          </Text>
        </div>
        <a className="github-button" href={REPO} target="_blank" rel="noreferrer">
          <GitHubMark />
          <span>
            abbasly/ufc_embedded <small>on GitHub</small>
          </span>
        </a>
      </div>

      <Visits i={statsStart + 5} />

      <div className="disclaimer reveal" style={step(statsStart + 5)}>
        <Text size="sm" fw={600}>
          Not an official UFC product.
        </Text>
        <Text size="xs" c="dimmed">
          UFC Embedded is an independent fan project. It is not affiliated with, endorsed or
          sponsored by the UFC, Zuffa or TKO Group; UFC and related marks belong to their owners.
          Predictions are for fun, not betting advice. Fighter photos from Wikimedia Commons /
          Wikipedia under free licences, credited on each fighter. How each model works is in the
          README on GitHub.{" "}
          <Anchor component={Link} to="/privacy" size="xs">
            Privacy
          </Anchor>
          {" · "}
          <Anchor component={Link} to="/impressum" size="xs">
            Impressum
          </Anchor>
        </Text>
      </div>
    </Container>
  );
}
